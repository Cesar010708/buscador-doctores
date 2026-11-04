<?php
/**
 * POST /api/registro-doctor.php  { email, password, nombre, especialidad_slug? }
 *
 * Alta self-service con la fricción mínima: correo, contraseña y nombre. Todo lo
 * demás se completa después desde mi-perfil.html. Deja la sesión abierta para
 * que el doctor caiga directo en su onboarding.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/perfil.php';
require_once __DIR__ . '/auth-doctor.php';

sendCors('POST, OPTIONS');
requireMethod('POST');
requireSameOrigin();

if (!rateLimit('registro:' . clientIp(), LOGIN_RATE_MAX, LOGIN_RATE_WINDOW)) {
    jsonError('Demasiados intentos. Espera un minuto.', 429);
}

$body     = readJsonBody();
$email    = mb_strtolower(limpiarTexto($body['email'] ?? '', 160));
$password = is_string($body['password'] ?? null) ? $body['password'] : '';
$nombre   = limpiarTexto($body['nombre'] ?? '', 120);
$espSlug  = limpiarTexto($body['especialidad_slug'] ?? '', 80);

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonError('Escribe un correo válido.', 422);
}
if (mb_strlen($password) < 8) {
    jsonError('La contraseña debe tener al menos 8 caracteres.', 422);
}
if ($nombre === '') {
    jsonError('Escribe tu nombre como quieres que lo vean los pacientes.', 422);
}

try {
    $db = getDB();

    // Se comprueba sin filtrar por `activo`: el correo es único en la tabla y una
    // cuenta desactivada tampoco puede volver a darse de alta. El mensaje lo dice
    // tal cual, para que quien no pueda entrar sepa a qué atenerse.
    $stmt = $db->prepare('SELECT id, activo FROM ' . T_DOCTORES . ' WHERE email = ?');
    $stmt->execute([$email]);
    $existente = $stmt->fetch();
    if ($existente) {
        jsonError((int) $existente['activo'] === 1
            ? 'Ese correo ya tiene una cuenta. Inicia sesión.'
            : 'Ese correo ya está registrado, pero la cuenta está desactivada. Escríbenos para reactivarla.', 409);
    }

    // La especialidad es opcional en el alta, pero si viene tiene que existir.
    $especialidadId = null;
    if ($espSlug !== '') {
        $stmt = $db->prepare('SELECT id FROM ' . T_ESPECIALIDADES . ' WHERE slug = ? AND activo = 1');
        $stmt->execute([$espSlug]);
        $fila = $stmt->fetch();
        if ($fila) $especialidadId = (int) $fila['id'];
    }

    $perfilInicial = [
        'nombre'          => $nombre,
        'especialidad_id' => $especialidadId,
        'servicios'       => [],
        'ubicaciones'     => [],
    ];
    $completitud = calcularCompletitud($perfilInicial);

    $stmt = $db->prepare(
        'INSERT INTO ' . T_DOCTORES . ' (email, pass_hash, nombre, especialidad_id, completitud, nivel, activo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    );
    $stmt->execute([
        $email,
        password_hash($password, PASSWORD_DEFAULT),
        $nombre,
        $especialidadId,
        $completitud,
        nivelPorCompletitud($completitud),
        ahora(),
    ]);

    $id = (int) $db->lastInsertId();
    bdAbrirSesion($id, $email);

    jsonOut(['ok' => true, 'doctor' => ['id' => $id, 'email' => $email, 'nombre' => $nombre]]);

} catch (Throwable $e) {
    error_log('Buscador — registro-doctor: ' . $e->getMessage());
    jsonError('No pudimos crear tu cuenta. Intenta de nuevo.', 500);
}

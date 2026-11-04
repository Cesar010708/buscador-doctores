<?php
/**
 * POST /api/login-doctor.php  { email, password }
 * Inicio de sesion del doctor. Freno de fuerza bruta por IP y respuesta
 * deliberadamente ambigua: nunca se dice si el correo existe o no.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/auth-doctor.php';

sendCors('POST, OPTIONS');
requireMethod('POST');
requireSameOrigin();

if (!rateLimit('login-doc:' . clientIp(), LOGIN_RATE_MAX, LOGIN_RATE_WINDOW)) {
    jsonError('Demasiados intentos. Espera un minuto.', 429);
}

$body     = readJsonBody();
$email    = mb_strtolower(limpiarTexto($body['email'] ?? '', 160));
$password = is_string($body['password'] ?? null) ? $body['password'] : '';

if ($email === '' || $password === '') {
    jsonError('Escribe tu correo y tu contraseña.', 422);
}

try {
    $db   = getDB();
    $stmt = $db->prepare('SELECT id, email, nombre, pass_hash FROM ' . T_DOCTORES . ' WHERE email = ? AND activo = 1');
    $stmt->execute([$email]);
    $doctor = $stmt->fetch();

    if (!$doctor || !password_verify($password, $doctor['pass_hash'])) {
        jsonError('Correo o contraseña incorrectos.', 401);
    }

    bdAbrirSesion((int) $doctor['id'], $doctor['email']);

    jsonOut(['ok' => true, 'doctor' => [
        'id'     => (int) $doctor['id'],
        'email'  => $doctor['email'],
        'nombre' => $doctor['nombre'],
    ]]);

} catch (Throwable $e) {
    error_log('Buscador — login-doctor: ' . $e->getMessage());
    jsonError('No pudimos iniciar tu sesión. Intenta de nuevo.', 500);
}

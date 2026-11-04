<?php
/**
 * POST /api/registrar-eleccion.php  { busqueda_id, doctor_id, posicion }
 *
 * Se llama cuando el paciente abre o contacta a un doctor del resultado. Es la
 * mitad que falta de las métricas del médico: la bitácora dice cuántas veces
 * apareció y esto, cuántas veces lo eligieron. No guarda nada del paciente.
 */

require_once __DIR__ . '/_lib.php';

sendCors('POST, OPTIONS');
requireMethod('POST');

if (!rateLimit('eleccion:' . clientIp(), 60, 60)) {
    jsonError('Demasiadas peticiones. Espera un momento.', 429);
}

$body      = readJsonBody();
$doctorId  = (int) ($body['doctor_id'] ?? 0);
$busquedaId = isset($body['busqueda_id']) && $body['busqueda_id'] !== null ? (int) $body['busqueda_id'] : null;
$posicion  = max(0, min(99, (int) ($body['posicion'] ?? 0)));

if ($doctorId <= 0) {
    jsonError('Falta el doctor.', 422);
}

try {
    $db = getDB();

    // El doctor tiene que existir y estar activo: así no se ensucia la métrica.
    $stmt = $db->prepare('SELECT id FROM ' . T_DOCTORES . ' WHERE id = ? AND activo = 1');
    $stmt->execute([$doctorId]);
    if (!$stmt->fetch()) {
        jsonError('Ese perfil no está disponible.', 404);
    }

    if ($busquedaId !== null) {
        $stmt = $db->prepare('SELECT id FROM ' . T_BUSQUEDAS . ' WHERE id = ?');
        $stmt->execute([$busquedaId]);
        if (!$stmt->fetch()) $busquedaId = null;   // referencia vieja: se ignora
    }

    $stmt = $db->prepare(
        'INSERT INTO ' . T_ELECCIONES . ' (busqueda_id, doctor_id, posicion, created_at) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$busquedaId, $doctorId, $posicion, ahora()]);

    jsonOut(['ok' => true]);
} catch (Throwable $e) {
    error_log('Buscador — registrar-eleccion: ' . $e->getMessage());
    jsonError('No pudimos registrar la elección.', 500);
}

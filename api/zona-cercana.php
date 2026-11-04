<?php
/**
 * POST /api/zona-cercana.php   { lat, lng }
 * Traduce unas coordenadas al nombre de la zona del catálogo más cercana, para
 * poder decir "te ubico por Roma Norte" en vez de un par de números, y para
 * guardar la colonia del consultorio en texto legible.
 *
 * Solo lee el catálogo de zonas: no toca perfiles ni guarda nada.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/ranking.php';

sendCors('POST, OPTIONS');
requireMethod('POST');

if (!rateLimit('zona:' . clientIp(), 60, 60)) {
    jsonError('Demasiadas peticiones. Espera un momento.', 429);
}

$body = readJsonBody();
if (!isset($body['lat']) || !isset($body['lng']) || !is_numeric($body['lat']) || !is_numeric($body['lng'])) {
    jsonError('Faltan las coordenadas.', 422);
}

try {
    $zona = zonaDesdeCoordenadas((float) $body['lat'], (float) $body['lng']);
    if (!$zona) jsonError('Esas coordenadas no son válidas.', 422);

    jsonOut([
        'ok'             => true,
        'nombre'         => $zona['nombre'],
        'ciudad'         => $zona['ciudad'],
        'cp'             => $zona['cp'],
        'distancia_zona' => $zona['distancia_zona'],
        'lejos'          => $zona['lejos'],
    ]);
} catch (Throwable $e) {
    error_log('Buscador — zona-cercana: ' . $e->getMessage());
    jsonError('No pudimos ubicarte. Escribe tu colonia.', 500);
}

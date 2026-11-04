<?php
/**
 * GET /api/demanda.php
 * Prueba social REAL para la landing del doctor: cuantas busquedas hubo esta
 * semana, por especialidad y por zona. Solo agregados; cero datos del paciente.
 * Si no hay demanda, se devuelve vacio y la interfaz no muestra nada: no se le
 * promete a nadie una demanda que no existe.
 */

require_once __DIR__ . '/_lib.php';

sendCors('GET, OPTIONS');
requireMethod('GET');

if (!rateLimit('demanda:' . clientIp(), 60, 60)) {
    jsonError('Demasiadas peticiones. Espera un momento.', 429);
}

try {
    $db    = getDB();
    $desde = date('Y-m-d H:i:s', strtotime('-7 days'));   // calculado en PHP, no en MySQL

    $stmt = $db->prepare(
        'SELECT e.nombre, e.slug, COUNT(*) AS total
         FROM ' . T_BUSQUEDAS . ' b
         JOIN ' . T_ESPECIALIDADES . ' e ON e.id = b.especialidad_id
         WHERE b.created_at >= ?
         GROUP BY e.id, e.nombre, e.slug
         ORDER BY total DESC
         LIMIT 6'
    );
    $stmt->execute([$desde]);
    $porEspecialidad = array_map(fn($r) => [
        'nombre' => $r['nombre'],
        'slug'   => $r['slug'],
        'total'  => (int) $r['total'],
    ], $stmt->fetchAll());

    $stmt = $db->prepare(
        'SELECT z.nombre, COUNT(*) AS total
         FROM ' . T_BUSQUEDAS . ' b
         JOIN ' . T_ZONAS . ' z ON z.slug = b.zona_slug
         WHERE b.created_at >= ?
         GROUP BY z.id, z.nombre
         ORDER BY total DESC
         LIMIT 6'
    );
    $stmt->execute([$desde]);
    $porZona = array_map(fn($r) => ['nombre' => $r['nombre'], 'total' => (int) $r['total']], $stmt->fetchAll());

    $stmt = $db->prepare('SELECT COUNT(*) FROM ' . T_BUSQUEDAS . ' WHERE created_at >= ?');
    $stmt->execute([$desde]);

    jsonOut([
        'ok'              => true,
        'dias'            => 7,
        'total'           => (int) $stmt->fetchColumn(),
        'por_especialidad'=> $porEspecialidad,
        'por_zona'        => $porZona,
    ]);

} catch (Throwable $e) {
    error_log('Buscador — demanda: ' . $e->getMessage());
    jsonError('No pudimos cargar la demanda.', 500);
}

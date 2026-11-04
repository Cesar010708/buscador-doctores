<?php
/**
 * GET /api/catalogos.php
 * Especialidades, servicios y zonas para poblar el wizard del paciente y el
 * formulario del doctor. Solo lectura y sin datos sensibles.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/ranking.php';

sendCors('GET, OPTIONS');
requireMethod('GET');

if (!rateLimit('catalogos:' . clientIp(), 60, 60)) {
    jsonError('Demasiadas peticiones. Espera un momento.', 429);
}

try {
    $cat = catalogos();

    jsonOut([
        'ok'             => true,
        // Los motivos y las prioridades se definen en PHP (api/ranking.php) y se
        // publican aquí: la interfaz no vuelve a escribir ni una etiqueta.
        'motivos'        => array_map(fn($clave, $m) => [
            'clave'    => $clave,
            'etiqueta' => $m['etiqueta'],
            'apoyo'    => $m['apoyo'],
            'icono'    => $m['icono'],
            'pregunta' => $m['pregunta'],
            'ayuda'    => $m['ayuda'],
            'ejemplo'  => $m['ejemplo'],
        ], array_keys(BD_MOTIVOS), BD_MOTIVOS),
        'prioridades'    => array_map(fn($clave, $p) => [
            'clave'    => $clave,
            'etiqueta' => $p['etiqueta'],
        ], array_keys(BD_PRIORIDADES), BD_PRIORIDADES),
        'max_prioridades'=> BD_MAX_PRIORIDADES,
        'especialidades' => array_map(fn($e) => [
            'id'     => (int) $e['id'],
            'slug'   => $e['slug'],
            'nombre' => $e['nombre'],
        ], $cat['especialidades']),
        'servicios'      => array_map(fn($s) => [
            'id'              => (int) $s['id'],
            'slug'            => $s['slug'],
            'nombre'          => $s['nombre'],
            'especialidad_id' => (int) $s['especialidad_id'],
        ], $cat['servicios']),
        'zonas'          => array_map(fn($z) => [
            'slug'   => $z['slug'],
            'nombre' => $z['nombre'],
            'ciudad' => $z['ciudad'],
            'cp'     => $z['cp'],
        ], $cat['zonas']),
    ]);
} catch (Throwable $e) {
    error_log('Buscador — catalogos: ' . $e->getMessage());
    jsonError('No pudimos cargar los catálogos.', 500);
}

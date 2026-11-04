<?php
/**
 * GET /api/mi-perfil.php
 * Todo lo que necesita la pantalla del doctor: su perfil, el desglose de
 * completitud con el beneficio de cada dato, sus métricas reales y la demanda
 * de su especialidad. Requiere sesión.
 *
 * Las métricas y la "prueba social" salen de bd_busquedas / bd_elecciones. Si no
 * hay datos, se devuelven en cero y la interfaz NO muestra nada: no se le promete
 * demanda a nadie.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/perfil.php';
require_once __DIR__ . '/auth-doctor.php';
require_once __DIR__ . '/ranking.php';

sendCors('GET, OPTIONS');
requireMethod('GET');

$sesion = bdRequerirDoctor();

try {
    $db = getDB();
    $p  = cargarPerfil($sesion['id']);
    if (!$p) {
        bdCerrarSesion();
        jsonError('Tu cuenta ya no está disponible.', 404);
    }

    $reglas = reglasCompletitud($p);
    $desde  = date('Y-m-d H:i:s', strtotime('-7 days'));   // fecha calculada en PHP, no en MySQL

    // ── Métricas del doctor ─────────────────────────────────────────────
    $stmt = $db->prepare("SELECT COUNT(*) FROM " . T_BUSQUEDAS . " WHERE JSON_CONTAINS(JSON_EXTRACT(resultados, '$[*].id'), ?)");
    $stmt->execute([(string) $p['id']]);
    $aparicionesTotal = (int) $stmt->fetchColumn();

    $stmt = $db->prepare("SELECT COUNT(*) FROM " . T_BUSQUEDAS . " WHERE created_at >= ? AND JSON_CONTAINS(JSON_EXTRACT(resultados, '$[*].id'), ?)");
    $stmt->execute([$desde, (string) $p['id']]);
    $aparicionesSemana = (int) $stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM ' . T_ELECCIONES . ' WHERE doctor_id = ?');
    $stmt->execute([$p['id']]);
    $eleccionesTotal = (int) $stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM ' . T_ELECCIONES . ' WHERE doctor_id = ? AND created_at >= ?');
    $stmt->execute([$p['id'], $desde]);
    $eleccionesSemana = (int) $stmt->fetchColumn();

    // ── Demanda real de su especialidad (prueba social honesta) ─────────
    $demanda = ['especialidad' => 0, 'zona' => 0, 'zona_nombre' => null];
    if ($p['especialidad_id']) {
        $stmt = $db->prepare('SELECT COUNT(*) FROM ' . T_BUSQUEDAS . ' WHERE especialidad_id = ? AND created_at >= ?');
        $stmt->execute([$p['especialidad_id'], $desde]);
        $demanda['especialidad'] = (int) $stmt->fetchColumn();

        $colonia = $p['ubicaciones'][0]['colonia'] ?? null;
        if ($colonia) {
            $zona = resolverZona($colonia);
            if ($zona && !empty($zona['slug'])) {
                $stmt = $db->prepare('SELECT COUNT(*) FROM ' . T_BUSQUEDAS . ' WHERE especialidad_id = ? AND zona_slug = ? AND created_at >= ?');
                $stmt->execute([$p['especialidad_id'], $zona['slug'], $desde]);
                $demanda['zona']        = (int) $stmt->fetchColumn();
                $demanda['zona_nombre'] = $zona['nombre'];
            }
        }
    }

    // ── Servicios disponibles para su especialidad ──────────────────────
    $cat = catalogos();
    $serviciosEspecialidad = array_values(array_filter($cat['servicios'], function ($s) use ($p) {
        return $p['especialidad_id'] && (int) $s['especialidad_id'] === (int) $p['especialidad_id'];
    }));

    jsonOut([
        'ok'     => true,
        'perfil' => [
            'id'                => (int) $p['id'],
            'email'             => $p['email'],
            'nombre'            => $p['nombre'],
            'genero'            => $p['genero'],
            'telefono'          => $p['telefono'],
            'cedula'            => $p['cedula'],
            'cedula_archivo'    => $p['cedula_archivo'] ? true : false,
            'cedula_verificada' => (int) $p['cedula_verificada'] === 1,
            'especialidad_id'   => $p['especialidad_id'] !== null ? (int) $p['especialidad_id'] : null,
            'especialidad'      => $p['especialidad'],
            'anios_experiencia' => $p['anios_experiencia'] !== null ? (int) $p['anios_experiencia'] : null,
            'formacion'         => $p['formacion'],
            'certificaciones'   => $p['certificaciones'],
            'idiomas'           => $p['idiomas'],
            'atiende_ninos'     => (int) $p['atiende_ninos'] === 1,
            'atiende_adultos'   => (int) $p['atiende_adultos'] === 1,
            'modalidad'         => $p['modalidad'],
            'disponibilidad'    => $p['disponibilidad'],
            'precio_min'        => $p['precio_min'] !== null ? (int) $p['precio_min'] : null,
            'precio_max'        => $p['precio_max'] !== null ? (int) $p['precio_max'] : null,
            'bio'               => $p['bio'],
            'completitud'       => (int) $p['completitud'],
            'nivel'             => $p['nivel'],
            'servicios'         => array_map(fn($s) => (int) $s['id'], $p['servicios']),
            'ubicaciones'       => $p['ubicaciones'],
        ],
        'vista_paciente' => perfilPublico($p),
        'reglas'         => $reglas,
        'servicios_especialidad' => array_map(fn($s) => ['id' => (int) $s['id'], 'nombre' => $s['nombre']], $serviciosEspecialidad),
        'metricas'       => [
            'apariciones_semana' => $aparicionesSemana,
            'apariciones_total'  => $aparicionesTotal,
            'elecciones_semana'  => $eleccionesSemana,
            'elecciones_total'   => $eleccionesTotal,
        ],
        'demanda'        => $demanda,
    ]);

} catch (Throwable $e) {
    error_log('Buscador — mi-perfil: ' . $e->getMessage());
    jsonError('No pudimos cargar tu perfil.', 500);
}

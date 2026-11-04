<?php
/**
 * POST /api/buscar-doctores.php
 * ============================================================================
 * Recibe lo que contestó el paciente (wizard + texto libre) y devuelve los
 * doctores rankeados, sus sub-scores y las tarjetas de arquetipo con su "por qué".
 *
 *   intake  →  [IA: interpretar]  →  filtros duros  →  ranking determinista
 *                                                   →  arquetipos
 *                                                   →  [IA: redactar el porqué]
 *
 * El orden NUNCA lo decide la IA. Si OpenAI falla o está apagado, el endpoint
 * responde igual con las justificaciones de plantilla.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/ranking.php';
require_once __DIR__ . '/ia.php';

sendCors('POST, OPTIONS');
requireMethod('POST');

if (!rateLimit('buscar:' . clientIp(), BUSCAR_RATE_MAX, BUSCAR_RATE_WINDOW)) {
    jsonError('Demasiadas búsquedas seguidas. Espera un minuto.', 429);
}

$body = readJsonBody();

/** Solo se aceptan valores de la lista; cualquier otra cosa se ignora. */
function enumONull($valor, array $permitidos): ?string
{
    return (is_string($valor) && in_array($valor, $permitidos, true)) ? $valor : null;
}

/** Solo prioridades del catálogo, sin repetir y como mucho dos. */
function prioridadesValidas($valor): array
{
    if (!is_array($valor)) return [];
    $ok = array_values(array_unique(array_filter(
        array_map(fn($p) => is_string($p) ? $p : '', $valor),
        fn($p) => isset(BD_PRIORIDADES[$p])
    )));
    return array_slice($ok, 0, BD_MAX_PRIORIDADES);
}

$intake = [
    'motivo'                => enumONull($body['motivo'] ?? null, array_keys(BD_MOTIVOS)),
    'prioridades'           => prioridadesValidas($body['prioridades'] ?? null),
    'texto_libre'           => limpiarTexto($body['texto_libre'] ?? '', 500),
    'especialidad_slug'     => is_string($body['especialidad_slug'] ?? null) ? limpiarTexto($body['especialidad_slug'], 80)  : null,
    'servicio_slug'         => is_string($body['servicio_slug']     ?? null) ? limpiarTexto($body['servicio_slug'],     120) : null,
    'zona'                  => limpiarTexto($body['zona'] ?? '', 120),
    // Coordenadas del dispositivo, cuando la persona tocó "usar mi ubicación".
    'lat'                   => isset($body['lat']) && is_numeric($body['lat']) ? (float) $body['lat'] : null,
    'lng'                   => isset($body['lng']) && is_numeric($body['lng']) ? (float) $body['lng'] : null,
    'presupuesto'           => enumONull($body['presupuesto'] ?? null, ['economico', 'medio', 'sin_limite']),
    'modalidad'             => enumONull($body['modalidad']   ?? null, ['consultorio', 'hospital', 'telemedicina']),
    'genero'                => enumONull($body['genero']      ?? null, ['M', 'F']),
    'urgencia'              => enumONull($body['urgencia']    ?? null, ['hoy', 'esta_semana', 'sin_prisa']),
    'idioma'                => enumONull($body['idioma']      ?? null, ['es', 'en']),
    'para_nino'             => !empty($body['para_nino']),
    'genero_obligatorio'    => !empty($body['genero_obligatorio']),
    'modalidad_obligatoria' => !empty($body['modalidad_obligatoria']),
    'idioma_obligatorio'    => !empty($body['idioma_obligatorio']),
];

// El motivo trae lo que ya se da por sabido: quien entra por su hijo no tiene que
// volver a marcar "es para un menor". Nunca pisa lo que el paciente eligió a mano.
if ($intake['motivo']) {
    foreach (BD_MOTIVOS[$intake['motivo']]['aplica'] as $campo => $valor) {
        if ($campo === 'prioridades') {
            // Solo mientras el paciente no las haya tocado: si las dejó vacías a
            // propósito, el motivo no puede volver a imponerlas.
            if (!$intake['prioridades'] && empty($body['prioridades_tocadas'])) {
                $intake['prioridades'] = array_slice($valor, 0, BD_MAX_PRIORIDADES);
            }
        } elseif (empty($intake[$campo])) {
            $intake[$campo] = $valor;
        }
    }
}

if ($intake['texto_libre'] === '' && !$intake['especialidad_slug'] && !$intake['servicio_slug']) {
    jsonError('Cuéntanos qué necesitas para poder buscar.', 422);
}

try {
    // ── 1. La IA interpreta el texto libre (solo rellena huecos del wizard) ──
    $interpretacion = null;
    if ($intake['texto_libre'] !== '') {
        $interpretacion = iaInterpretar($intake['texto_libre']);
    }
    if ($interpretacion) {
        foreach (['especialidad_slug', 'servicio_slug', 'presupuesto', 'modalidad', 'genero', 'urgencia', 'idioma'] as $campo) {
            if (empty($intake[$campo]) && !empty($interpretacion[$campo])) {
                $intake[$campo] = $interpretacion[$campo];
            }
        }
        if ($intake['zona'] === '' && !empty($interpretacion['zona_texto'])) {
            $intake['zona'] = $interpretacion['zona_texto'];
        }
        if (!$intake['para_nino'] && ($interpretacion['para_nino'] ?? null) === true) {
            $intake['para_nino'] = true;
        }
        $intake['resumen_necesidad'] = $interpretacion['resumen_necesidad'] ?? null;
    }

    // ── 2. Anclar necesidad y zona a la taxonomía real ──────────────────────
    $necesidad = resolverNecesidad($intake['texto_libre'], $intake['especialidad_slug'], $intake['servicio_slug']);
    // Las coordenadas del dispositivo mandan: son más precisas que cualquier
    // colonia escrita. Si no las hay, se resuelve el texto; y si el campo vino
    // vacío, se busca la zona dentro de lo que escribió ("cerca de Polanco"),
    // que es además la red de seguridad cuando la IA está apagada.
    $zona = ($intake['lat'] !== null && $intake['lng'] !== null)
        ? zonaDesdeCoordenadas($intake['lat'], $intake['lng'])
        : null;
    if (!$zona) $zona = resolverZona($intake['zona']) ?: resolverZona($intake['texto_libre']);
    if ($zona && $intake['zona'] === '') $intake['zona'] = $zona['nombre'];
    $intake['zona_nombre'] = $zona['nombre'] ?? null;

    if (!$necesidad['especialidad']) {
        // Nada que buscar: se dice, no se inventa un doctor.
        jsonOut([
            'ok'           => true,
            'doctores'     => [],
            'arquetipos'   => [],
            'mensaje'      => 'No logramos identificar qué especialidad necesitas. Dilo con otras palabras o elige una de estas.',
            'sugerencias'  => array_map(fn($e) => ['slug' => $e['slug'], 'nombre' => $e['nombre']], catalogos()['especialidades']),
            'ia'           => iaDisponible(),
        ]);
    }

    // ── 3. Filtros duros + ranking determinista ─────────────────────────────
    $especialidadId = (int) $necesidad['especialidad']['id'];
    $docs = candidatos($intake, $especialidadId);

    if (!$docs) {
        // Antes de rendirse: se busca QUÉ filtro deja la lista vacía y se le dice
        // al paciente con nombre y apellido, en vez de un "no hay resultados" seco.
        $etiquetaFiltro = [
            'para_nino'             => 'que atienda niños',
            'genero_obligatorio'    => ($intake['genero'] === 'F' ? 'que sea mujer' : 'que sea hombre'),
            'modalidad_obligatoria' => 'la modalidad ' . $intake['modalidad'],
            'idioma_obligatorio'    => 'que hable ' . ($intake['idioma'] === 'en' ? 'inglés' : 'español'),
        ];

        $bloqueantes = [];
        foreach ($etiquetaFiltro as $clave => $texto) {
            if (empty($intake[$clave])) continue;
            $prueba = $intake;
            $prueba[$clave] = false;
            $n = count(candidatos($prueba, $especialidadId));
            if ($n > 0) $bloqueantes[] = ['clave' => $clave, 'texto' => $texto, 'resultados' => $n];
        }

        $nombreEsp = $necesidad['especialidad']['nombre'];
        if ($bloqueantes) {
            $opciones = array_map(fn($b) => "{$b['texto']} ({$b['resultados']} disponibles si lo quitas)", $bloqueantes);
            $mensaje  = "No hay ningún perfil de {$nombreEsp} que cumpla todo lo que pediste. "
                      . 'Lo que deja la lista vacía es el requisito de ' . implode(', y ', $opciones) . '.';
        } else {
            $mensaje = "Todavía no hay perfiles de {$nombreEsp} que cumplan lo que pediste en este directorio de prueba.";
        }

        jsonOut([
            'ok'                  => true,
            'doctores'            => [],
            'arquetipos'          => [],
            'necesidad'           => ['especialidad' => $nombreEsp, 'slug' => $necesidad['especialidad']['slug']],
            'mensaje'             => $mensaje,
            'filtros_bloqueantes' => $bloqueantes,
            'sugerencias'         => array_map(fn($e) => ['slug' => $e['slug'], 'nombre' => $e['nombre']], $necesidad['sugerencias']),
            'ia'                  => iaDisponible(),
        ]);
    }

    $lista = rankear($docs, $intake, $necesidad, $zona);
    $lista = array_slice($lista, 0, 12);
    $arqs  = arquetipos($lista, $zona !== null, $intake['modalidad'], $intake['prioridades']);

    // ── 4. La IA redacta el porqué de las tarjetas y de los primeros lugares ─
    $etiquetaPorDoctor = [];
    foreach ($arqs as $a) {
        $etiquetaPorDoctor[$a['doctor_id']] = $a['etiqueta'];
    }
    $idsAJustificar = array_unique(array_merge(
        array_column($arqs, 'doctor_id'),
        array_column(array_slice($lista, 0, 6), 'id')
    ));
    $paraIA = array_values(array_filter($lista, fn($d) => in_array($d['id'], $idsAJustificar, true)));

    $justificaciones = iaJustificaciones($intake, $paraIA, $etiquetaPorDoctor);

    $claveDeDoctor = [];
    foreach ($arqs as $a) $claveDeDoctor[$a['doctor_id']] = $a['clave'];

    foreach ($lista as &$d) {
        $d['justificacion'] = $justificaciones[$d['id']]
            ?? justificacionPlantilla($d, $claveDeDoctor[$d['id']] ?? null, $zona, $intake['prioridades']);
        $d['justificacion_ia'] = isset($justificaciones[$d['id']]);
    }
    unset($d);

    // Comparativa narrada de los primeros lugares: el intercambio real entre
    // ellos, que es lo que ayuda a decidir cuando dos opciones están parejas.
    $comparativa = iaComparativa($lista, $intake) ?: comparativaPlantilla($lista);

    $porId = [];
    foreach ($lista as $d) $porId[$d['id']] = $d;
    foreach ($arqs as &$a) {
        $a['justificacion'] = $porId[$a['doctor_id']]['justificacion'] ?? '';
        $a['nombre']        = $porId[$a['doctor_id']]['nombre'] ?? '';
    }
    unset($a);

    // ── 5. Bitácora (IP hasheada, sin datos del paciente) ───────────────────
    $busquedaId = null;
    try {
        $stmt = getDB()->prepare(
            'INSERT INTO ' . T_BUSQUEDAS . ' (intake, resultados, especialidad_id, zona_slug, num_resultados, ip_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        // Del intake NO se guarda lo que el paciente escribió con sus palabras:
        // puede contener datos de salud. Con los campos estructurados basta para
        // afinar el ranking, para la prueba social y para las métricas.
        $intakeGuardable = $intake;
        unset($intakeGuardable['texto_libre'], $intakeGuardable['resumen_necesidad']);

        $stmt->execute([
            json_encode($intakeGuardable, JSON_UNESCAPED_UNICODE),
            json_encode(array_map(fn($d, $i) => [
                'id'    => $d['id'],
                'score' => $d['score'],
                'pos'   => $i + 1,
            ], $lista, array_keys($lista)), JSON_UNESCAPED_UNICODE),
            $especialidadId,
            $zona['slug'] ?? null,
            count($lista),
            ipHash(),
            ahora(),
        ]);
        $busquedaId = (int) getDB()->lastInsertId();
    } catch (Throwable $e) {
        // La bitácora es secundaria: si falla, el paciente igual recibe su resultado.
        error_log('Buscador — no se pudo registrar la búsqueda: ' . $e->getMessage());
    }

    jsonOut([
        'ok'          => true,
        'busqueda_id' => $busquedaId,
        'necesidad'   => [
            'especialidad' => $necesidad['especialidad']['nombre'],
            'slug'         => $necesidad['especialidad']['slug'],
            'servicio'     => $necesidad['servicio']['nombre'] ?? null,
            'confianza'    => $necesidad['confianza'],
            'resumen'      => $intake['resumen_necesidad'] ?? null,
        ],
        'zona'        => $zona ? [
            'nombre'         => $zona['nombre'],
            'ciudad'         => $zona['ciudad'],
            'cp'             => $zona['cp'],
            'exacta'         => !empty($zona['exacta']),
            'distancia_zona' => $zona['distancia_zona'] ?? null,
            'lejos'          => !empty($zona['lejos']),
        ] : null,
        'motivo'      => $intake['motivo'],
        'prioridades' => $intake['prioridades'],
        'orden_por'   => frasePrioridades($intake['prioridades']),
        'arquetipos'  => $arqs,
        'comparativa' => $comparativa,
        'doctores'    => $lista,
        'ejes'        => BD_EJES_NOMBRE,
        'total'       => count($lista),
        'mensaje'     => null,
        'ia'          => iaDisponible(),
    ]);

} catch (Throwable $e) {
    error_log('Buscador — buscar-doctores: ' . $e->getMessage());
    jsonError('No pudimos completar la búsqueda. Intenta de nuevo en un momento.', 500);
}

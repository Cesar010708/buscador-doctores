<?php
/**
 * POST /api/interpretar.php   { texto, motivo? }
 * ============================================================================
 * Traduce lo que la persona escribió a CANDIDATOS de especialidad, no a una sola
 * respuesta. Es lo que le permite a la conversación repreguntar cuando el texto
 * es ambiguo, en vez de elegir por su cuenta y equivocarse en silencio.
 *
 * Combina las dos fuentes que ya existen:
 *   - el matcher determinista del catálogo (`puntuarEspecialidades`), que
 *     funciona siempre, también con la IA apagada;
 *   - la interpretación de OpenAI (`iaInterpretar`), que además extrae zona,
 *     presupuesto, urgencia y si es para un menor.
 *
 * La IA nunca añade especialidades: solo puede reforzar una que ya esté en el
 * catálogo. Lo que no encaja, se descarta.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/ranking.php';
require_once __DIR__ . '/ia.php';

sendCors('POST, OPTIONS');
requireMethod('POST');

if (!rateLimit('interpretar:' . clientIp(), BUSCAR_RATE_MAX, BUSCAR_RATE_WINDOW)) {
    jsonError('Demasiadas peticiones seguidas. Espera un momento.', 429);
}

$body   = readJsonBody();
$texto  = limpiarTexto($body['texto'] ?? '', 500);
$motivo = is_string($body['motivo'] ?? null) && isset(BD_MOTIVOS[$body['motivo']]) ? $body['motivo'] : null;

if ($texto === '') {
    jsonError('No recibimos nada que interpretar.', 422);
}

/** Cuánto pesa, sobre el marcador determinista, que la IA haya elegido una. */
const BD_REFUERZO_IA = 6.0;

try {
    $cat = catalogos();

    // ── 1. Marcador determinista ────────────────────────────────────────
    $marcador = puntuarEspecialidades($texto);
    $puntos   = $marcador['puntos'];

    // ── 2. La IA, si está encendida ─────────────────────────────────────
    $ia = iaInterpretar($texto);

    $servicioSlug = null;
    if ($ia && !empty($ia['especialidad_slug'])) {
        foreach ($cat['especialidades'] as $e) {
            if ($e['slug'] === $ia['especialidad_slug']) {
                // Refuerza, no impone: si el catálogo ya tenía una favorita con
                // mucha ventaja, la IA no la desbanca por sí sola.
                $puntos[(int) $e['id']] = ($puntos[(int) $e['id']] ?? 0) + BD_REFUERZO_IA;
            }
        }
        $servicioSlug = $ia['servicio_slug'] ?? null;
    }

    if (!$puntos) {
        jsonOut([
            'ok'          => true,
            'candidatos'  => [],
            'ambiguo'     => false,
            'reconocido'  => false,
            'sugerencias' => array_map(fn($e) => ['slug' => $e['slug'], 'nombre' => $e['nombre']], $cat['especialidades']),
            'ia'          => iaDisponible(),
        ]);
    }

    arsort($puntos);
    $total = array_sum($puntos);

    $candidatos = [];
    foreach (array_slice($puntos, 0, 3, true) as $id => $pts) {
        foreach ($cat['especialidades'] as $e) {
            if ((int) $e['id'] !== (int) $id) continue;
            $candidatos[] = [
                'slug'      => $e['slug'],
                'nombre'    => $e['nombre'],
                'confianza' => $total > 0 ? round($pts / $total, 2) : 0.0,
            ];
        }
    }

    // ── 3. ¿Hay que repreguntar? ────────────────────────────────────────
    // Dos señales: que la favorita no despunte, o que la segunda le pise los
    // talones. Cualquiera de las dos merece una pregunta de vuelta en vez de
    // una decisión a ciegas.
    $ambiguo = false;
    if (count($candidatos) >= 2) {
        $primera  = $candidatos[0]['confianza'];
        $segunda  = $candidatos[1]['confianza'];
        $ambiguo  = $primera < 0.55 || ($primera > 0 && $segunda / $primera > 0.7);
    }

    // El servicio concreto solo se conserva si pertenece a la especialidad ganadora.
    $servicio = null;
    if ($servicioSlug || $marcador['servicio']) {
        $slug = $servicioSlug ?: $marcador['servicio']['slug'];
        foreach ($cat['servicios'] as $s) {
            if ($s['slug'] !== $slug) continue;
            foreach ($cat['especialidades'] as $e) {
                if ($e['slug'] === $candidatos[0]['slug'] && (int) $e['id'] === (int) $s['especialidad_id']) {
                    $servicio = ['slug' => $s['slug'], 'nombre' => $s['nombre']];
                }
            }
        }
    }

    jsonOut([
        'ok'         => true,
        'reconocido' => true,
        'candidatos' => $candidatos,
        'ambiguo'    => $ambiguo,
        'servicio'   => $servicio,
        // Lo que la IA pudo sacar de paso. La conversación lo usa para no volver
        // a preguntar algo que la persona ya dijo con sus palabras.
        'extraido'   => [
            'zona_texto'  => $ia['zona_texto'] ?? null,
            'presupuesto' => $ia['presupuesto'] ?? null,
            'modalidad'   => $ia['modalidad'] ?? null,
            'genero'      => $ia['genero'] ?? null,
            'para_nino'   => $ia['para_nino'] ?? null,
            'urgencia'    => $ia['urgencia'] ?? null,
            'idioma'      => $ia['idioma'] ?? null,
            'resumen'     => $ia['resumen_necesidad'] ?? null,
        ],
        'ia'         => iaDisponible(),
    ]);

} catch (Throwable $e) {
    error_log('Buscador — interpretar: ' . $e->getMessage());
    jsonError('No pudimos interpretar lo que escribiste. Intenta de nuevo.', 500);
}

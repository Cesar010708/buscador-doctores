<?php
/**
 * Buscador de Doctores — motor de recomendación DETERMINISTA.
 * ============================================================================
 * Regla de oro del proyecto: el ranking se calcula aquí, en PHP, con datos de la
 * base. La IA (api/ia.php) solo interpreta lo que escribe el paciente y redacta
 * el "por qué" con los hechos que este archivo ya decidió. Así el orden es
 * reproducible, auditable y no depende de un modelo.
 *
 * Cada eje devuelve 0–100 y el global es su promedio ponderado. Los pesos se
 * redistribuyen según lo que el paciente declaró: sin zona no pesa la
 * proximidad, sin presupuesto pesa menos el precio.
 */

require_once __DIR__ . '/_lib.php';

// ── Pesos por eje ───────────────────────────────────────────────────────────
// `completitud` pesa poco A PROPÓSITO (§ ética del incentivo): llenar el perfil
// mejora la precisión del match y desempata, pero no puede empujar a un doctor
// peor por encima de una mejor opción para quien busca. Con este peso, la
// diferencia entre un perfil al 50% y uno al 100% son ~3 puntos de 100.
const BD_PESOS = [
    'match_servicio' => 26,
    'proximidad'     => 20,
    'precio'         => 14,
    'reputacion'     => 14,
    'experiencia'    => 12,
    'preferencias'   => 8,
    'completitud'    => 6,
    'disponibilidad' => 0,   // sube a 8 solo si el paciente declara urgencia
];

const BD_EJES_NOMBRE = [
    'match_servicio' => 'Lo que necesitas',
    'proximidad'     => 'Cercanía',
    'precio'         => 'Precio',
    'reputacion'     => 'Reputación',
    'experiencia'    => 'Experiencia',
    'preferencias'   => 'Tus preferencias',
    'completitud'    => 'Perfil completo',
    'disponibilidad' => 'Disponibilidad',
];

/**
 * Etiquetas de arquetipo, concordadas con el género del perfil. La forma 'N'
 * (neutra) se usa cuando el doctor no declara género. Todas encajan en la frase
 * "También es …" que arma la interfaz.
 */
const BD_ETIQUETAS = [
    'mejor_general'     => ['M' => 'Mejor en general',      'F' => 'Mejor en general',      'N' => 'Mejor en general'],
    'mas_cercano'       => ['M' => 'El más cercano',        'F' => 'La más cercana',        'N' => 'Quien te queda más cerca'],
    'mas_economico'     => ['M' => 'El más económico',      'F' => 'La más económica',      'N' => 'La opción más económica'],
    'mas_experimentado' => ['M' => 'El de más experiencia', 'F' => 'La de más experiencia', 'N' => 'Quien tiene más experiencia'],
    'mejor_calificado'  => ['M' => 'El mejor calificado',   'F' => 'La mejor calificada',   'N' => 'Quien tiene mejor calificación'],
];

function etiquetaArquetipo(string $clave, ?string $genero): string
{
    $formas = BD_ETIQUETAS[$clave] ?? null;
    if (!$formas) return $clave;
    return $formas[$genero === 'M' || $genero === 'F' ? $genero : 'N'];
}

/**
 * Motivos por los que alguien entra a buscar. Se pregunta por el MOTIVO, no por
 * la especialidad: pedirle al paciente que elija "otorrinolaringología" es
 * pedirle que haga nuestro trabajo.
 *
 * Cada motivo cambia la segunda pregunta (`pregunta` y `ejemplo`) y trae los
 * valores que ya se dan por sabidos: quien viene por su hijo no tiene que marcar
 * después una casilla de "es para un menor".
 */
const BD_MOTIVOS = [
    'malestar' => [
        'etiqueta' => 'Me siento mal',
        'apoyo'    => 'Tengo un síntoma o una molestia',
        'icono'    => 'i-pulso',
        'pregunta' => '¿Qué sientes?',
        'ayuda'    => 'Cuéntamelo como se lo dirías a alguien de confianza. Con eso encuentro al especialista que te toca.',
        'ejemplo'  => 'Me salen granos en la cara y me arde cuando me lavo',
        'aplica'   => [],
    ],
    'nino' => [
        'etiqueta' => 'Es para mi hijo o hija',
        'apoyo'    => 'Consulta para un menor',
        'icono'    => 'i-nino',
        'pregunta' => '¿Qué le pasa?',
        'ayuda'    => 'Solo te mostraré a quienes atienden niñas y niños.',
        'ejemplo'  => 'Tiene fiebre desde ayer y no quiere comer',
        'aplica'   => ['para_nino' => true],
    ],
    'chequeo' => [
        'etiqueta' => 'Quiero un chequeo',
        'apoyo'    => 'Revisión general, sin nada urgente',
        'icono'    => 'i-portapapeles',
        'pregunta' => '¿Hay algo en particular que quieras revisar?',
        'ayuda'    => 'Si no tienes nada en mente, déjalo en blanco y te busco medicina general.',
        'ejemplo'  => 'Quiero revisarme el azúcar, en mi familia hay diabetes',
        'aplica'   => ['especialidad_slug' => 'medicina-general'],
    ],
    'seguimiento' => [
        'etiqueta' => 'Le doy seguimiento a algo',
        'apoyo'    => 'Ya tengo un diagnóstico',
        'icono'    => 'i-calendario',
        'pregunta' => '¿A qué le das seguimiento?',
        'ayuda'    => 'Dime qué te diagnosticaron y busco a quien lleva ese control.',
        'ejemplo'  => 'Tengo hipertensión y necesito quien me lleve el control',
        'aplica'   => [],
    ],
    'segunda_opinion' => [
        'etiqueta' => 'Quiero otra opinión',
        'apoyo'    => 'Ya me vio alguien y no me quedé tranquilo',
        'icono'    => 'i-globos',
        'pregunta' => '¿Sobre qué quieres la segunda opinión?',
        'ayuda'    => 'Te priorizo perfiles con más años de práctica y mejor calificados.',
        'ejemplo'  => 'Me dijeron que necesito cirugía de rodilla',
        'aplica'   => ['prioridades' => ['experiencia', 'confianza']],
    ],
    'urgente' => [
        'etiqueta' => 'Necesito algo pronto',
        'apoyo'    => 'Hoy o esta semana',
        'icono'    => 'i-rayo',
        'pregunta' => '¿Qué está pasando?',
        'ayuda'    => 'Esto no sustituye a urgencias: si es grave, ve directo a un servicio de urgencias.',
        'ejemplo'  => 'Me torcí el tobillo jugando y no puedo apoyarlo',
        'aplica'   => ['urgencia' => 'hoy', 'prioridades' => ['pronto']],
    ],
];

/**
 * Lo que el paciente dice que le importa, dicho con sus palabras y atado al eje
 * que de verdad mueve. Se admiten dos como máximo: con tres o más, "priorizar"
 * deja de significar nada.
 */
const BD_PRIORIDADES = [
    'cerca'       => ['eje' => 'proximidad',     'etiqueta' => 'Que me quede cerca',        'frase' => 'que te quede cerca'],
    'precio'      => ['eje' => 'precio',         'etiqueta' => 'Que no me salga caro',      'frase' => 'que no te salga caro'],
    'experiencia' => ['eje' => 'experiencia',    'etiqueta' => 'Que tenga experiencia',     'frase' => 'que tenga experiencia'],
    'pronto'      => ['eje' => 'disponibilidad', 'etiqueta' => 'Que me atienda pronto',     'frase' => 'que te atienda pronto'],
    'confianza'   => ['eje' => 'reputacion',     'etiqueta' => 'Que me den confianza',      'frase' => 'que te den confianza'],
];

/**
 * Puntaje de los ejes cuando el PERFIL no declara el dato.
 *
 * Es distinto de que el eje no aplique a la búsqueda (ahí sí se salta y se
 * reparte su peso). Saltar un eje por falta de datos era un pase libre: el
 * perfil vacío quedaba juzgado solo donde no podía perder, y con una prioridad
 * declarada llegaba a ganar la búsqueda. Estos valores son bajos pero no cero:
 * no se castiga, simplemente no se puede demostrar lo que no se dice.
 */
const BD_SIN_DATO_PROXIMIDAD  = 8;
const BD_SIN_DATO_PRECIO      = 30;
const BD_SIN_DATO_EXPERIENCIA = 20;

/** Cuánto se multiplica el peso del eje que el paciente marcó como prioridad. */
const BD_PRIORIDAD_FACTOR = 2.4;
const BD_MAX_PRIORIDADES  = 2;

/** Tope de precio por banda de presupuesto, en pesos por consulta. */
const BD_PRESUPUESTO = ['economico' => 700, 'medio' => 1500, 'sin_limite' => null];

// ═══════════════════════════════════════════════════════════════════════════
//  Catálogos
// ═══════════════════════════════════════════════════════════════════════════

function catalogos(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;

    $db = getDB();
    $cache = [
        'especialidades' => $db->query('SELECT id, nombre, slug, sinonimos FROM ' . T_ESPECIALIDADES . ' WHERE activo = 1 ORDER BY nombre')->fetchAll(),
        'servicios'      => $db->query('SELECT id, nombre, slug, especialidad_id, sinonimos FROM ' . T_SERVICIOS . ' ORDER BY especialidad_id, nombre')->fetchAll(),
        'zonas'          => $db->query('SELECT id, nombre, slug, ciudad, cp, lat, lng, sinonimos FROM ' . T_ZONAS . ' ORDER BY nombre')->fetchAll(),
    ];
    return $cache;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Resolución de la necesidad (taxonomía)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Puntúa TODAS las especialidades contra un texto libre y devuelve el marcador
 * completo, no solo la ganadora.
 *
 * Se extrajo de resolverNecesidad() porque hacen falta las dos cosas: esa función
 * necesita una respuesta, y la conversación necesita los CANDIDATOS para poder
 * repreguntar cuando el texto es ambiguo ("¿es más bien piel o alergias?").
 *
 * Devuelve ['puntos' => [especialidad_id => float], 'servicio' => fila|null,
 *           'servicio_puntos' => float, 'total' => float].
 */
function puntuarEspecialidades(string $texto): array
{
    $vacio = ['puntos' => [], 'servicio' => null, 'servicio_puntos' => 0.0, 'total' => 0.0];

    $t = norm($texto);
    if ($t === '') return $vacio;
    $palabras = tokens($texto);
    if (!$palabras) return $vacio;

    $cat = catalogos();
    $puntos = [];
    $mejorServicio = null; $mejorServicioPts = 0.0;

    foreach ($cat['servicios'] as $s) {
        $p = puntosCoincidencia($t, $palabras, $s['nombre'], $s['sinonimos']);
        if ($p > 0) {
            $id = (int) $s['especialidad_id'];
            $puntos[$id] = ($puntos[$id] ?? 0) + $p;
            if ($p > $mejorServicioPts) { $mejorServicioPts = $p; $mejorServicio = $s; }
        }
    }
    foreach ($cat['especialidades'] as $e) {
        // La especialidad pesa más que un servicio suelto: nombrarla es explícito.
        $p = puntosCoincidencia($t, $palabras, $e['nombre'], $e['sinonimos']) * 1.5;
        if ($p > 0) $puntos[(int) $e['id']] = ($puntos[(int) $e['id']] ?? 0) + $p;
    }

    if ($puntos) arsort($puntos);
    return ['puntos' => $puntos, 'servicio' => $mejorServicio,
            'servicio_puntos' => $mejorServicioPts, 'total' => array_sum($puntos)];
}

/**
 * Ancla lo que pide el paciente a la taxonomía real. Nunca inventa: si el texto
 * no se parece a nada del catálogo, devuelve vacío y el endpoint lo dice.
 *
 * Devuelve ['especialidad' => fila|null, 'servicio' => fila|null,
 *           'confianza' => 0-1, 'sugerencias' => [filas de especialidad]].
 */
function resolverNecesidad(string $texto, ?string $especialidadSlug = null, ?string $servicioSlug = null): array
{
    $cat = catalogos();
    $out = ['especialidad' => null, 'servicio' => null, 'confianza' => 0.0, 'sugerencias' => []];

    // 1) Lo que el paciente eligió en el wizard manda sobre el texto libre.
    if ($servicioSlug) {
        foreach ($cat['servicios'] as $s) {
            if ($s['slug'] === $servicioSlug) {
                $out['servicio']   = $s;
                $out['confianza']  = 1.0;
                break;
            }
        }
    }
    if ($especialidadSlug) {
        foreach ($cat['especialidades'] as $e) {
            if ($e['slug'] === $especialidadSlug) {
                $out['especialidad'] = $e;
                $out['confianza']    = 1.0;
                break;
            }
        }
    }
    if (!$out['especialidad'] && $out['servicio']) {
        foreach ($cat['especialidades'] as $e) {
            if ((int) $e['id'] === (int) $out['servicio']['especialidad_id']) { $out['especialidad'] = $e; break; }
        }
    }

    // El servicio TIENE que pertenecer a la especialidad. Si no, se descarta y
    // manda la especialidad, que es lo que la persona eligió explícitamente.
    // Sin esta comprobación se colaba un "consulta cardiológica" dentro de una
    // búsqueda de medicina general: además de enseñar una etiqueta falsa, hundía
    // el eje de match de TODOS los candidatos, porque ninguno ofrece ese servicio.
    if ($out['servicio'] && $out['especialidad']
        && (int) $out['servicio']['especialidad_id'] !== (int) $out['especialidad']['id']) {
        $out['servicio'] = null;
    }

    if ($out['especialidad']) return $out;

    // 2) Matching por texto contra nombres y sinónimos del catálogo.
    $marcador = puntuarEspecialidades($texto);
    $puntos        = $marcador['puntos'];
    $mejorServicio = $marcador['servicio'];
    $mejorServicioPts = $marcador['servicio_puntos'];

    if (!$puntos) return $out;

    $ids   = array_keys($puntos);
    $mejor = $ids[0];
    $total = array_sum($puntos);

    foreach ($cat['especialidades'] as $e) {
        if ((int) $e['id'] === $mejor) $out['especialidad'] = $e;
    }
    if ($mejorServicio && (int) $mejorServicio['especialidad_id'] === $mejor && $mejorServicioPts >= 2) {
        $out['servicio'] = $mejorServicio;
    }
    $out['confianza'] = $total > 0 ? round($puntos[$mejor] / $total, 2) : 0.0;

    // Las otras especialidades con señal se ofrecen como alternativas.
    foreach (array_slice($ids, 1, 3) as $id) {
        foreach ($cat['especialidades'] as $e) {
            if ((int) $e['id'] === $id && $puntos[$id] >= 1.5) $out['sugerencias'][] = $e;
        }
    }
    return $out;
}

/** Singular y plural de una palabra, para que la 's' no rompa una coincidencia. */
function variantesNumero(string $palabra): array
{
    $v = [];
    if (strlen($palabra) >= 5) {
        if (str_ends_with($palabra, 'es'))     $v[] = substr($palabra, 0, -2);
        elseif (str_ends_with($palabra, 's'))  $v[] = substr($palabra, 0, -1);
        else { $v[] = $palabra . 's'; $v[] = $palabra . 'es'; }
    }
    return $v;
}

/** Puntos por coincidencia de frase completa (3) o de palabra suelta (1). */
function puntosCoincidencia(string $textoNorm, array $palabras, string $nombre, string $sinonimos): float
{
    $p = 0.0;
    $frases = array_merge([$nombre], array_filter(array_map('trim', explode(',', $sinonimos))));

    foreach ($frases as $frase) {
        $f = norm($frase);
        if ($f === '') continue;
        if (str_contains($textoNorm, $f)) {
            $p += str_contains($f, ' ') ? 3.0 : 2.0;
            continue;
        }
        // Palabra suelta del catálogo presente en el texto del paciente. Se
        // comparan también singular y plural: la gente escribe "me sale una
        // roncha" y el catálogo dice "ronchas", y esa 's' no debería costarle
        // la búsqueda a nadie.
        foreach (explode(' ', $f) as $pal) {
            if (strlen($pal) < 4) continue;
            if (in_array($pal, $palabras, true)) { $p += 1.0; continue; }
            foreach (variantesNumero($pal) as $v) {
                if (in_array($v, $palabras, true)) { $p += 0.9; break; }
            }
        }
    }
    return $p;
}

/** Ancla la zona escrita por el paciente al catálogo (CP, nombre o sinónimo). */
function resolverZona(?string $texto): ?array
{
    $t = norm($texto);
    if ($t === '') return null;
    $cat = catalogos();

    if (preg_match('/\b(\d{5})\b/', $t, $m)) {
        foreach ($cat['zonas'] as $z) {
            if ($z['cp'] === $m[1]) return $z;
        }
        // CP desconocido: sin coordenadas, pero sirve para comparar por prefijo.
        return ['id' => null, 'nombre' => 'CP ' . $m[1], 'slug' => 'cp-' . $m[1],
                'ciudad' => '', 'cp' => $m[1], 'lat' => null, 'lng' => null, 'sinonimos' => ''];
    }

    // La coincidencia es por PALABRA COMPLETA y nunca por ciudad: "Ciudad de
    // México" la comparten trece zonas, así que empataba a todas y la proximidad
    // acababa anclada a la que saliera primero. Y sin bordes de palabra, "doctores"
    // dentro de una frase cualquiera enganchaba con la colonia Doctores.
    $mejor = null; $mejorPts = 0.0;
    foreach ($cat['zonas'] as $z) {
        $pts = 0.0;
        foreach (array_merge([$z['nombre']], array_filter(array_map('trim', explode(',', $z['sinonimos'])))) as $frase) {
            $f = norm($frase);
            if ($f === '') continue;
            if (preg_match('/(?<![a-z0-9])' . preg_quote($f, '/') . '(?![a-z0-9])/u', $t)) {
                $pts += str_contains($f, ' ') ? 3.0 : 2.0;
            }
        }
        if ($pts > $mejorPts) { $mejorPts = $pts; $mejor = $z; }
    }
    if ($mejorPts > 0) return $mejor;

    // Solo nombró la ciudad: se devuelve una zona de ciudad, sin coordenadas. La
    // proximidad cae entonces a "misma ciudad", que es lo que de verdad se sabe.
    foreach ($cat['zonas'] as $z) {
        $c = norm($z['ciudad']);
        if ($c !== '' && str_contains($t, $c)) {
            return ['id' => null, 'nombre' => $z['ciudad'], 'slug' => null,
                    'ciudad' => $z['ciudad'], 'cp' => null, 'lat' => null, 'lng' => null, 'sinonimos' => ''];
        }
    }
    return null;
}

/**
 * Zona a partir de las coordenadas reales del dispositivo.
 *
 * No hace falta geocodificador externo: el motor de proximidad ya trabaja con
 * lat/lng (Haversine), así que basta con envolver las coordenadas y ponerles el
 * nombre de la zona del catálogo más cercana, para poder decirle a la persona
 * "estás cerca de Del Valle" en vez de un par de números.
 *
 * `lejos` avisa cuando el punto cae fuera del área donde hay perfiles de prueba.
 */
function zonaDesdeCoordenadas(float $lat, float $lng): ?array
{
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) return null;

    $cerca = null; $mejorD = null;
    foreach (catalogos()['zonas'] as $z) {
        if ($z['lat'] === null || $z['lng'] === null) continue;
        $d = distanciaKm($lat, $lng, (float) $z['lat'], (float) $z['lng']);
        if ($mejorD === null || $d < $mejorD) { $mejorD = $d; $cerca = $z; }
    }

    return [
        'id'        => null,
        'nombre'    => $cerca ? $cerca['nombre'] : 'tu ubicación',
        'slug'      => $cerca ? $cerca['slug'] : null,
        'ciudad'    => $cerca ? $cerca['ciudad'] : '',
        // El CP es el de la zona más cercana, no el exacto del punto: sirve para
        // rellenar el perfil de un consultorio, y el paciente nunca lo ve como
        // suyo (para la proximidad manda lat/lng, que sí son exactas).
        'cp'        => $cerca ? $cerca['cp'] : null,
        'lat'       => $lat,
        'lng'       => $lng,
        'sinonimos' => '',
        'exacta'    => true,                       // vino del GPS, no de un catálogo
        'distancia_zona' => $mejorD !== null ? round($mejorD, 1) : null,
        'lejos'     => $mejorD !== null && $mejorD > 40,
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  Candidatos (filtros duros, todo con sentencias preparadas)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filtros duros: quien no los cumple no aparece, por bueno que sea.
 *  - la especialidad que se necesita
 *  - atiende niños (si la consulta es para un menor) o adultos
 *  - género, modalidad e idioma SOLO cuando el paciente los marcó indispensables
 */
function candidatos(array $intake, ?int $especialidadId): array
{
    $db = getDB();
    $sql = 'SELECT d.id, d.nombre, d.genero, d.telefono, d.cedula_verificada, d.especialidad_id,
                   d.anios_experiencia, d.formacion, d.certificaciones, d.idiomas,
                   d.atiende_ninos, d.atiende_adultos, d.modalidad, d.disponibilidad,
                   d.precio_min, d.precio_max, d.rating, d.num_opiniones, d.bio,
                   d.completitud, d.nivel,
                   e.nombre AS especialidad, e.slug AS especialidad_slug
            FROM ' . T_DOCTORES . ' d
            LEFT JOIN ' . T_ESPECIALIDADES . ' e ON e.id = d.especialidad_id
            WHERE d.activo = 1';
    $params = [];

    if ($especialidadId) {
        $sql .= ' AND d.especialidad_id = ?';
        $params[] = $especialidadId;
    }
    if (!empty($intake['para_nino'])) {
        $sql .= ' AND d.atiende_ninos = 1';
    } else {
        $sql .= ' AND d.atiende_adultos = 1';
    }
    if (!empty($intake['genero']) && !empty($intake['genero_obligatorio'])) {
        $sql .= ' AND d.genero = ?';
        $params[] = $intake['genero'];
    }
    if (!empty($intake['modalidad']) && !empty($intake['modalidad_obligatoria'])) {
        $sql .= ' AND FIND_IN_SET(?, d.modalidad)';
        $params[] = $intake['modalidad'];
    }
    if (!empty($intake['idioma']) && !empty($intake['idioma_obligatorio'])) {
        $sql .= ' AND FIND_IN_SET(?, d.idiomas)';
        $params[] = $intake['idioma'];
    }

    $stmt = $db->prepare($sql . ' ORDER BY d.id');
    $stmt->execute($params);
    $docs = $stmt->fetchAll();
    if (!$docs) return [];

    $ids  = array_column($docs, 'id');
    $ph   = implode(',', array_fill(0, count($ids), '?'));

    $stmt = $db->prepare(
        "SELECT ds.doctor_id, s.id, s.nombre, s.slug
         FROM " . T_DOCTOR_SERVICIOS . " ds
         JOIN " . T_SERVICIOS . " s ON s.id = ds.servicio_id
         WHERE ds.doctor_id IN ({$ph}) ORDER BY s.nombre"
    );
    $stmt->execute($ids);
    $servicios = [];
    foreach ($stmt->fetchAll() as $r) {
        $servicios[(int) $r['doctor_id']][] = ['id' => (int) $r['id'], 'nombre' => $r['nombre'], 'slug' => $r['slug']];
    }

    $stmt = $db->prepare(
        "SELECT doctor_id, tipo, nombre, direccion, colonia, ciudad, cp, lat, lng
         FROM " . T_UBICACIONES . " WHERE doctor_id IN ({$ph}) ORDER BY id"
    );
    $stmt->execute($ids);
    $ubis = [];
    foreach ($stmt->fetchAll() as $r) {
        $ubis[(int) $r['doctor_id']][] = $r;
    }

    foreach ($docs as &$d) {
        $d['servicios']   = $servicios[(int) $d['id']] ?? [];
        $d['ubicaciones'] = $ubis[(int) $d['id']] ?? [];
    }
    return $docs;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sub-scores (0–100 cada uno)
// ═══════════════════════════════════════════════════════════════════════════

/** Distancia en km entre dos coordenadas (Haversine). */
function distanciaKm(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $R = 6371.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

/**
 * Cercanía. Con coordenadas es una caída exponencial (a 3 km todavía es buena
 * nota, a 20 km ya casi no puntúa). Sin coordenadas cae a comparar CP y ciudad,
 * que es lo honesto en un prototipo sin geocodificación.
 * Devuelve [score, distancia_km|null, ubicacion_mas_cercana|null].
 */
function scoreProximidad(array $doctor, ?array $zona): array
{
    // Sin zona el eje NO APLICA: se salta y su peso se reparte. Es correcto.
    if (!$zona) return [null, null, null];

    // Pero un perfil que no dice dónde atiende NO puede saltárselo: no saber
    // dónde está es no poder estar cerca. Si se saltara, un perfil vacío ganaría
    // las búsquedas por cercanía justamente por estar vacío.
    if (!$doctor['ubicaciones']) return [BD_SIN_DATO_PROXIMIDAD, null, null];

    if ($zona['lat'] !== null && $zona['lng'] !== null) {
        $mejor = null; $mejorD = null;
        foreach ($doctor['ubicaciones'] as $u) {
            if ($u['lat'] === null || $u['lng'] === null) continue;
            $d = distanciaKm((float) $zona['lat'], (float) $zona['lng'], (float) $u['lat'], (float) $u['lng']);
            if ($mejorD === null || $d < $mejorD) { $mejorD = $d; $mejor = $u; }
        }
        if ($mejorD !== null) {
            $score = (int) round(100 * exp(-$mejorD / 9));      // 0 km→100, 6 km→51, 20 km→11
            return [max(2, min(100, $score)), round($mejorD, 1), $mejor];
        }
    }

    // Sin coordenadas: mismo CP > mismo prefijo de CP > misma ciudad > otra.
    $cpPaciente = $zona['cp'] ?? null;
    $mejorScore = 15; $mejorU = $doctor['ubicaciones'][0];
    foreach ($doctor['ubicaciones'] as $u) {
        $s = 15;
        if ($cpPaciente && $u['cp'] === $cpPaciente)                                   $s = 95;
        elseif ($cpPaciente && $u['cp'] && substr($u['cp'], 0, 2) === substr($cpPaciente, 0, 2)) $s = 65;
        elseif (!empty($zona['ciudad']) && norm($u['ciudad']) === norm($zona['ciudad'])) $s = 45;
        if ($s > $mejorScore) { $mejorScore = $s; $mejorU = $u; }
    }
    return [$mejorScore, null, $mejorU];
}

/**
 * Ajuste al presupuesto. Con banda declarada se mide contra su tope; sin banda,
 * por posición relativa dentro de los candidatos (para que "el más económico"
 * siga significando algo). Sin precio en el perfil no se inventa: nota media y
 * el dato aparece en `faltantes`.
 */
function scorePrecio(?int $precio, ?string $banda, int $minSet, int $maxSet): int
{
    // Quien no declara precio no puede demostrar que cabe en el presupuesto, así
    // que no se le salta el eje: puntúa bajo y la interfaz dice "no especifica".
    if ($precio === null || $precio <= 0) return BD_SIN_DATO_PRECIO;

    $tope = $banda !== null ? (BD_PRESUPUESTO[$banda] ?? null) : null;

    if ($tope === null) {
        if ($maxSet <= $minSet) return 70;
        $rel = ($precio - $minSet) / ($maxSet - $minSet);        // 0 = el más barato
        return (int) round(100 - 60 * $rel);                     // 100 … 40
    }

    if ($precio <= $tope) {
        return (int) round(100 - 25 * ($precio / $tope));         // 100 … 75
    }
    $exceso = $precio / $tope - 1;                                // 0.2 = 20% arriba
    return (int) max(5, round(70 - $exceso * 100));
}

/** Años de práctica + formación y certificaciones declaradas. */
function scoreExperiencia(array $d): int
{
    $anios = $d['anios_experiencia'] !== null ? (int) $d['anios_experiencia'] : null;
    // Igual que arriba: sin años ni formación declarada no hay trayectoria que
    // mostrar, y eso puntúa bajo. No se salta.
    if ($anios === null && trim($d['formacion']) === '') return BD_SIN_DATO_EXPERIENCIA;

    $s = min(1.0, ($anios ?? 0) / 25) * 70;
    if (trim($d['formacion']) !== '')       $s += 10;
    if (trim($d['certificaciones']) !== '') $s += 20;
    return (int) min(100, round($s));
}

/**
 * Reputación con corrección bayesiana: un 5.0 con tres opiniones no puede
 * ganarle a un 4.8 con doscientas.
 *
 * Sin opiniones NO se devuelve null: se devuelve la media previa. Saltarse el
 * eje repartiría su peso entre los demás y le daría al perfil recién llegado una
 * ventaja sobre quien sí tiene historial. Con la previa parte de en medio, que es
 * lo honesto: ni premio ni castigo. La interfaz avisa que aún no tiene opiniones.
 */
const BD_REPUTACION_PREVIA = 62.0;
const BD_REPUTACION_PESO   = 20.0;

function scoreReputacion(?float $rating, int $n): int
{
    if ($rating === null || $rating <= 0 || $n <= 0) {
        return (int) round(BD_REPUTACION_PREVIA);
    }
    return (int) round((($rating * 20) * $n + BD_REPUTACION_PREVIA * BD_REPUTACION_PESO) / ($n + BD_REPUTACION_PESO));
}

/** Género, modalidad e idioma pedidos: promedio de lo que el paciente declaró. */
function scorePreferencias(array $d, array $intake): array
{
    $partes = []; $detalle = [];

    if (!empty($intake['genero'])) {
        $ok = $d['genero'] === $intake['genero'];
        $partes[] = $ok ? 100 : 0;
        $detalle['genero'] = $ok;
    }
    if (!empty($intake['modalidad'])) {
        $mods = array_filter(explode(',', (string) $d['modalidad']));
        $ok   = in_array($intake['modalidad'], $mods, true);
        $partes[] = $ok ? 100 : 0;
        $detalle['modalidad'] = $ok;
    }
    if (!empty($intake['idioma'])) {
        $idiomas = array_map('trim', array_filter(explode(',', (string) $d['idiomas'])));
        $ok = in_array($intake['idioma'], $idiomas, true);
        $partes[] = $ok ? 100 : 0;
        $detalle['idioma'] = $ok;
    }
    if (!empty($intake['para_nino'])) {
        $partes[] = (int) $d['atiende_ninos'] === 1 ? 100 : 0;
        $detalle['ninos'] = (int) $d['atiende_ninos'] === 1;
    }

    if (!$partes) return [null, $detalle];
    return [(int) round(array_sum($partes) / count($partes)), $detalle];
}

/** Qué tan pronto puede atender, contra la prisa que declaró el paciente. */
function scoreDisponibilidad(?string $disp, ?string $urgencia): ?int
{
    if (!$urgencia || $urgencia === 'sin_prisa' || !$disp) return null;
    $tabla = [
        'hoy'          => ['inmediata' => 100, 'esta_semana' => 55, 'programada' => 15],
        'esta_semana'  => ['inmediata' => 100, 'esta_semana' => 90, 'programada' => 40],
    ];
    return $tabla[$urgencia][$disp] ?? null;
}

/** Cercanía entre lo que se pidió y lo que el doctor ofrece de verdad. */
function scoreMatchServicio(array $d, ?array $servicio, ?array $especialidad): int
{
    if ($servicio) {
        foreach ($d['servicios'] as $s) {
            if ((int) $s['id'] === (int) $servicio['id']) return 100;
        }
        return 72;   // misma especialidad, pero no lista ese servicio en concreto
    }
    if ($especialidad) {
        return (int) min(100, 85 + 3 * count($d['servicios']));
    }
    return 60;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Ranking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Puntúa y ordena. Devuelve la lista completa con sus sub-scores, los pesos que
 * se usaron y las notas de contraste. Todo lo que la UI muestra sale de aquí.
 */
function rankear(array $doctores, array $intake, ?array $necesidad, ?array $zona): array
{
    if (!$doctores) return [];

    $precios = array_values(array_filter(array_map(fn($d) => $d['precio_min'] !== null ? (int) $d['precio_min'] : null, $doctores), fn($p) => $p !== null));
    $minSet  = $precios ? min($precios) : 0;
    $maxSet  = $precios ? max($precios) : 0;
    sort($precios);
    $mediana = $precios ? $precios[(int) floor((count($precios) - 1) / 2)] : 0;

    $especialidad = $necesidad['especialidad'] ?? null;
    $servicio     = $necesidad['servicio'] ?? null;

    $out = [];
    foreach ($doctores as $d) {
        [$prox, $km, $ubi]   = scoreProximidad($d, $zona);
        [$pref, $prefDet]    = scorePreferencias($d, $intake);
        $precio              = $d['precio_min'] !== null ? (int) $d['precio_min'] : null;

        $scores = [
            'match_servicio' => scoreMatchServicio($d, $servicio, $especialidad),
            'proximidad'     => $prox,
            'precio'         => scorePrecio($precio, $intake['presupuesto'] ?? null, $minSet, $maxSet),
            'reputacion'     => scoreReputacion($d['rating'] !== null ? (float) $d['rating'] : null, (int) $d['num_opiniones']),
            'experiencia'    => scoreExperiencia($d),
            'preferencias'   => $pref,
            'completitud'    => (int) $d['completitud'],
            'disponibilidad' => scoreDisponibilidad($d['disponibilidad'], $intake['urgencia'] ?? null),
        ];

        // Pesos efectivos. Un eje solo se salta cuando NO APLICA a esta búsqueda
        // (sin zona no pesa la cercanía); si aplica pero el perfil no trae el
        // dato, puntúa bajo y sí cuenta.
        $pesos = BD_PESOS;
        if (!empty($intake['urgencia']) && $intake['urgencia'] !== 'sin_prisa') $pesos['disponibilidad'] = 8;
        // Un presupuesto declarado es una restricción real y pesa más; sin banda,
        // el precio solo ordena por lo relativo y no debe mandar en el ranking.
        $pesos['precio'] = match ($intake['presupuesto'] ?? null) {
            'economico', 'medio' => 18,
            'sin_limite'         => 8,
            default              => 7,
        };
        // Decir "que no me salga caro" ES declarar que el presupuesto importa,
        // aunque no se haya elegido una banda: parte del mismo peso que si la
        // hubiera, y de ahí lo multiplica la prioridad. Si no, la prioridad se
        // aplicaba sobre un peso mínimo y elegirla casi no cambiaba nada.
        if (in_array('precio', $intake['prioridades'] ?? [], true)) {
            $pesos['precio'] = max($pesos['precio'], 18);
        }
        // En telemedicina la distancia no significa nada.
        if (($intake['modalidad'] ?? null) === 'telemedicina') $pesos['proximidad'] = 0;

        // Lo que el paciente dijo que le importa manda sobre los pesos base. Es la
        // diferencia entre un buscador con filtros y algo que escuchó: si dijo
        // "que me quede cerca", la cercanía deja de ser un eje más.
        foreach (($intake['prioridades'] ?? []) as $prioridad) {
            $eje = BD_PRIORIDADES[$prioridad]['eje'] ?? null;
            if ($eje === null || ($pesos[$eje] ?? 0) < 0) continue;
            // Si el eje estaba apagado (disponibilidad sin urgencia declarada), pedirlo
            // como prioridad es declararlo importante: se enciende.
            $base = $pesos[$eje] > 0 ? $pesos[$eje] : (BD_PESOS[$eje] ?: 8);
            $pesos[$eje] = (int) round($base * BD_PRIORIDAD_FACTOR);
        }

        $suma = 0.0; $pesoTotal = 0.0; $usados = [];
        foreach ($pesos as $eje => $peso) {
            if ($peso <= 0 || $scores[$eje] === null) continue;
            $suma      += $peso * $scores[$eje];
            $pesoTotal += $peso;
            $usados[$eje] = $peso;
        }
        $global = $pesoTotal > 0 ? (int) round($suma / $pesoTotal) : 0;

        // Se publica el peso NORMALIZADO, no el bruto: el total cambia según los
        // ejes que apliquen, y la interfaz promete "pesa N% en esta búsqueda".
        foreach ($usados as $eje => $peso) {
            $usados[$eje] = (int) round($peso / $pesoTotal * 100);
        }

        // Datos que el perfil no declara: se dicen, no se suponen.
        $faltantes = [];
        if ($precio === null)                    $faltantes[] = 'precio';
        if ($d['rating'] === null || (int) $d['num_opiniones'] === 0) $faltantes[] = 'opiniones';
        if ($d['anios_experiencia'] === null)    $faltantes[] = 'experiencia';
        if (!$d['ubicaciones'])                  $faltantes[] = 'ubicación';
        if (trim($d['formacion']) === '' && $d['anios_experiencia'] === null) $faltantes[] = 'trayectoria';

        $out[] = [
            'id'                => (int) $d['id'],
            'nombre'            => $d['nombre'],
            'genero'            => $d['genero'],
            // Para "Ver contacto". ia.php arma su carga campo por campo, así que
            // ni el teléfono ni la dirección llegan al prompt.
            'telefono'          => ($d['telefono'] !== null && $d['telefono'] !== '') ? $d['telefono'] : null,
            'especialidad'      => $d['especialidad'],
            'especialidad_slug' => $d['especialidad_slug'],
            'servicios'         => array_column($d['servicios'], 'nombre'),
            'ubicacion'         => $ubi ? [
                'tipo'      => $ubi['tipo'],
                'nombre'    => $ubi['nombre'],
                'direccion' => $ubi['direccion'],
                'colonia'   => $ubi['colonia'],
                'ciudad'    => $ubi['ciudad'],
                'cp'        => $ubi['cp'],
            ] : ($d['ubicaciones'] ? [
                'tipo'      => $d['ubicaciones'][0]['tipo'],
                'nombre'    => $d['ubicaciones'][0]['nombre'],
                'direccion' => $d['ubicaciones'][0]['direccion'],
                'colonia'   => $d['ubicaciones'][0]['colonia'],
                'ciudad'    => $d['ubicaciones'][0]['ciudad'],
                'cp'        => $d['ubicaciones'][0]['cp'],
            ] : null),
            'colonias'          => array_values(array_unique(array_column($d['ubicaciones'], 'colonia'))),
            'distancia_km'      => $km,
            'precio_min'        => $precio,
            'precio_max'        => $d['precio_max'] !== null ? (int) $d['precio_max'] : null,
            'anios_experiencia' => $d['anios_experiencia'] !== null ? (int) $d['anios_experiencia'] : null,
            'formacion'         => $d['formacion'],
            'certificaciones'   => $d['certificaciones'],
            'rating'            => $d['rating'] !== null ? (float) $d['rating'] : null,
            'num_opiniones'     => (int) $d['num_opiniones'],
            'idiomas'           => array_values(array_filter(array_map('trim', explode(',', (string) $d['idiomas'])))),
            'modalidad'         => array_values(array_filter(explode(',', (string) $d['modalidad']))),
            'disponibilidad'    => $d['disponibilidad'],
            'atiende_ninos'     => (int) $d['atiende_ninos'] === 1,
            'cedula_verificada' => (int) $d['cedula_verificada'] === 1,
            'completitud'       => (int) $d['completitud'],
            'nivel'             => $d['nivel'],
            'bio'               => $d['bio'],
            'scores'            => $scores,
            'pesos'             => $usados,
            'score'             => $global,
            'preferencias_ok'   => $prefDet,
            'faltantes'         => $faltantes,
            'etiquetas'         => [],
            'notas'             => [],
        ];
    }

    usort($out, function ($a, $b) {
        if ($b['score'] !== $a['score'])                     return $b['score'] <=> $a['score'];
        if ($b['scores']['reputacion'] !== $a['scores']['reputacion']) return ($b['scores']['reputacion'] ?? 0) <=> ($a['scores']['reputacion'] ?? 0);
        return strcmp($a['nombre'], $b['nombre']);           // desempate estable
    });

    return anotarContrastes($out, $mediana, $zona !== null);
}

/**
 * Los contrastes que pide el producto: "muy buena pero lejos", "barato pero
 * nuevo", "más experiencia pero más caro". Salen de comparar sub-scores, no de
 * la IA.
 */
function anotarContrastes(array $lista, int $medianaPrecio, bool $hayZona): array
{
    foreach ($lista as &$d) {
        $s = $d['scores'];
        $notas = [];

        if ($hayZona && $d['score'] >= 65 && $s['proximidad'] !== null && $s['proximidad'] < 40) {
            $notas[] = 'bueno_pero_lejos';
        }
        if ($d['precio_min'] !== null && $medianaPrecio > 0 && $d['precio_min'] <= $medianaPrecio
            && $s['experiencia'] !== null && $s['experiencia'] < 35) {
            $notas[] = 'economico_pero_nuevo';
        }
        if ($s['experiencia'] !== null && $s['experiencia'] >= 70
            && $d['precio_min'] !== null && $medianaPrecio > 0 && $d['precio_min'] > $medianaPrecio * 1.15) {
            $notas[] = 'experimentado_pero_caro';
        }
        if ($hayZona && $s['proximidad'] !== null && $s['proximidad'] >= 70
            && $s['experiencia'] !== null && $s['experiencia'] < 40) {
            $notas[] = 'cerca_pero_menos_experiencia';
        }
        if ($d['rating'] !== null && $d['rating'] >= 4.5 && $d['num_opiniones'] < 40) {
            $notas[] = 'bien_calificado_pocas_opiniones';
        }
        if ($s['disponibilidad'] !== null && $s['disponibilidad'] >= 100) {
            $notas[] = 'puede_atender_pronto';
        }
        $d['notas'] = $notas;
    }
    return $lista;
}

/**
 * Arquetipos. Cada uno se lo lleva su ganador REAL; si ese doctor ya tenía otra
 * etiqueta, la nueva se le suma en lugar de crear una tarjeta duplicada con el
 * segundo lugar (decir que el segundo más barato es "el más económico" sería
 * mentir).
 */
function arquetipos(array $lista, bool $hayZona, ?string $modalidad = null, array $prioridades = []): array
{
    // En telemedicina "el más cercano" no le dice nada al paciente.
    if ($modalidad === 'telemedicina') $hayZona = false;

    if (!$lista) return [];

    $porId = [];
    foreach ($lista as $i => $d) $porId[$d['id']] = $i;

    $ganador = function (callable $mejorQue, callable $aplica) use ($lista) {
        $mejor = null;
        foreach ($lista as $d) {
            if (!$aplica($d)) continue;
            if ($mejor === null || $mejorQue($d, $mejor)) $mejor = $d;
        }
        return $mejor;
    };

    $defs = [
        'mejor_general' => [
            'doctor'   => $lista[0],
        ],
        'mas_cercano' => !$hayZona ? null : [
            'doctor'   => $ganador(
                fn($a, $b) => ($a['scores']['proximidad'] ?? -1) > ($b['scores']['proximidad'] ?? -1),
                fn($d) => $d['scores']['proximidad'] !== null
            ),
        ],
        'mas_economico' => [
            'doctor'   => $ganador(
                fn($a, $b) => $a['precio_min'] < $b['precio_min'],
                fn($d) => $d['precio_min'] !== null
            ),
        ],
        'mas_experimentado' => [
            'doctor'   => $ganador(
                fn($a, $b) => $a['anios_experiencia'] > $b['anios_experiencia'],
                fn($d) => $d['anios_experiencia'] !== null
            ),
        ],
        'mejor_calificado' => [
            // Solo compite quien tiene opiniones de verdad: coronar al "mejor
            // calificado" entre perfiles sin una sola opinión sería inventarlo.
            'doctor'   => $ganador(
                fn($a, $b) => $a['scores']['reputacion'] > $b['scores']['reputacion'],
                fn($d) => $d['num_opiniones'] > 0 && $d['rating'] !== null
            ),
        ],
    ];

    $out = []; $tomados = [];
    foreach ($defs as $clave => $def) {
        if ($def === null || empty($def['doctor'])) continue;
        $id       = $def['doctor']['id'];
        // Con prioridades declaradas, la tarjeta principal deja de ser un premio
        // abstracto ("mejor en general") y pasa a ser la respuesta a lo que pidió.
        $etiqueta = ($clave === 'mejor_general' && $prioridades)
            ? 'Tu mejor opción'
            : etiquetaArquetipo($clave, $def['doctor']['genero'] ?? null);

        // Si este doctor ya se llevó otra etiqueta, se le suma en vez de crear una
        // tarjeta con el segundo lugar: decir que el segundo más barato es "el más
        // económico" sería mentir.
        if (isset($tomados[$id])) {
            $out[$tomados[$id]]['tambien'][]        = $etiqueta;
            $out[$tomados[$id]]['tambien_claves'][] = $clave;
            continue;
        }
        $tomados[$id] = count($out);
        $out[] = [
            'clave'     => $clave,
            'etiqueta'  => $etiqueta,
            'doctor_id' => $id,
            'posicion'  => $porId[$id] + 1,
            'tambien'        => [],
            'tambien_claves' => [],
        ];
    }

    // Un solo resultado no admite comparativa: la tarjeta de arquetipo sobra.
    if (count($lista) === 1) {
        return [$out[0]];
    }
    return $out;
}

/**
 * Justificación de plantilla: la que se usa si la IA está apagada o falla.
 * Solo enuncia datos que vienen de la base; nunca opina de salud.
 */
/** "que te quede cerca y que no te salga caro", con las palabras del paciente. */
function frasePrioridades(array $prioridades): string
{
    $frases = [];
    foreach ($prioridades as $p) {
        if (isset(BD_PRIORIDADES[$p])) $frases[] = BD_PRIORIDADES[$p]['frase'];
    }
    return $frases ? implode(' y ', $frases) : '';
}

function justificacionPlantilla(array $d, ?string $clave, ?array $zona, array $prioridades = []): string
{
    $partes = [];
    $nom = $d['nombre'];

    switch ($clave) {
        case 'mejor_general':
            $frase = frasePrioridades($prioridades);
            $partes[] = $frase !== ''
                ? "{$nom} es quien mejor responde a lo que pediste: {$frase}"
                : "{$nom} es quien mejor cubre en conjunto lo que pediste";
            break;
        case 'mas_cercano':
            if ($d['distancia_km'] === null) {
                $partes[] = "{$nom} es quien atiende más cerca de la zona que indicaste";
            } elseif ($d['distancia_km'] < 1) {
                $partes[] = "{$nom} atiende en la zona misma que indicaste";
            } else {
                $partes[] = "{$nom} es quien te queda más cerca: a unos {$d['distancia_km']} km";
            }
            break;
        case 'mas_economico':
            $partes[] = "{$nom} tiene la consulta más accesible del resultado, desde \${$d['precio_min']}";
            break;
        case 'mas_experimentado':
            $partes[] = "{$nom} es quien acumula más años de práctica: {$d['anios_experiencia']}";
            break;
        case 'mejor_calificado':
            $partes[] = "{$nom} es el mejor calificado: {$d['rating']} de 5 con {$d['num_opiniones']} opiniones";
            break;
        default:
            $partes[] = "{$nom}, " . mb_strtolower($d['especialidad'] ?? 'especialista');
    }

    if ($d['precio_min'] !== null && $clave !== 'mas_economico') {
        $partes[] = "consulta desde \${$d['precio_min']}";
    }
    if ($d['anios_experiencia'] !== null && $clave !== 'mas_experimentado') {
        $partes[] = "{$d['anios_experiencia']} años de experiencia";
    }
    if ($d['ubicacion'] && $d['ubicacion']['colonia']) {
        $partes[] = 'atiende en ' . $d['ubicacion']['colonia'];
    }
    if (in_array('precio', $d['faltantes'], true)) {
        $partes[] = 'no especifica precio';
    }

    return ucfirst(implode('; ', $partes)) . '.';
}

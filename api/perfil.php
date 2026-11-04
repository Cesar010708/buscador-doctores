<?php
/**
 * Buscador de Doctores — perfil del médico: completitud, niveles y carga.
 * ============================================================================
 * Aquí vive la REGLA de completitud, y el servidor es su única autoridad: el
 * cliente nunca envía `completitud` ni `nivel`, se recalculan al guardar.
 *
 * Cada regla lleva su beneficio REAL de match, no humo: los puntos están atados
 * a un eje del ranking (api/ranking.php). Llenar el perfil mejora la precisión
 * con la que se empareja al doctor con quien lo busca; el peso de `completitud`
 * en el ranking es pequeño a propósito para que no compre posiciones.
 */

require_once __DIR__ . '/_lib.php';

/** Los puntos suman exactamente 100. */
const BD_REGLAS = [
    ['clave' => 'nombre',         'puntos' => 6,  'etiqueta' => 'Tu nombre completo',
     'beneficio' => 'Es lo primero que ve el paciente en la tarjeta de resultados.'],
    ['clave' => 'especialidad',   'puntos' => 10, 'etiqueta' => 'Tu especialidad',
     'beneficio' => 'Sin ella no apareces en ninguna búsqueda: es el primer filtro.'],
    ['clave' => 'servicios',      'puntos' => 10, 'etiqueta' => 'Los servicios que ofreces',
     'beneficio' => 'Quien busca justo ese servicio te ve arriba, no a media lista.'],
    ['clave' => 'ubicacion',      'puntos' => 12, 'etiqueta' => 'Dónde atiendes',
     'beneficio' => 'Es lo que te hace aparecer como "el más cercano" para quien vive por ahí.'],
    ['clave' => 'telefono',       'puntos' => 5,  'etiqueta' => 'Un teléfono de contacto',
     'beneficio' => 'Sin contacto, el paciente que te eligió no puede llegar a ti.'],
    ['clave' => 'genero',         'puntos' => 4,  'etiqueta' => 'Tu género',
     'beneficio' => 'Muchos pacientes filtran por médico o médica; sin el dato quedas fuera.'],
    ['clave' => 'experiencia',    'puntos' => 8,  'etiqueta' => 'Tus años de experiencia',
     'beneficio' => 'Es el eje que decide quién es "el de más experiencia".'],
    ['clave' => 'formacion',      'puntos' => 5,  'etiqueta' => 'Tu formación',
     'beneficio' => 'Suma en el eje de experiencia y da contexto a tu trayectoria.'],
    ['clave' => 'precio',         'puntos' => 10, 'etiqueta' => 'Tu rango de precios',
     'beneficio' => 'Apareces cuando filtran por presupuesto; sin precio el sistema tiene que decir "no lo especifica".'],
    ['clave' => 'bio',            'puntos' => 8,  'etiqueta' => 'Una descripción tuya',
     'beneficio' => 'Es lo que el paciente lee para decidirse entre dos perfiles parecidos.'],
    ['clave' => 'idiomas',        'puntos' => 4,  'etiqueta' => 'Los idiomas que hablas',
     'beneficio' => 'Te hace aparecer en las búsquedas que piden atención en otro idioma.'],
    ['clave' => 'modalidad',      'puntos' => 5,  'etiqueta' => 'Cómo atiendes',
     'beneficio' => 'Consultorio, hospital o videoconsulta: si no lo dices, no sales en ese filtro.'],
    ['clave' => 'disponibilidad', 'puntos' => 4,  'etiqueta' => 'Qué tan pronto puedes atender',
     'beneficio' => 'Te posiciona con quien tiene prisa y necesita cita hoy.'],
    ['clave' => 'cedula',         'puntos' => 5,  'etiqueta' => 'Tu número de cédula',
     'beneficio' => 'Primer paso para el sello de cédula registrada que ve el paciente.'],
    ['clave' => 'cedula_archivo', 'puntos' => 4,  'etiqueta' => 'El documento de tu cédula',
     'beneficio' => 'Con él se te otorga el sello "Cédula registrada", que el paciente ve en tu tarjeta.'],
];

/** ¿Está cumplido cada requisito, con el perfil tal y como está hoy? */
function reglasCompletitud(array $p): array
{
    $lleno = fn($k) => isset($p[$k]) && trim((string) $p[$k]) !== '';

    $cumple = [
        'nombre'         => $lleno('nombre'),
        'especialidad'   => !empty($p['especialidad_id']),
        'servicios'      => !empty($p['servicios']),
        'ubicacion'      => !empty($p['ubicaciones']),
        'telefono'       => $lleno('telefono'),
        'genero'         => $lleno('genero'),
        'experiencia'    => isset($p['anios_experiencia']) && $p['anios_experiencia'] !== null && $p['anios_experiencia'] !== '',
        'formacion'      => $lleno('formacion'),
        'precio'         => !empty($p['precio_min']) && !empty($p['precio_max']),
        'bio'            => mb_strlen(trim((string) ($p['bio'] ?? ''))) >= 60,
        'idiomas'        => $lleno('idiomas'),
        'modalidad'      => $lleno('modalidad'),
        'disponibilidad' => $lleno('disponibilidad'),
        'cedula'         => $lleno('cedula'),
        'cedula_archivo' => $lleno('cedula_archivo'),
    ];

    $out = [];
    foreach (BD_REGLAS as $r) {
        $r['cumplido'] = (bool) ($cumple[$r['clave']] ?? false);
        $out[] = $r;
    }
    return $out;
}

function calcularCompletitud(array $p): int
{
    $total = 0;
    foreach (reglasCompletitud($p) as $r) {
        if ($r['cumplido']) $total += $r['puntos'];
    }
    return min(100, $total);
}

/** Básico → Destacado → Top. Los umbrales se muestran tal cual en el medidor. */
function nivelPorCompletitud(int $completitud): string
{
    if ($completitud >= 80) return 'top';
    if ($completitud >= 50) return 'destacado';
    return 'basico';
}

/** Perfil completo del doctor, con sus servicios y ubicaciones. */
function cargarPerfil(int $doctorId): ?array
{
    $db = getDB();

    $stmt = $db->prepare(
        'SELECT d.id, d.email, d.nombre, d.genero, d.telefono, d.cedula, d.cedula_archivo,
                d.cedula_verificada, d.especialidad_id, d.anios_experiencia, d.formacion,
                d.certificaciones, d.idiomas, d.atiende_ninos, d.atiende_adultos, d.modalidad,
                d.disponibilidad, d.precio_min, d.precio_max, d.rating, d.num_opiniones, d.bio,
                d.completitud, d.nivel, d.activo, d.created_at, d.updated_at,
                e.nombre AS especialidad, e.slug AS especialidad_slug
         FROM ' . T_DOCTORES . ' d
         LEFT JOIN ' . T_ESPECIALIDADES . ' e ON e.id = d.especialidad_id
         WHERE d.id = ?'
    );
    $stmt->execute([$doctorId]);
    $p = $stmt->fetch();
    if (!$p) return null;

    $stmt = $db->prepare(
        'SELECT s.id, s.nombre, s.slug FROM ' . T_DOCTOR_SERVICIOS . ' ds
         JOIN ' . T_SERVICIOS . ' s ON s.id = ds.servicio_id
         WHERE ds.doctor_id = ? ORDER BY s.nombre'
    );
    $stmt->execute([$doctorId]);
    $p['servicios'] = $stmt->fetchAll();

    $stmt = $db->prepare(
        'SELECT id, tipo, nombre, direccion, colonia, ciudad, cp, lat, lng
         FROM ' . T_UBICACIONES . ' WHERE doctor_id = ? ORDER BY id'
    );
    $stmt->execute([$doctorId]);
    $p['ubicaciones'] = $stmt->fetchAll();

    return $p;
}

/** El perfil tal y como lo verá el paciente (sin datos de cuenta). */
function perfilPublico(array $p): array
{
    return [
        'nombre'            => $p['nombre'],
        'especialidad'      => $p['especialidad'],
        'genero'            => $p['genero'],
        'servicios'         => array_column($p['servicios'], 'nombre'),
        'ubicacion'         => $p['ubicaciones'][0] ?? null,
        'precio_min'        => $p['precio_min'] !== null ? (int) $p['precio_min'] : null,
        'precio_max'        => $p['precio_max'] !== null ? (int) $p['precio_max'] : null,
        'anios_experiencia' => $p['anios_experiencia'] !== null ? (int) $p['anios_experiencia'] : null,
        'rating'            => $p['rating'] !== null ? (float) $p['rating'] : null,
        'num_opiniones'     => (int) $p['num_opiniones'],
        'idiomas'           => array_values(array_filter(array_map('trim', explode(',', (string) $p['idiomas'])))),
        'modalidad'         => array_values(array_filter(explode(',', (string) $p['modalidad']))),
        'disponibilidad'    => $p['disponibilidad'],
        'atiende_ninos'     => (int) $p['atiende_ninos'] === 1,
        'cedula_verificada' => (int) $p['cedula_verificada'] === 1,
        'bio'               => $p['bio'],
        'completitud'       => (int) $p['completitud'],
        'nivel'             => $p['nivel'],
    ];
}

<?php
/**
 * POST /api/guardar-doctor.php   (multipart/form-data)
 * ============================================================================
 * Guarda el perfil del doctor autenticado y recalcula su completitud y su nivel.
 * `completitud` y `nivel` NUNCA llegan del cliente: son la autoridad del servidor
 * (api/perfil.php).
 *
 * La cédula se sube con validación de tipo MIME REAL (finfo, no la extensión ni
 * lo que diga el navegador), tope de tamaño y nombre generado por el servidor.
 * El archivo cae en /uploads/cedulas, que está cerrado por .htaccess.
 */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/perfil.php';
require_once __DIR__ . '/auth-doctor.php';
require_once __DIR__ . '/ranking.php';

sendCors('POST, OPTIONS');
requireMethod('POST');
requireSameOrigin();

$sesion = bdRequerirDoctor();

if (!rateLimit('guardar:' . $sesion['id'], GUARDAR_RATE_MAX, GUARDAR_RATE_WINDOW)) {
    jsonError('Estás guardando demasiado seguido. Espera un momento.', 429);
}

/** Tipos aceptados para el documento de la cédula: MIME real => extensión. */
const BD_MIME_CEDULA = [
    'application/pdf' => 'pdf',
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
];

function campo(string $clave, int $max = 255): string
{
    return limpiarTexto($_POST[$clave] ?? '', $max);
}

function campoEnum(string $clave, array $permitidos): ?string
{
    $v = campo($clave, 40);
    return in_array($v, $permitidos, true) ? $v : null;
}

function campoEntero(string $clave, int $min, int $max): ?int
{
    $v = trim((string) ($_POST[$clave] ?? ''));
    if ($v === '' || !is_numeric($v)) return null;
    $n = (int) $v;
    return ($n < $min || $n > $max) ? null : $n;
}

/** Lista separada por comas, filtrada contra los valores permitidos. */
function campoLista(string $clave, array $permitidos): string
{
    $partes = array_filter(array_map('trim', explode(',', campo($clave, 200))));
    $ok = array_values(array_unique(array_filter($partes, fn($p) => in_array($p, $permitidos, true))));
    return implode(',', $ok);
}

/** Sube el documento de la cédula. Devuelve el nombre generado o null. */
function guardarCedula(): ?string
{
    if (!isset($_FILES['cedula_archivo']) || ($_FILES['cedula_archivo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $f = $_FILES['cedula_archivo'];

    if ($f['error'] !== UPLOAD_ERR_OK)      jsonError('No se pudo subir el archivo. Intenta de nuevo.', 422);
    if (!is_uploaded_file($f['tmp_name']))  jsonError('Archivo no válido.', 422);
    if ($f['size'] <= 0 || $f['size'] > BD_UPLOAD_MAX) {
        jsonError('El archivo debe pesar menos de ' . round(BD_UPLOAD_MAX / 1048576) . ' MB.', 422);
    }

    // Tipo MIME REAL, leído del contenido: la extensión y el Content-Type del
    // navegador los pone el cliente y no son de fiar.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($f['tmp_name']);
    if (!isset(BD_MIME_CEDULA[$mime])) {
        jsonError('Solo aceptamos PDF, JPG o PNG.', 422);
    }

    if (!is_dir(BD_UPLOAD_DIR) && !@mkdir(BD_UPLOAD_DIR, 0750, true)) {
        error_log('Buscador — no se pudo crear ' . BD_UPLOAD_DIR);
        jsonError('No pudimos guardar el archivo.', 500);
    }

    // Nombre generado por el servidor: nunca el que traía el cliente.
    $nombre = bin2hex(random_bytes(16)) . '.' . BD_MIME_CEDULA[$mime];
    if (!move_uploaded_file($f['tmp_name'], BD_UPLOAD_DIR . '/' . $nombre)) {
        error_log('Buscador — move_uploaded_file falló');
        jsonError('No pudimos guardar el archivo.', 500);
    }
    @chmod(BD_UPLOAD_DIR . '/' . $nombre, 0640);

    return $nombre;
}

try {
    $db      = getDB();
    $antes   = cargarPerfil($sesion['id']);
    if (!$antes) jsonError('Tu cuenta ya no está disponible.', 404);

    // ── Campos del perfil ───────────────────────────────────────────────
    $nombre         = campo('nombre', 120);
    $genero         = campoEnum('genero', ['M', 'F', 'X']);
    $telefono       = preg_replace('/[^0-9+ ]/', '', campo('telefono', 20));
    $cedula         = preg_replace('/[^0-9A-Za-z-]/', '', campo('cedula', 20));
    $anios          = campoEntero('anios_experiencia', 0, 70);
    $formacion      = campo('formacion', 500);
    $certificaciones= campo('certificaciones', 500);
    $idiomas        = campoLista('idiomas', ['es', 'en', 'fr', 'de', 'ja', 'pt', 'zh']);
    $modalidad      = campoLista('modalidad', ['consultorio', 'hospital', 'telemedicina']);
    $disponibilidad = campoEnum('disponibilidad', ['inmediata', 'esta_semana', 'programada']);
    $precioMin      = campoEntero('precio_min', 0, 100000);
    $precioMax      = campoEntero('precio_max', 0, 100000);
    $bio            = campo('bio', 1000);
    $atiendeNinos   = !empty($_POST['atiende_ninos'])   ? 1 : 0;
    $atiendeAdultos = !empty($_POST['atiende_adultos']) ? 1 : 0;

    if ($nombre === '') jsonError('Tu nombre no puede quedar vacío.', 422);
    if ($precioMin !== null && $precioMax !== null && $precioMax < $precioMin) {
        jsonError('El precio máximo no puede ser menor que el mínimo.', 422);
    }
    if ($cedula !== '' && !preg_match('/^[0-9]{6,10}$/', $cedula)) {
        jsonError('La cédula profesional debe tener entre 6 y 10 dígitos.', 422);
    }

    // Especialidad: tiene que existir en el catálogo.
    $especialidadId = campoEntero('especialidad_id', 1, PHP_INT_MAX);
    if ($especialidadId !== null) {
        $stmt = $db->prepare('SELECT id FROM ' . T_ESPECIALIDADES . ' WHERE id = ? AND activo = 1');
        $stmt->execute([$especialidadId]);
        if (!$stmt->fetch()) $especialidadId = null;
    }

    // Servicios: solo los que pertenecen a esa especialidad.
    $servicios = [];
    $crudos = json_decode((string) ($_POST['servicios'] ?? '[]'), true);
    if (is_array($crudos) && $especialidadId) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $crudos), fn($n) => $n > 0)));
        if ($ids) {
            $ph   = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->prepare("SELECT id FROM " . T_SERVICIOS . " WHERE especialidad_id = ? AND id IN ({$ph})");
            $stmt->execute(array_merge([$especialidadId], $ids));
            $servicios = array_map('intval', array_column($stmt->fetchAll(), 'id'));
        }
    }

    // Ubicaciones: máximo 3, con coordenadas tomadas del catálogo de zonas para
    // que la cercanía funcione sin geocodificador externo.
    $ubicaciones = [];
    $crudas = json_decode((string) ($_POST['ubicaciones'] ?? '[]'), true);
    if (is_array($crudas)) {
        foreach (array_slice($crudas, 0, 3) as $u) {
            if (!is_array($u)) continue;
            $colonia = limpiarTexto($u['colonia'] ?? '', 120);
            // Primero se quitan las letras y DESPUÉS se recorta: al revés,
            // "CP 06700" acababa en "06" y el consultorio perdía sus coordenadas.
            $cp      = substr(preg_replace('/[^0-9]/', '', limpiarTexto($u['cp'] ?? '', 40)), 0, 5);
            $nombreU = limpiarTexto($u['nombre'] ?? '', 160);
            if ($colonia === '' && $cp === '' && $nombreU === '') continue;

            $zona = resolverZona($cp !== '' ? $cp : $colonia);
            $ubicaciones[] = [
                'tipo'      => in_array($u['tipo'] ?? '', ['consultorio', 'hospital'], true) ? $u['tipo'] : 'consultorio',
                'nombre'    => $nombreU,
                'direccion' => limpiarTexto($u['direccion'] ?? '', 255),
                'colonia'   => $colonia,
                'ciudad'    => limpiarTexto($u['ciudad'] ?? '', 80) ?: ($zona['ciudad'] ?? 'Ciudad de México'),
                'cp'        => $cp !== '' ? $cp : ($zona['cp'] ?? null),
                'lat'       => $zona['lat'] ?? null,
                'lng'       => $zona['lng'] ?? null,
            ];
        }
    }

    $archivoNuevo = guardarCedula();
    $archivo      = $archivoNuevo ?: $antes['cedula_archivo'];

    // Sello de confianza: por ahora exige número con formato válido y documento
    // adjunto. La comprobación contra el registro público queda para después.
    // Un perfil YA verificado conserva el sello mientras no cambie su número de
    // cédula: si lo cambia, hay que volver a comprobarlo desde cero.
    $seguiaVerificado = (int) $antes['cedula_verificada'] === 1
        && $cedula !== ''
        && $cedula === (string) $antes['cedula'];
    $verificada = (($cedula !== '' && $archivo) || $seguiaVerificado) ? 1 : 0;

    // ── Completitud: la calcula el servidor con el perfil ya armado ─────
    $perfilNuevo = [
        'nombre'            => $nombre,
        'especialidad_id'   => $especialidadId,
        'servicios'         => $servicios,
        'ubicaciones'       => $ubicaciones,
        'telefono'          => $telefono,
        'genero'            => $genero,
        'anios_experiencia' => $anios,
        'formacion'         => $formacion,
        'precio_min'        => $precioMin,
        'precio_max'        => $precioMax,
        'bio'               => $bio,
        'idiomas'           => $idiomas,
        'modalidad'         => $modalidad,
        'disponibilidad'    => $disponibilidad,
        'cedula'            => $cedula,
        'cedula_archivo'    => $archivo,
    ];
    $completitud = calcularCompletitud($perfilNuevo);
    $nivel       = nivelPorCompletitud($completitud);

    $db->beginTransaction();

    $stmt = $db->prepare(
        'UPDATE ' . T_DOCTORES . ' SET nombre = ?, genero = ?, telefono = ?, cedula = ?, cedula_archivo = ?,
            cedula_verificada = ?, especialidad_id = ?, anios_experiencia = ?, formacion = ?,
            certificaciones = ?, idiomas = ?, atiende_ninos = ?, atiende_adultos = ?, modalidad = ?,
            disponibilidad = ?, precio_min = ?, precio_max = ?, bio = ?, completitud = ?, nivel = ?,
            updated_at = ?
         WHERE id = ?'
    );
    $stmt->execute([
        $nombre, $genero, $telefono ?: null, $cedula ?: null, $archivo, $verificada,
        $especialidadId, $anios, $formacion, $certificaciones, $idiomas,
        $atiendeNinos, $atiendeAdultos, $modalidad ?: null, $disponibilidad,
        $precioMin, $precioMax, $bio, $completitud, $nivel, ahora(), $sesion['id'],
    ]);

    $db->prepare('DELETE FROM ' . T_DOCTOR_SERVICIOS . ' WHERE doctor_id = ?')->execute([$sesion['id']]);
    if ($servicios) {
        $ins = $db->prepare('INSERT INTO ' . T_DOCTOR_SERVICIOS . ' (doctor_id, servicio_id) VALUES (?, ?)');
        foreach ($servicios as $sid) $ins->execute([$sesion['id'], $sid]);
    }

    $db->prepare('DELETE FROM ' . T_UBICACIONES . ' WHERE doctor_id = ?')->execute([$sesion['id']]);
    if ($ubicaciones) {
        $ins = $db->prepare(
            'INSERT INTO ' . T_UBICACIONES . ' (doctor_id, tipo, nombre, direccion, colonia, ciudad, cp, lat, lng)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($ubicaciones as $u) {
            $ins->execute([$sesion['id'], $u['tipo'], $u['nombre'], $u['direccion'], $u['colonia'], $u['ciudad'], $u['cp'], $u['lat'], $u['lng']]);
        }
    }

    $db->commit();

    // El archivo viejo se borra solo cuando la escritura salió bien.
    if ($archivoNuevo && $antes['cedula_archivo'] && $antes['cedula_archivo'] !== $archivoNuevo) {
        @unlink(BD_UPLOAD_DIR . '/' . basename($antes['cedula_archivo']));
    }

    $despues = cargarPerfil($sesion['id']);

    jsonOut([
        'ok'             => true,
        'completitud'    => $completitud,
        'nivel'          => $nivel,
        'ganados'        => $completitud - (int) $antes['completitud'],
        'subio_nivel'    => $nivel !== $antes['nivel'] && $completitud > (int) $antes['completitud'],
        'reglas'         => reglasCompletitud($despues),
        'vista_paciente' => perfilPublico($despues),
    ]);

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('Buscador — guardar-doctor: ' . $e->getMessage());
    jsonError('No pudimos guardar tu perfil. Intenta de nuevo.', 500);
}

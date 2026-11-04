<?php
/**
 * Buscador de Doctores — cargador de esquema y datos de prueba.
 *
 * SOLO por línea de comandos (nunca por HTTP: crea y borra tablas).
 *
 *   php db/cargar.php             → crea las tablas del prefijo y carga el seed
 *   php db/cargar.php --schema    → solo el esquema
 *   php db/cargar.php --seed      → solo los datos de prueba
 *   php db/cargar.php --reset     → vacía las tablas del prefijo y recarga todo
 *   php db/cargar.php --catalogos → solo especialidades, servicios y zonas (no toca
 *                                   los perfiles ya guardados)
 *
 * El prefijo de las tablas lo fija BD_PREFIJO (config.local.php): `bd_` son las
 * definitivas y `bd_demo_` las de la demo. Se imprime antes de tocar nada.
 *
 * En Hostinger no hay SSH: allí se pegan schema.sql y seed.sql en phpMyAdmin.
 * Este script existe para el desarrollo local.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Este script solo corre por línea de comandos.\n");
}

require_once __DIR__ . '/../config.php';

$args   = array_slice($argv, 1);
$reset  = in_array('--reset', $args, true);
$soloEs = in_array('--schema', $args, true);
$soloSe = in_array('--seed', $args, true);
$soloCat= in_array('--catalogos', $args, true);
$hacer  = ['schema' => !$soloSe && !$soloCat, 'seed' => !$soloEs];

/**
 * Parte un archivo .sql en sentencias respetando comillas y comentarios: los
 * datos de prueba llevan punto y coma dentro de los textos ("...; alta
 * especialidad en...") y un split ingenuo por ';' los rompería.
 */
function partirSql(string $sql): array
{
    $sentencias = [];
    $actual     = '';
    $comilla    = null;          // ' o " cuando vamos dentro de una cadena
    $len        = strlen($sql);

    for ($i = 0; $i < $len; $i++) {
        $c = $sql[$i];

        if ($comilla !== null) {
            $actual .= $c;
            if ($c === '\\' && $i + 1 < $len) {      // escape dentro de la cadena
                $actual .= $sql[++$i];
            } elseif ($c === $comilla) {
                $comilla = null;
            }
            continue;
        }

        // Comentario de línea (-- o #): se descarta hasta el salto de línea.
        if (($c === '-' && substr($sql, $i, 2) === '--') || $c === '#') {
            $fin  = strpos($sql, "\n", $i);
            $i    = $fin === false ? $len : $fin;
            $actual .= "\n";
            continue;
        }

        if ($c === "'" || $c === '"') {
            $comilla = $c;
            $actual .= $c;
            continue;
        }

        if ($c === ';') {
            if (trim($actual) !== '') $sentencias[] = trim($actual);
            $actual = '';
            continue;
        }

        $actual .= $c;
    }

    if (trim($actual) !== '') $sentencias[] = trim($actual);
    return $sentencias;
}

/**
 * Aplica BD_PREFIJO a los identificadores del .sql. Alcanza a las tablas y también
 * a `fk_bd_*` e `idx_bd_*`: en InnoDB el nombre de una clave foránea es único POR
 * BASE DE DATOS, así que crear bd_demo_* con las constraints de bd_* falla con
 * "duplicate foreign key constraint name".
 *
 * Sustituye solo FUERA de comillas. Hoy ningún dato del seed contiene "bd_", pero
 * el seed es dato: mañana una bio puede traerlo y no tiene por qué renombrarse.
 */
function aplicarPrefijo(string $sql): string
{
    if (BD_PREFIJO === 'bd_') return $sql;

    $out     = '';
    $comilla = null;
    $len     = strlen($sql);

    for ($i = 0; $i < $len; $i++) {
        $c = $sql[$i];

        if ($comilla !== null) {
            $out .= $c;
            if ($c === '\\' && $i + 1 < $len) {
                $out .= $sql[++$i];
            } elseif ($c === $comilla) {
                $comilla = null;
            }
            continue;
        }

        if ($c === "'" || $c === '"') {
            $comilla = $c;
            $out    .= $c;
            continue;
        }

        if (substr($sql, $i, 3) === 'bd_') {
            $out .= BD_PREFIJO;
            $i   += 2;
            continue;
        }

        $out .= $c;
    }

    return $out;
}

function ejecutarArchivo(PDO $db, string $ruta, ?callable $filtro = null): int
{
    if (!is_file($ruta)) {
        throw new RuntimeException("No existe {$ruta}");
    }
    $sentencias = partirSql(aplicarPrefijo(file_get_contents($ruta)));
    if ($filtro) $sentencias = array_values(array_filter($sentencias, $filtro));
    foreach ($sentencias as $sql) {
        $db->exec($sql);
    }
    return count($sentencias);
}

// Orden inverso al de las claves foráneas.
$tablasBd = [
    T_ELECCIONES,
    T_BUSQUEDAS,
    T_DOCTOR_SERVICIOS,
    T_UBICACIONES,
    T_DOCTORES,
    T_SERVICIOS,
    T_ESPECIALIDADES,
    T_ZONAS,
];

try {
    $db = getDB();
    echo 'Base: ' . DB_NAME . ' @ ' . DB_HOST . PHP_EOL;
    // El prefijo decide QUÉ TABLAS se van a crear y vaciar: se dice antes de tocar
    // nada, porque un --reset con el prefijo equivocado borra lo que no era.
    echo 'Prefijo: ' . BD_PREFIJO . '*' . PHP_EOL;

    if ($reset) {
        // Solo tablas del prefijo: el resto del ecosistema no se toca jamás.
        $db->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tablasBd as $t) {
            $db->exec("TRUNCATE TABLE `{$t}`");
            echo "  vaciada {$t}" . PHP_EOL;
        }
        $db->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    if ($hacer['schema']) {
        $n = ejecutarArchivo($db, __DIR__ . '/schema.sql');
        echo "Esquema aplicado ({$n} sentencias)." . PHP_EOL;
    }

    if ($hacer['seed']) {
        // Con --catalogos se recargan solo especialidades, servicios y zonas: sirve
        // para ampliar el vocabulario sin pisar los perfiles que ya se editaron.
        $catalogos = '/' . preg_quote(BD_PREFIJO, '/') . '(especialidades|servicios|zonas)\b/';
        $filtro = $soloCat
            ? fn($sql) => (bool) preg_match($catalogos, $sql)
            : null;
        $n = ejecutarArchivo($db, __DIR__ . '/seed.sql', $filtro);
        echo ($soloCat ? 'Catálogos recargados' : 'Datos de prueba cargados') . " ({$n} sentencias)." . PHP_EOL;
    }

    foreach ($tablasBd as $t) {
        $existe = $db->query("SHOW TABLES LIKE " . $db->quote($t))->fetch();
        $filas  = $existe ? $db->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn() : '—';
        printf("  %-26s %s\n", $t, $filas);
    }
    echo 'Listo.' . PHP_EOL;

} catch (Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

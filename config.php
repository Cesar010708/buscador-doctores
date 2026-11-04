<?php
/**
 * Buscador de Doctores — Configuración
 * ==============================================
 * Prototipo standalone: comparte la instancia de MariaDB y la cuenta de OpenAI de
 * la plataforma, pero vive en sus propias tablas `bd_*` y no toca nada del ecosistema.
 *
 * Todo se lee de variables de entorno (función env()). Tres formas de darlas,
 * de menor a mayor prioridad:
 *   1. `.env` en la raíz (ver .env.example). Nunca se versiona y `.htaccess`
 *      impide servirlo por HTTP.
 *   2. Variables del sistema o del servidor: un `.env` no las pisa.
 *   3. `config.local.php` con putenv(), para hosting donde no se pueden definir
 *      variables (formato heredado, ver config.local.php.example). Si existe,
 *      manda sobre las otras dos.
 */

/**
 * Carga `.env` si existe. PHP no lo lee por su cuenta y no hay Composer para
 * usar una librería, así que se parsea aquí: líneas CLAVE=valor, `#` para
 * comentarios, comillas opcionales. Una variable que ya existe no se pisa.
 */
function cargarDotenv(string $ruta): void {
    if (!is_readable($ruta)) return;
    $lineas = file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lineas === false) return;
    foreach ($lineas as $linea) {
        $linea = trim($linea);
        if ($linea === '' || $linea[0] === '#' || strpos($linea, '=') === false) continue;
        [$clave, $valor] = array_map('trim', explode('=', $linea, 2));
        if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $clave) || getenv($clave) !== false) continue;
        $comilla = $valor[0] ?? '';
        if (strlen($valor) >= 2 && ($comilla === '"' || $comilla === "'") && substr($valor, -1) === $comilla) {
            $valor = substr($valor, 1, -1);
        }
        putenv($clave . '=' . $valor);
    }
}

cargarDotenv(__DIR__ . '/.env');

if (file_exists(__DIR__ . '/config.local.php')) {
    require_once __DIR__ . '/config.local.php';
}

/**
 * Lee una variable de entorno. Comprueba contra false/'' y no con ?:, porque el
 * valor "0" es legítimo (BD_IA_ACTIVA=0) y un ?: lo descartaría como falsy.
 */
function env(string $key, string $default = ''): string {
    $v = getenv($key);
    if ($v !== false && $v !== '') return $v;
    if (isset($_ENV[$key])    && $_ENV[$key]    !== '') return (string) $_ENV[$key];
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return (string) $_SERVER[$key];
    return $default;
}

// ── Zona horaria ─────────────────────────────────────────────────────────────
// El servidor corre en UTC; las fechas se calculan en PHP (date()), nunca con
// NOW() de MySQL, para que la bitácora se lea en horario de México.
defined('APP_TIMEZONE') || define('APP_TIMEZONE', env('APP_TIMEZONE', 'America/Mexico_City'));
date_default_timezone_set(APP_TIMEZONE);

// ── MariaDB ──────────────────────────────────────────────────────────────────
defined('DB_HOST') || define('DB_HOST', env('DB_HOST', 'localhost'));
defined('DB_NAME') || define('DB_NAME', env('DB_NAME', ''));
defined('DB_USER') || define('DB_USER', env('DB_USER', ''));
defined('DB_PASS') || define('DB_PASS', env('DB_PASS', ''));
defined('DB_PORT') || define('DB_PORT', (int) env('DB_PORT', '3306'));

// ── Prefijo de tablas ────────────────────────────────────────────────────────
// La demo corre sobre `bd_demo_*` y las definitivas son `bd_*`: mudar de una a
// otra es cambiar esta variable, no el código.
//
// El nombre de una tabla NO puede viajar como parámetro preparado, así que se
// interpola en el SQL. Por eso se valida aquí, una sola vez y en el único sitio
// donde entra: sin esta comprobación, un prefijo con comillas sería inyección.
defined('BD_PREFIJO') || define('BD_PREFIJO', env('BD_PREFIJO', 'bd_'));
if (!preg_match('/^[a-z][a-z0-9_]*$/', BD_PREFIJO)) {
    throw new RuntimeException('BD_PREFIJO inválido: solo [a-z0-9_] y empezando por letra.');
}

// Las ÚNICAS tablas que este proyecto toca. El aislamiento del ecosistema se lee
// aquí de un vistazo: nada fuera de esta lista, ni en consulta ni en JOIN.
define('T_ESPECIALIDADES',   BD_PREFIJO . 'especialidades');
define('T_SERVICIOS',        BD_PREFIJO . 'servicios');
define('T_ZONAS',            BD_PREFIJO . 'zonas');
define('T_DOCTORES',         BD_PREFIJO . 'doctores');
define('T_DOCTOR_SERVICIOS', BD_PREFIJO . 'doctor_servicios');
define('T_UBICACIONES',      BD_PREFIJO . 'ubicaciones');
define('T_BUSQUEDAS',        BD_PREFIJO . 'busquedas');
define('T_ELECCIONES',       BD_PREFIJO . 'elecciones');

// ── OpenAI ───────────────────────────────────────────────────────────────────
// La IA solo interpreta el texto libre y redacta el "por qué". El ranking es
// determinista y vive en PHP (api/ranking.php).
defined('OPENAI_API_KEY')     || define('OPENAI_API_KEY',     env('OPENAI_API_KEY'));
defined('OPENAI_CHAT_MODEL')  || define('OPENAI_CHAT_MODEL',  env('OPENAI_CHAT_MODEL',  'gpt-4o-mini'));
defined('OPENAI_EMBED_MODEL') || define('OPENAI_EMBED_MODEL', env('OPENAI_EMBED_MODEL', 'text-embedding-3-small'));
// Con la IA apagada el buscador sigue funcionando: usa las justificaciones
// deterministas de plantilla. Útil para demos sin gastar tokens.
defined('BD_IA_ACTIVA')       || define('BD_IA_ACTIVA',       env('BD_IA_ACTIVA', '1') === '1');

// ── CORS ─────────────────────────────────────────────────────────────────────
// Origen explícito: los endpoints del doctor viajan con cookie de sesión y
// `*` junto a Allow-Credentials es una combinación que el navegador rechaza.
defined('BD_ORIGIN') || define('BD_ORIGIN', env('BD_ORIGIN', 'https://ejemplo.mx'));

// ── Rate limiting (por IP, ventana deslizante en archivo) ────────────────────
// La búsqueda cuesta dinero en OpenAI; el login se protege de fuerza bruta.
defined('BUSCAR_RATE_MAX')    || define('BUSCAR_RATE_MAX',    (int) env('BUSCAR_RATE_MAX',    '20'));
defined('BUSCAR_RATE_WINDOW') || define('BUSCAR_RATE_WINDOW', (int) env('BUSCAR_RATE_WINDOW', '60'));
defined('LOGIN_RATE_MAX')     || define('LOGIN_RATE_MAX',     (int) env('LOGIN_RATE_MAX',     '5'));
defined('LOGIN_RATE_WINDOW')  || define('LOGIN_RATE_WINDOW',  (int) env('LOGIN_RATE_WINDOW',  '60'));
defined('GUARDAR_RATE_MAX')   || define('GUARDAR_RATE_MAX',   (int) env('GUARDAR_RATE_MAX',   '30'));
defined('GUARDAR_RATE_WINDOW')|| define('GUARDAR_RATE_WINDOW',(int) env('GUARDAR_RATE_WINDOW','60'));

// ── Privacidad ───────────────────────────────────────────────────────────────
// La IP del paciente se guarda hasheada con sal, nunca en claro.
defined('BD_IP_SALT') || define('BD_IP_SALT', env('BD_IP_SALT', 'buscador-doctores-sal-por-defecto'));

// ── Uploads (cédula profesional) ─────────────────────────────────────────────
defined('BD_UPLOAD_DIR')  || define('BD_UPLOAD_DIR',  __DIR__ . '/uploads/cedulas');
defined('BD_UPLOAD_MAX')  || define('BD_UPLOAD_MAX',  (int) env('BD_UPLOAD_MAX', (string) (5 * 1024 * 1024)));

// ── PDO singleton ────────────────────────────────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

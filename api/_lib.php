<?php
/**
 * Buscador de Doctores — helpers compartidos del backend.
 * Portado del api/_lib.php de la plataforma: mismo CORS, mismo rate limit por archivo
 * con flock (hosting compartido, sin APCu ni Redis) y el mismo cliente HTTP.
 */

require_once __DIR__ . '/../config.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

// ─── CORS ───────────────────────────────────────────────────────────────────
/**
 * Origen explícito siempre: los endpoints del doctor viajan con cookie de sesión
 * y `Access-Control-Allow-Origin: *` junto a Allow-Credentials es una combinación
 * que el navegador rechaza.
 */
function sendCors(string $methods = 'POST, OPTIONS'): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Access-Control-Allow-Origin: ' . BD_ORIGIN);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: ' . $methods);
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Credentials: true');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Defensa contra peticiones cruzadas en los endpoints que cambian estado.
 * La cookie de sesión ya es SameSite=Lax, pero un `multipart/form-data` es una
 * petición "simple" y conviene la segunda cerradura: si viene un Origin y no es
 * ni el propio host ni el configurado, se rechaza. Sin cabecera Origin (curl,
 * peticiones del mismo documento en navegadores viejos) no se bloquea nada.
 */
function requireSameOrigin(): void
{
    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origen === '') return;

    $hostOrigen = parse_url($origen, PHP_URL_HOST);
    $permitidos = array_filter([
        $_SERVER['HTTP_HOST'] ?? null,
        parse_url(BD_ORIGIN, PHP_URL_HOST),
    ]);
    // El host de la petición puede traer puerto; se compara solo el nombre.
    $permitidos = array_map(fn($h) => explode(':', (string) $h)[0], $permitidos);

    if (!in_array((string) $hostOrigen, $permitidos, true)) {
        error_log('Buscador — origen rechazado: ' . $origen);
        jsonError('Petición no permitida desde ese origen.', 403);
    }
}

function jsonOut(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(string $mensaje, int $code = 400): void
{
    jsonOut(['ok' => false, 'error' => $mensaje], $code);
}

function requireMethod(string $metodo): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $metodo) {
        jsonError('Método no permitido', 405);
    }
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ─── Rate limiting ──────────────────────────────────────────────────────────
/**
 * IP con la que se limita el ritmo. A propósito NO usa X-Forwarded-For: esa
 * cabecera la pone quien llama, así que confiar en ella deja el freno de fuerza
 * bruta (y el tope de gasto en OpenAI) a un `curl` con cabecera falsa. Detrás de
 * un proxy compartido varios usuarios comparten cubeta; para el login es el
 * intercambio correcto.
 */
function clientIp(): string
{
    return trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

/**
 * La IP nunca se guarda en claro: solo su hash con sal, para poder contar
 * búsquedas por dispositivo sin poder identificarlo.
 */
function ipHash(?string $ip = null): string
{
    // HMAC-SHA256 recortado a 32 hex (lo que cabe en CHAR(32)): con MD5 y una sal
    // conocida el hash se revierte por fuerza bruta en segundos.
    // Para distinguir usuarios detrás de un mismo proxy se añade la cabecera de
    // reenvío; que sea manipulable solo ensucia la estadística de quien la falsee.
    $reenviada = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0]);
    $base      = ($ip ?? clientIp()) . '|' . $reenviada;
    return substr(hash_hmac('sha256', $base, BD_IP_SALT), 0, 32);
}

/**
 * Limitador por ventana deslizante respaldado en archivo: funciona en hosting
 * compartido, sin APCu ni Redis. Devuelve true si la petición está permitida.
 * Fail-open a propósito: sin almacenamiento temporal preferimos atender antes
 * que bloquear el buscador entero.
 */
function rateLimit(string $key, int $max, int $windowSec): bool
{
    $dir = sys_get_temp_dir() . '/bd_rl';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);

    // Barrido ocasional: sin esto el directorio acumula un archivo por clave para
    // siempre. Una de cada cien peticiones borra lo que ya no puede servir.
    if (random_int(1, 100) === 1) {
        foreach ((glob($dir . '/*.json') ?: []) as $viejo) {
            if (@filemtime($viejo) < time() - max(3600, $windowSec * 10)) @unlink($viejo);
        }
    }

    $fp = @fopen($dir . '/' . md5($key) . '.json', 'c+');
    if (!$fp) return true;

    @flock($fp, LOCK_EX);
    $now  = time();
    $raw  = stream_get_contents($fp);
    $hits = $raw ? json_decode($raw, true) : [];
    if (!is_array($hits)) $hits = [];

    $hits    = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - $windowSec));
    $allowed = count($hits) < $max;
    if ($allowed) $hits[] = $now;

    @ftruncate($fp, 0); @rewind($fp); @fwrite($fp, json_encode($hits));
    @flock($fp, LOCK_UN); @fclose($fp);

    return $allowed;
}

/** Fecha en horario de México (APP_TIMEZONE), calculada en PHP y no en MySQL. */
function ahora(): string
{
    return date('Y-m-d H:i:s');
}

// ─── Texto ──────────────────────────────────────────────────────────────────
/** Minúsculas, sin acentos y con espacios normalizados: base de todo el matching. */
function norm(?string $s): string
{
    $s = mb_strtolower(trim((string) $s), 'UTF-8');
    $s = strtr($s, [
        'á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n',
        'à'=>'a','è'=>'e','ì'=>'i','ò'=>'o','ù'=>'u','ç'=>'c',
    ]);
    return trim(preg_replace('/\s+/', ' ', $s));
}

/** Palabras de 3+ letras, sin las vacías del español. */
function tokens(string $s): array
{
    static $vacias = ['para','con','por','que','los','las','del','una','uno','mas','muy','pero','como','este','esta','soy','tengo','necesito','busco','quiero','algo','cerca','favor','doctor','doctora','medico','medica'];
    $palabras = preg_split('/[^a-z0-9]+/', norm($s), -1, PREG_SPLIT_NO_EMPTY);
    return array_values(array_filter($palabras, fn($p) => strlen($p) >= 3 && !in_array($p, $vacias, true)));
}

function limpiarTexto(?string $s, int $max): string
{
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', (string) $s);
    return mb_substr(trim($s), 0, $max, 'UTF-8');
}

// ─── HTTP (curl) ────────────────────────────────────────────────────────────
/**
 * Toda petición de red va envuelta: al usuario le llega un mensaje genérico y el
 * error real se va al log del servidor.
 */
function httpPostJson(string $url, array $headers, array $data, int $timeout = 30): ?array
{
    try {
        $ch = curl_init($url);
        $lineas = ['Content-Type: application/json'];
        foreach ($headers as $k => $v) $lineas[] = "{$k}: {$v}";

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => $lineas,
            CURLOPT_POSTFIELDS     => json_encode($data, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT        => $timeout,
        ]);

        $raw    = curl_exec($ch);
        $codigo = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        if ($raw === false || $codigo >= 400) {
            error_log("Buscador — POST {$url}: HTTP {$codigo} — {$err} — " . substr((string) $raw, 0, 500));
            return null;
        }

        $json = json_decode($raw, true);
        if (!is_array($json)) {
            error_log("Buscador — POST {$url}: respuesta no es JSON");
            return null;
        }
        return $json;
    } catch (Throwable $e) {
        error_log('Buscador — POST ' . $url . ': ' . $e->getMessage());
        return null;
    }
}

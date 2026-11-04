<?php
/**
 * Sesión del doctor (mismo patrón que el auth de la plataforma: cookie de sesión PHP,
 * contraseña con password_hash, versión de esquema para poder invalidar todo).
 * Cookie propia (BDDOC) para no pisar la sesión del panel de la plataforma.
 */

require_once __DIR__ . '/_lib.php';

/** Al subir este número caducan TODAS las sesiones abiertas. */
const BD_AUTH_VERSION = 1;

function bdIniciarSesion(): void
{
    if (session_status() !== PHP_SESSION_NONE) return;

    session_name('BDDOC');
    session_set_cookie_params([
        'lifetime' => 86400 * 7,
        'path'     => '/',
        // En local (http) una cookie Secure no se guarda; en Hostinger todo es HTTPS.
        'secure'   => (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? 'off') !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Devuelve el doctor autenticado o null. No corta la ejecución. */
function bdDoctorActual(): ?array
{
    bdIniciarSesion();
    if (empty($_SESSION['bd_doctor_id']) || (int) ($_SESSION['bd_auth_v'] ?? 0) < BD_AUTH_VERSION) {
        return null;
    }
    return [
        'id'    => (int) $_SESSION['bd_doctor_id'],
        'email' => (string) ($_SESSION['bd_doctor_email'] ?? ''),
    ];
}

/** Igual, pero responde 401 y termina si no hay sesión. */
function bdRequerirDoctor(): array
{
    $doctor = bdDoctorActual();
    if (!$doctor) {
        jsonError('Tu sesión terminó. Vuelve a entrar.', 401);
    }
    return $doctor;
}

/** Abre sesión para un doctor recién autenticado. */
function bdAbrirSesion(int $id, string $email): void
{
    bdIniciarSesion();
    session_regenerate_id(true);
    $_SESSION['bd_doctor_id']    = $id;
    $_SESSION['bd_doctor_email'] = $email;
    $_SESSION['bd_auth_v']       = BD_AUTH_VERSION;
}

function bdCerrarSesion(): void
{
    bdIniciarSesion();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

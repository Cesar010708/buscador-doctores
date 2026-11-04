<?php
/** POST /api/logout-doctor.php — cierra la sesion del doctor. */

require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/auth-doctor.php';

sendCors('POST, OPTIONS');
requireMethod('POST');
requireSameOrigin();

bdCerrarSesion();
jsonOut(['ok' => true]);

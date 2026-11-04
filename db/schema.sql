-- ============================================================================
-- Buscador de Doctores — Esquema MariaDB
-- ============================================================================
-- Prototipo. Vive en la MISMA base de la plataforma pero SOLO en tablas con prefijo
-- `bd_`; no toca ni referencia ninguna tabla del ecosistema existente.
-- Idempotente: se puede ejecutar las veces que haga falta.
-- Las fechas las escribe PHP en horario de México (APP_TIMEZONE), no MySQL/UTC.
-- ============================================================================

-- ── Catálogo de especialidades ──────────────────────────────────────────────
-- `sinonimos` es la taxonomía que ancla el texto libre del paciente ("me salen
-- granos") a una especialidad real. La IA solo puede mapear a estas filas.
CREATE TABLE IF NOT EXISTS bd_especialidades (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(80)  NOT NULL,
  slug      VARCHAR(80)  NOT NULL UNIQUE,
  sinonimos VARCHAR(600) NOT NULL DEFAULT '',
  activo    TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Catálogo de servicios (cuelga de una especialidad) ──────────────────────
CREATE TABLE IF NOT EXISTS bd_servicios (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  slug            VARCHAR(120) NOT NULL UNIQUE,
  especialidad_id INT          NOT NULL,
  sinonimos       VARCHAR(600) NOT NULL DEFAULT '',
  INDEX idx_bd_serv_esp (especialidad_id),
  CONSTRAINT fk_bd_serv_esp FOREIGN KEY (especialidad_id)
    REFERENCES bd_especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Catálogo de zonas ───────────────────────────────────────────────────────
-- Traduce lo que escribe el paciente ("Polanco", "11550") a coordenadas para el
-- eje de proximidad. Sin coordenadas, la proximidad cae a comparar CP y ciudad.
CREATE TABLE IF NOT EXISTS bd_zonas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(120)  NOT NULL,
  slug      VARCHAR(120)  NOT NULL UNIQUE,
  ciudad    VARCHAR(80)   NOT NULL DEFAULT 'Ciudad de México',
  cp        CHAR(5)       NULL,
  lat       DECIMAL(9,6)  NULL,
  lng       DECIMAL(9,6)  NULL,
  sinonimos VARCHAR(400)  NOT NULL DEFAULT '',
  INDEX idx_bd_zonas_cp (cp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Doctores: cuenta + perfil ───────────────────────────────────────────────
-- `email`/`pass_hash` son el registro self-service. `completitud` y `nivel` los
-- recalcula el servidor al guardar (api/guardar-doctor.php); nunca llegan del
-- cliente. `rating`/`num_opiniones` son datos de prueba: en producción saldrían
-- de opiniones reales de pacientes.
CREATE TABLE IF NOT EXISTS bd_doctores (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(160) NOT NULL UNIQUE,
  pass_hash         VARCHAR(255) NOT NULL,
  nombre            VARCHAR(120) NOT NULL DEFAULT '',
  genero            ENUM('M','F','X') NULL,
  telefono          VARCHAR(20)  NULL,
  cedula            VARCHAR(20)  NULL,
  cedula_archivo    VARCHAR(255) NULL,
  cedula_verificada TINYINT(1)   NOT NULL DEFAULT 0,
  especialidad_id   INT          NULL,
  anios_experiencia SMALLINT     NULL,
  formacion         VARCHAR(500) NOT NULL DEFAULT '',
  certificaciones   VARCHAR(500) NOT NULL DEFAULT '',
  idiomas           VARCHAR(120) NOT NULL DEFAULT '',
  atiende_ninos     TINYINT(1)   NOT NULL DEFAULT 0,
  atiende_adultos   TINYINT(1)   NOT NULL DEFAULT 1,
  modalidad         SET('consultorio','hospital','telemedicina') NULL,
  disponibilidad    ENUM('inmediata','esta_semana','programada') NULL,
  precio_min        INT          NULL,
  precio_max        INT          NULL,
  rating            DECIMAL(2,1) NULL,
  num_opiniones     INT          NOT NULL DEFAULT 0,
  bio               VARCHAR(1000) NOT NULL DEFAULT '',
  completitud       TINYINT      NOT NULL DEFAULT 0,
  nivel             ENUM('basico','destacado','top') NOT NULL DEFAULT 'basico',
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL,
  updated_at        DATETIME     NULL,
  INDEX idx_bd_doc_esp (especialidad_id),
  INDEX idx_bd_doc_activo (activo),
  CONSTRAINT fk_bd_doc_esp FOREIGN KEY (especialidad_id)
    REFERENCES bd_especialidades(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Servicios que ofrece cada doctor (M:N) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_doctor_servicios (
  doctor_id   INT NOT NULL,
  servicio_id INT NOT NULL,
  PRIMARY KEY (doctor_id, servicio_id),
  INDEX idx_bd_ds_serv (servicio_id),
  CONSTRAINT fk_bd_ds_doc  FOREIGN KEY (doctor_id)   REFERENCES bd_doctores(id)  ON DELETE CASCADE,
  CONSTRAINT fk_bd_ds_serv FOREIGN KEY (servicio_id) REFERENCES bd_servicios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Dónde atiende cada doctor ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_ubicaciones (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  tipo      ENUM('consultorio','hospital') NOT NULL DEFAULT 'consultorio',
  nombre    VARCHAR(160) NOT NULL DEFAULT '',
  direccion VARCHAR(255) NOT NULL DEFAULT '',
  colonia   VARCHAR(120) NOT NULL DEFAULT '',
  ciudad    VARCHAR(80)  NOT NULL DEFAULT 'Ciudad de México',
  cp        CHAR(5)      NULL,
  lat       DECIMAL(9,6) NULL,
  lng       DECIMAL(9,6) NULL,
  INDEX idx_bd_ubi_doc (doctor_id),
  INDEX idx_bd_ubi_cp (cp),
  CONSTRAINT fk_bd_ubi_doc FOREIGN KEY (doctor_id) REFERENCES bd_doctores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bitácora de búsquedas ───────────────────────────────────────────────────
-- Alimenta tres cosas: afinar el ranking, la prueba social REAL de la landing
-- del doctor y las métricas "cuántas veces apareciste". La IP se guarda hasheada
-- con sal (nunca en claro) y no se guarda ningún dato identificable del paciente.
CREATE TABLE IF NOT EXISTS bd_busquedas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  intake          JSON         NOT NULL,
  resultados      JSON         NOT NULL,
  especialidad_id INT          NULL,
  zona_slug       VARCHAR(120) NULL,
  num_resultados  SMALLINT     NOT NULL DEFAULT 0,
  ip_hash         CHAR(32)     NOT NULL,
  created_at      DATETIME     NOT NULL,
  INDEX idx_bd_busq_created (created_at),
  INDEX idx_bd_busq_esp (especialidad_id),
  INDEX idx_bd_busq_zona (zona_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Elecciones ──────────────────────────────────────────────────────────────
-- Cuando el paciente abre o contacta a un doctor del resultado. Es la otra mitad
-- de las métricas del doctor ("cuántas veces te eligieron").
CREATE TABLE IF NOT EXISTS bd_elecciones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  busqueda_id INT      NULL,
  doctor_id   INT      NOT NULL,
  posicion    SMALLINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL,
  INDEX idx_bd_elec_doc (doctor_id),
  INDEX idx_bd_elec_created (created_at),
  CONSTRAINT fk_bd_elec_doc  FOREIGN KEY (doctor_id)   REFERENCES bd_doctores(id)  ON DELETE CASCADE,
  CONSTRAINT fk_bd_elec_busq FOREIGN KEY (busqueda_id) REFERENCES bd_busquedas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

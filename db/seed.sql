-- ============================================================================
-- Buscador de Doctores — DATOS DE PRUEBA
-- ============================================================================
-- TODO lo de este archivo es FICTICIO: nombres inventados, cédulas con formato
-- válido pero falsas, opiniones simuladas. No corresponde a ningún médico real.
--
-- Los 25 perfiles están repartidos a propósito (zona, precio, experiencia,
-- reputación, completitud) para que TODOS los ejes del ranking se puedan
-- demostrar: el más cercano, el más económico, el más experimentado, el mejor
-- calificado y los contrastes ("muy buena pero lejos", "barato pero nuevo").
--
-- Todas las cuentas comparten la contraseña de prueba: demo1234
-- Cargar con:  php db/cargar.php --reset
-- ============================================================================

-- ── Especialidades ──────────────────────────────────────────────────────────
INSERT INTO bd_especialidades (id, nombre, slug, sinonimos) VALUES
(1,  'Dermatología',              'dermatologia',           'piel, acne, granos, barros, manchas, lunares, urticaria, comezon, dermatitis, caida de cabello, alopecia, ronchas, sarpullido, arde la piel, resequedad, hongos, unas, verrugas, picazon, me rasco, cicatriz, quemadura de sol'),
(2,  'Pediatría',                 'pediatria',              'ninos, nino, nina, bebe, infantil, vacunas, nino sano, fiebre en ninos, recien nacido, pediatra, mi hijo, mi hija, mi bebe, mi nino, mi nina, no quiere comer, se enfermo mi hijo'),
(3,  'Ginecología y Obstetricia', 'ginecologia',            'mujer, embarazo, papanicolaou, matriz, ovarios, menstruacion, regla, control prenatal, anticonceptivos, parto, ginecologo, dolor de vientre, sangrado, retraso, estoy embarazada, colicos fuertes, menopausia'),
(4,  'Cardiología',               'cardiologia',            'corazon, presion alta, hipertension, arritmia, palpitaciones, colesterol, dolor en el pecho, electrocardiograma, infarto, se me acelera el corazon, me falta el aire, se me cierra el pecho, presion'),
(5,  'Ortopedia y Traumatología', 'ortopedia',              'huesos, fractura, rodilla, columna, hombro, esguince, dolor de espalda, lesion deportiva, cadera, traumatologo, tobillo, me torci, torcedura, luxacion, muneca, brazo, pierna, cojeo, no puedo caminar, no puedo apoyar, me cai, golpe fuerte, dolor de rodilla, dolor de cuello, dolor lumbar'),
(6,  'Psiquiatría',               'psiquiatria',            'ansiedad, depresion, insomnio, ataques de panico, salud mental, estres, animo, psiquiatra, no puedo dormir, me siento triste, nervios, angustia, no tengo ganas de nada, ataques de nervios, pensamientos'),
(7,  'Nutrición',                 'nutricion',              'dieta, bajar de peso, sobrepeso, obesidad, alimentacion, plan alimenticio, nutriologo, nutricion, quiero bajar de peso, comer mejor, subir de peso, masa muscular'),
(8,  'Oftalmología',              'oftalmologia',           'ojos, vista, lentes, cataratas, glaucoma, vision borrosa, graduacion, oftalmologo, veo borroso, me arden los ojos, orzuelo, ojo rojo, no veo bien, me lloran los ojos'),
(9,  'Odontología',               'odontologia',            'dientes, muelas, caries, dentista, limpieza dental, ortodoncia, brackets, dolor de muela, encias, me duele una muela, encias sangran, mal aliento, diente roto, muela del juicio'),
(10, 'Endocrinología',            'endocrinologia',         'diabetes, tiroides, hormonas, azucar alta, insulina, endocrinologo, azucar, sudo mucho, mucha sed, se me cae el pelo por hormonas, cansancio todo el tiempo'),
(11, 'Otorrinolaringología',      'otorrinolaringologia',   'oidos, garganta, nariz, sinusitis, amigdalas, ronquidos, dolor de oido, anginas, dolor de garganta, nariz tapada, no huelo, zumbido en el oido, no escucho bien, ronco mucho, gripa que no se quita'),
(12, 'Medicina General y Familiar','medicina-general',      'consulta general, chequeo, gripa, medicina familiar, certificado medico, dolor de estomago, medico general, revision, no se a quien ir, malestar general, dolor de cabeza, fiebre, tos, diarrea, me siento mal, chequeo general, examenes de rutina')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), sinonimos = VALUES(sinonimos);

-- ── Servicios ───────────────────────────────────────────────────────────────
INSERT INTO bd_servicios (id, nombre, slug, especialidad_id, sinonimos) VALUES
(1,  'Consulta dermatológica',           'consulta-dermatologica',  1,  'revision de piel, dermatologo'),
(2,  'Tratamiento de acné',              'tratamiento-acne',        1,  'granos, barros, espinillas, acne'),
(3,  'Revisión de lunares',              'revision-lunares',        1,  'lunar, mancha, dermatoscopia, cancer de piel'),
(4,  'Dermatología pediátrica',          'dermatologia-pediatrica', 1,  'piel de ninos, dermatitis del panal'),
(5,  'Láser dermatológico',              'laser-dermatologico',     1,  'laser, manchas, cicatrices, rejuvenecimiento'),
(6,  'Caída de cabello',                 'caida-cabello',           1,  'alopecia, calvicie, se me cae el pelo'),
(7,  'Consulta pediátrica',              'consulta-pediatrica',     2,  'pediatra, consulta para ninos'),
(8,  'Control del niño sano',            'control-nino-sano',       2,  'crecimiento, peso y talla'),
(9,  'Vacunación infantil',              'vacunacion-infantil',     2,  'vacunas, cartilla'),
(10, 'Urgencias pediátricas',            'urgencias-pediatricas',   2,  'fiebre, urgencia con mi hijo'),
(11, 'Consulta ginecológica',            'consulta-ginecologica',   3,  'ginecologo, revision'),
(12, 'Control prenatal',                 'control-prenatal',        3,  'embarazo, estoy embarazada'),
(13, 'Papanicolaou',                     'papanicolaou',            3,  'papanicolau, citologia'),
(14, 'Colocación de DIU',                'colocacion-diu',          3,  'diu, anticonceptivo'),
(15, 'Ultrasonido obstétrico',           'ultrasonido-obstetrico',  3,  'ultrasonido, ecografia del bebe'),
(16, 'Consulta cardiológica',            'consulta-cardiologica',   4,  'cardiologo, revision del corazon'),
(17, 'Electrocardiograma',               'electrocardiograma',      4,  'ecg, electro'),
(18, 'Control de hipertensión',          'control-hipertension',    4,  'presion alta'),
(19, 'Ecocardiograma',                   'ecocardiograma',          4,  'ultrasonido del corazon'),
(20, 'Consulta ortopédica',              'consulta-ortopedica',     5,  'ortopedista, traumatologo'),
(21, 'Lesión deportiva',                 'lesion-deportiva',        5,  'me lesione jugando, esguince'),
(22, 'Dolor de columna',                 'dolor-columna',           5,  'espalda, lumbar, hernia de disco'),
(23, 'Cirugía de rodilla',               'cirugia-rodilla',         5,  'menisco, ligamento'),
(24, 'Atención de fracturas',            'atencion-fracturas',      5,  'me rompi, yeso, fractura'),
(25, 'Consulta psiquiátrica',            'consulta-psiquiatrica',   6,  'psiquiatra'),
(26, 'Ansiedad y depresión',             'ansiedad-depresion',      6,  'ansiedad, depresion, tristeza, panico'),
(27, 'Trastornos del sueño',             'trastornos-sueno',        6,  'insomnio, no puedo dormir'),
(28, 'Psiquiatría infantil',             'psiquiatria-infantil',    6,  'ninos, adolescentes, tdah'),
(29, 'Consulta nutricional',             'consulta-nutricional',    7,  'nutriologo, dieta'),
(30, 'Plan de pérdida de peso',          'plan-perdida-peso',       7,  'bajar de peso, adelgazar, sobrepeso'),
(31, 'Nutrición clínica',                'nutricion-clinica',       7,  'diabetes, colesterol, dieta medica'),
(32, 'Nutrición deportiva',              'nutricion-deportiva',     7,  'gimnasio, masa muscular, rendimiento'),
(33, 'Consulta oftalmológica',           'consulta-oftalmologica',  8,  'oftalmologo, revision de ojos'),
(34, 'Examen de la vista',               'examen-vista',            8,  'graduacion, lentes, no veo bien'),
(35, 'Cirugía de cataratas',             'cirugia-cataratas',       8,  'cataratas'),
(36, 'Control de glaucoma',              'control-glaucoma',        8,  'glaucoma, presion del ojo'),
(37, 'Consulta dental',                  'consulta-dental',         9,  'dentista, dolor de muela'),
(38, 'Limpieza dental',                  'limpieza-dental',         9,  'limpieza, sarro, profilaxis'),
(39, 'Ortodoncia',                       'ortodoncia',              9,  'brackets, alineadores, dientes chuecos'),
(40, 'Endodoncia',                       'endodoncia',              9,  'nervio, root canal, tratamiento de conductos'),
(41, 'Odontopediatría',                  'odontopediatria',         9,  'dentista para ninos'),
(42, 'Consulta endocrinológica',         'consulta-endocrinologica',10, 'endocrinologo, hormonas'),
(43, 'Control de diabetes',              'control-diabetes',        10, 'azucar alta, glucosa, insulina'),
(44, 'Tiroides',                         'tiroides',                10, 'hipotiroidismo, hipertiroidismo'),
(45, 'Control de obesidad',              'control-obesidad',        10, 'obesidad, metabolismo'),
(46, 'Consulta otorrinolaringológica',   'consulta-otorrino',       11, 'otorrino, oidos nariz garganta'),
(47, 'Sinusitis',                        'sinusitis',               11, 'sinusitis, congestion'),
(48, 'Amígdalas',                        'amigdalas',               11, 'anginas, amigdalitis'),
(49, 'Audiometría',                      'audiometria',             11, 'no oigo bien, estudio de audicion'),
(50, 'Consulta general',                 'consulta-general',        12, 'medico general, consulta'),
(51, 'Chequeo anual',                    'chequeo-anual',           12, 'chequeo, revision general, check up'),
(52, 'Certificado médico',               'certificado-medico',      12, 'certificado, constancia medica'),
(53, 'Atención a domicilio',             'atencion-domicilio',      12, 'visita a casa, a domicilio')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), sinonimos = VALUES(sinonimos);

-- ── Zonas (Ciudad de México y área metropolitana) ───────────────────────────
INSERT INTO bd_zonas (id, nombre, slug, ciudad, cp, lat, lng, sinonimos) VALUES
(1,  'Polanco',     'polanco',     'Ciudad de México', '11550', 19.433000, -99.190000, 'miguel hidalgo, masaryk'),
(2,  'Anzures',     'anzures',     'Ciudad de México', '11590', 19.429000, -99.178000, 'reforma, miguel hidalgo'),
(3,  'Roma Norte',  'roma-norte',  'Ciudad de México', '06700', 19.418500, -99.162000, 'colonia roma, la roma'),
(4,  'Condesa',     'condesa',     'Ciudad de México', '06140', 19.411000, -99.175000, 'hipodromo, la condesa'),
(5,  'Del Valle',   'del-valle',   'Ciudad de México', '03100', 19.383000, -99.166000, 'benito juarez, valle'),
(6,  'Narvarte',    'narvarte',    'Ciudad de México', '03020', 19.393000, -99.152000, 'benito juarez'),
(7,  'Nápoles',     'napoles',     'Ciudad de México', '03810', 19.396000, -99.178000, 'insurgentes sur, world trade center, wtc'),
(8,  'Coyoacán',    'coyoacan',    'Ciudad de México', '04000', 19.350000, -99.162000, 'centro de coyoacan, viveros'),
(9,  'San Ángel',   'san-angel',   'Ciudad de México', '01000', 19.345000, -99.190000, 'pedregal, alvaro obregon'),
(10, 'Santa Fe',    'santa-fe',    'Ciudad de México', '01219', 19.360000, -99.260000, 'cuajimalpa, alvaro obregon'),
(11, 'Interlomas',  'interlomas',  'Huixquilucan',     '52786', 19.393000, -99.283000, 'huixquilucan, bosques'),
(12, 'Satélite',    'satelite',    'Naucalpan',        '53100', 19.510000, -99.234000, 'naucalpan, ciudad satelite'),
(13, 'Lindavista',  'lindavista',  'Ciudad de México', '07300', 19.488000, -99.129000, 'gustavo a madero, gam'),
(14, 'Tlalpan',     'tlalpan',     'Ciudad de México', '14000', 19.290000, -99.167000, 'villa coapa, sur'),
(15, 'Iztapalapa',  'iztapalapa',  'Ciudad de México', '09000', 19.357000, -99.074000, 'oriente'),
(16, 'Ecatepec',    'ecatepec',    'Ecatepec',         '55020', 19.600000, -99.050000, 'estado de mexico, edomex'),
(17, 'Doctores',    'doctores',    'Ciudad de México', '06720', 19.413000, -99.144000, 'cuauhtemoc, centro')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), lat = VALUES(lat), lng = VALUES(lng);

-- ── Doctores (perfiles ficticios) ───────────────────────────────────────────
-- Contraseña de todas las cuentas de prueba: demo1234
INSERT INTO bd_doctores
  (id, email, pass_hash, nombre, genero, telefono, cedula, cedula_verificada, especialidad_id,
   anios_experiencia, formacion, certificaciones, idiomas, atiende_ninos, atiende_adultos,
   modalidad, disponibilidad, precio_min, precio_max, rating, num_opiniones, bio,
   completitud, nivel, activo, created_at)
VALUES
-- Dermatología ---------------------------------------------------------------
(1, 'mariana.robles@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Mariana Robles Cifuentes', 'F', '5512340001', '9900000001', 1, 1,
 14, 'Médico Cirujano, UNAM. Especialidad en Dermatología, Centro Dermatológico Pascua.',
 'Consejo Mexicano de Dermatología', 'es,en', 1, 1,
 'consultorio,telemedicina', 'esta_semana', 900, 1300, 4.8, 214,
 'Dermatóloga clínica con enfoque en acné y dermatitis. Atiende adolescentes y adultos, con seguimiento por videoconsulta entre citas.',
 96, 'top', 1, '2026-03-04 10:15:00'),

(2, 'rodrigo.elizondo@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Rodrigo Elizondo Paz', 'M', '5512340002', '9900000002', 1, 1,
 9, 'Médico Cirujano, Universidad Anáhuac. Especialidad en Dermatología, Hospital General de México.',
 'Consejo Mexicano de Dermatología', 'es,en', 0, 1,
 'consultorio', 'inmediata', 1600, 2400, 4.6, 96,
 'Dermatología estética y láser. Consultorio en Polanco con equipo de dermatoscopia digital.',
 82, 'destacado', 1, '2026-03-19 12:40:00'),

(3, 'ismael.cuevas@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Ismael Cuevas Trejo', 'M', '5512340003', '9900000003', 0, 1,
 3, 'Médico Cirujano, IPN. Especialidad en Dermatología, Centro Médico La Raza.',
 '', 'es', 1, 1,
 'consultorio', 'inmediata', 400, 650, 4.4, 27,
 'Recién egresado de la especialidad. Consulta accesible en Lindavista, con cita el mismo día.',
 61, 'basico', 1, '2026-06-11 09:05:00'),

(4, 'beatriz.nakamura@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Beatriz Nakamura Oliva', 'F', '5512340004', '9900000004', 1, 1,
 24, 'Médico Cirujano, UNAM. Especialidad en Dermatología y alta especialidad en Oncología Cutánea.',
 'Consejo Mexicano de Dermatología; Academia Mexicana de Dermatología', 'es,en,ja', 1, 1,
 'hospital,consultorio', 'programada', 1100, 1700, 4.9, 351,
 'Veinticuatro años en dermatología oncológica. Revisión de lunares y seguimiento de cáncer de piel en Satélite.',
 90, 'top', 1, '2026-03-02 08:30:00'),

-- Pediatría ------------------------------------------------------------------
(5, 'lucia.ferrer@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Lucía Ferrer Aguayo', 'F', '5512340005', '9900000005', 1, 2,
 16, 'Médico Cirujano, UNAM. Especialidad en Pediatría, Hospital Infantil de México.',
 'Consejo Mexicano de Certificación en Pediatría', 'es,en', 1, 0,
 'consultorio,telemedicina', 'esta_semana', 800, 1100, 4.9, 188,
 'Pediatra con enfoque en control del niño sano y lactancia. Videoconsulta para dudas de seguimiento.',
 94, 'top', 1, '2026-03-07 11:20:00'),

(6, 'anibal.ortega@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Aníbal Ortega Rendón', 'M', '5512340006', '9900000006', 1, 2,
 28, 'Médico Cirujano, UAM. Especialidad en Pediatría y alta especialidad en Neonatología.',
 'Consejo Mexicano de Certificación en Pediatría', 'es', 1, 0,
 'hospital', 'programada', 1200, 1800, 4.7, 265,
 'Pediatra neonatólogo con 28 años de práctica hospitalaria en Santa Fe.',
 87, 'destacado', 1, '2026-03-12 16:00:00'),

(7, 'paola.zuniga@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Paola Zúñiga Marroquín', 'F', '5512340007', '9900000007', 0, 2,
 5, 'Médico Cirujano, UAEM. Especialidad en Pediatría, Hospital Pediátrico de Iztapalapa.',
 '', 'es', 1, 0,
 'consultorio', 'inmediata', 500, 750, 4.5, 41,
 'Consulta pediátrica en Iztapalapa, con horario extendido de lunes a sábado.',
 68, 'basico', 1, '2026-05-28 18:45:00'),

-- Ginecología ----------------------------------------------------------------
(8, 'renata.villasenor@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Renata Villaseñor Cobos', 'F', '5512340008', '9900000008', 1, 3,
 12, 'Médico Cirujano, UNAM. Especialidad en Ginecología y Obstetricia, INPer.',
 'Consejo Mexicano de Ginecología y Obstetricia', 'es,en', 0, 1,
 'consultorio,hospital', 'esta_semana', 1000, 1500, 4.8, 173,
 'Ginecología integral y control prenatal de bajo riesgo. Consultorio en la Condesa.',
 92, 'top', 1, '2026-03-21 10:00:00'),

(9, 'sofia.bermudez@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Sofía Bermúdez Lara', 'F', '5512340009', '9900000009', 1, 3,
 21, 'Médico Cirujano, Universidad La Salle. Especialidad en Ginecología y Obstetricia; alta especialidad en Medicina Materno-Fetal.',
 'Consejo Mexicano de Ginecología y Obstetricia', 'es,en', 0, 1,
 'hospital', 'programada', 1500, 2200, 4.9, 298,
 'Embarazo de alto riesgo y medicina materno-fetal. Atiende en hospital de Interlomas.',
 85, 'destacado', 1, '2026-04-02 09:30:00'),

(10, 'guillermo.anaya@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Guillermo Anaya Pérez', 'M', '5512340010', '9900000010', 0, 3,
 7, 'Médico Cirujano, UAEM. Especialidad en Ginecología y Obstetricia.',
 '', 'es', 0, 1,
 'consultorio', 'inmediata', 600, 900, 4.3, 54,
 'Consulta ginecológica general en Ecatepec, con cita el mismo día.',
 64, 'basico', 1, '2026-06-25 13:10:00'),

-- Cardiología ----------------------------------------------------------------
(11, 'emilio.cardoso@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Emilio Cardoso Ibarra', 'M', '5512340011', '9900000011', 1, 4,
 19, 'Médico Cirujano, UNAM. Especialidad en Cardiología, Instituto Nacional de Cardiología.',
 'Consejo Mexicano de Cardiología', 'es,en', 0, 1,
 'hospital,consultorio', 'esta_semana', 1400, 2000, 4.8, 207,
 'Cardiología clínica y estudios no invasivos. Consultorio en Nápoles, junto al WTC.',
 91, 'top', 1, '2026-03-15 15:25:00'),

(12, 'norma.salgado@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Norma Salgado Rentería', 'F', '5512340012', '9900000012', 1, 4,
 11, 'Médico Cirujano, IPN. Especialidad en Cardiología, Centro Médico Siglo XXI.',
 'Consejo Mexicano de Cardiología', 'es', 0, 1,
 'consultorio,telemedicina', 'inmediata', 900, 1300, 4.6, 119,
 'Control de hipertensión y riesgo cardiovascular, con seguimiento por videoconsulta.',
 79, 'destacado', 1, '2026-04-18 11:50:00'),

-- Ortopedia ------------------------------------------------------------------
(13, 'fabian.quiroz@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Fabián Quiroz Medina', 'M', '5512340013', '9900000013', 1, 5,
 15, 'Médico Cirujano, UNAM. Especialidad en Ortopedia y Traumatología; alta especialidad en Rodilla y Artroscopia.',
 'Consejo Mexicano de Ortopedia y Traumatología', 'es', 0, 1,
 'hospital,consultorio', 'esta_semana', 1200, 1900, 4.7, 162,
 'Cirugía artroscópica de rodilla y hombro, y lesiones deportivas. Atiende en San Ángel.',
 88, 'destacado', 1, '2026-03-27 17:05:00'),

(14, 'tadeo.villalpando@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Tadeo Villalpando Ruiz', 'M', '5512340014', '9900000014', 0, 5,
 6, 'Médico Cirujano, UAEM. Especialidad en Ortopedia y Traumatología.',
 '', 'es', 1, 1,
 'consultorio', 'inmediata', 700, 1000, 4.4, 48,
 'Ortopedia general, esguinces y fracturas. Consultorio en Tlalpan con atención sin cita previa.',
 66, 'basico', 1, '2026-06-05 12:15:00'),

-- Psiquiatría ----------------------------------------------------------------
(15, 'sebastian.aguirre@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Sebastián Aguirre Loyola', 'M', '5512340015', '9900000015', 1, 6,
 13, 'Médico Cirujano, UNAM. Especialidad en Psiquiatría, Instituto Nacional de Psiquiatría.',
 'Consejo Mexicano de Psiquiatría', 'es,en', 0, 1,
 'consultorio,telemedicina', 'esta_semana', 1100, 1600, 4.8, 143,
 'Trastornos de ansiedad y del estado de ánimo en adultos. Consulta presencial en la Roma y en línea.',
 89, 'destacado', 1, '2026-04-09 10:35:00'),

(16, 'ximena.peralta@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Ximena Peralta Cordero', 'F', '5512340016', '9900000016', 1, 6,
 8, 'Médico Cirujano, Universidad Panamericana. Especialidad en Psiquiatría; alta especialidad en Psiquiatría Infantil y de la Adolescencia.',
 'Consejo Mexicano de Psiquiatría', 'es,en', 1, 1,
 'telemedicina', 'inmediata', 800, 1200, 4.7, 86,
 'Psiquiatría de niños y adolescentes, 100% por videoconsulta, con cita en menos de 48 horas.',
 76, 'destacado', 1, '2026-05-14 19:20:00'),

-- Nutrición ------------------------------------------------------------------
(17, 'daniela.escamilla@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Lic. Daniela Escamilla Ponce', 'F', '5512340017', '9900000017', 1, 7,
 6, 'Licenciatura en Nutrición, UIC. Maestría en Nutrición Clínica.',
 'Colegio Mexicano de Nutriólogos', 'es', 1, 1,
 'consultorio,telemedicina', 'inmediata', 450, 700, 4.7, 112,
 'Planes de alimentación para control de peso y nutrición clínica. Consulta en Narvarte o en línea.',
 83, 'destacado', 1, '2026-04-23 14:00:00'),

-- Oftalmología ---------------------------------------------------------------
(18, 'carmen.iturbe@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Carmen Iturbe Salcedo', 'F', '5512340018', '9900000018', 1, 8,
 22, 'Médico Cirujano, UNAM. Especialidad en Oftalmología, APEC; alta especialidad en Segmento Anterior.',
 'Consejo Mexicano de Oftalmología', 'es,en', 1, 1,
 'hospital,consultorio', 'programada', 1300, 1900, 4.9, 241,
 'Cirugía de catarata y córnea, con más de veinte años de práctica. Atiende en Anzures.',
 93, 'top', 1, '2026-03-09 09:45:00'),

-- Odontología ----------------------------------------------------------------
(19, 'alejandra.manriquez@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Alejandra Manríquez Gil', 'F', '5512340019', '9900000019', 1, 9,
 10, 'Cirujano Dentista, UNAM. Especialidad en Odontopediatría.',
 'Asociación Dental Mexicana', 'es,en', 1, 1,
 'consultorio', 'inmediata', 600, 1400, 4.8, 196,
 'Odontología general y para niños. Consultorio en Del Valle con horario vespertino.',
 90, 'top', 1, '2026-04-06 16:30:00'),

(20, 'nestor.cabrera@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Néstor Cabrera Ochoa', 'M', '5512340020', '9900000020', 0, 9,
 17, 'Cirujano Dentista, UAM. Especialidad en Ortodoncia.',
 'Asociación Dental Mexicana', 'es', 0, 1,
 'consultorio', 'esta_semana', 900, 2000, 4.6, 128,
 'Ortodoncia con brackets y alineadores para adolescentes y adultos, en Coyoacán.',
 74, 'destacado', 1, '2026-05-02 13:40:00'),

-- Endocrinología -------------------------------------------------------------
(21, 'veronica.lugo@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Verónica Lugo Estrada', 'F', '5512340021', '9900000021', 1, 10,
 18, 'Médico Cirujano, UNAM. Especialidad en Medicina Interna y Endocrinología, INCMNSZ.',
 'Consejo Mexicano de Endocrinología', 'es,en', 0, 1,
 'consultorio,telemedicina', 'esta_semana', 1200, 1700, 4.8, 158,
 'Diabetes tipo 2, tiroides y obesidad. Consultorio en Del Valle con seguimiento en línea.',
 86, 'destacado', 1, '2026-03-30 11:05:00'),

-- Otorrinolaringología -------------------------------------------------------
(22, 'julian.mercado@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Julián Mercado Ávila', 'M', '5512340022', '9900000022', 0, 11,
 9, 'Médico Cirujano, IPN. Especialidad en Otorrinolaringología, Hospital Juárez de México.',
 '', 'es', 1, 1,
 'consultorio,hospital', 'esta_semana', 900, 1400, 4.5, 67,
 'Sinusitis, amigdalitis y estudios de audición. Consultorio en Lindavista.',
 70, 'basico', 1, '2026-05-19 15:55:00'),

-- Medicina General y Familiar ------------------------------------------------
(23, 'itzel.camargo@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Itzel Camargo Bravo', 'F', '5512340023', '9900000023', 1, 12,
 5, 'Médico Cirujano, UNAM. Diplomado en Medicina Familiar.',
 '', 'es', 1, 1,
 'consultorio,telemedicina', 'inmediata', 350, 500, 4.6, 91,
 'Consulta general y certificados médicos en la colonia Doctores. Atiende el mismo día.',
 77, 'destacado', 1, '2026-04-28 08:50:00'),

(24, 'arturo.penaloza@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dr. Arturo Peñaloza Vidal', 'M', '5512340024', '9900000024', 1, 12,
 31, 'Médico Cirujano, UNAM. Especialidad en Medicina Familiar, IMSS.',
 'Consejo Mexicano de Medicina Familiar', 'es', 1, 1,
 'consultorio', 'esta_semana', 700, 1000, 4.9, 312,
 'Médico familiar con 31 años de consulta en Coyoacán. Atiende a toda la familia.',
 95, 'top', 1, '2026-03-05 10:10:00'),

(25, 'fernanda.uribe@example.com', '$2y$12$gi6AFDkip4Ggd8F8Vb4eR.jTUdC9OEitNNyFy.fg5zk4InGV2ic3q',
 'Dra. Fernanda Uribe Solís', 'F', '5512340025', '9900000025', 0, 12,
 2, 'Médico Cirujano, UAEM.',
 '', 'es', 1, 1,
 'consultorio,telemedicina', 'inmediata', 300, 450, 4.2, 12,
 'Consulta general accesible en Ecatepec y videoconsulta.',
 52, 'basico', 1, '2026-07-16 17:35:00')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), completitud = VALUES(completitud), nivel = VALUES(nivel);

-- ── Servicios de cada doctor ────────────────────────────────────────────────
INSERT INTO bd_doctor_servicios (doctor_id, servicio_id) VALUES
(1,1),(1,2),(1,3),(1,4),(1,6),
(2,1),(2,2),(2,3),(2,5),
(3,1),(3,2),(3,4),
(4,1),(4,3),(4,5),(4,6),
(5,7),(5,8),(5,9),
(6,7),(6,8),(6,9),(6,10),
(7,7),(7,8),(7,10),
(8,11),(8,12),(8,13),(8,14),
(9,11),(9,12),(9,15),
(10,11),(10,13),
(11,16),(11,17),(11,18),(11,19),
(12,16),(12,17),(12,18),
(13,20),(13,21),(13,22),(13,23),(13,24),
(14,20),(14,21),(14,24),
(15,25),(15,26),(15,27),
(16,25),(16,26),(16,28),
(17,29),(17,30),(17,31),(17,32),
(18,33),(18,34),(18,35),(18,36),
(19,37),(19,38),(19,40),(19,41),
(20,37),(20,39),(20,40),
(21,42),(21,43),(21,44),(21,45),
(22,46),(22,47),(22,48),(22,49),
(23,50),(23,51),(23,52),
(24,50),(24,51),(24,52),(24,53),
(25,50),(25,52)
ON DUPLICATE KEY UPDATE doctor_id = VALUES(doctor_id);

-- ── Ubicaciones ─────────────────────────────────────────────────────────────
INSERT INTO bd_ubicaciones (id, doctor_id, tipo, nombre, direccion, colonia, ciudad, cp, lat, lng) VALUES
(1,  1,  'consultorio', 'Consultorio Roma Norte',        'Av. Álvaro Obregón 145, piso 4',   'Roma Norte',  'Ciudad de México', '06700', 19.418500, -99.162000),
(2,  2,  'consultorio', 'Clínica Dermatológica Polanco', 'Av. Presidente Masaryk 320, of. 8','Polanco',     'Ciudad de México', '11550', 19.433000, -99.190000),
(3,  3,  'consultorio', 'Consultorio Lindavista',        'Av. Instituto Politécnico Nacional 1650','Lindavista','Ciudad de México','07300', 19.488000, -99.129000),
(4,  4,  'consultorio', 'Consultorio Satélite',          'Blvd. Manuel Ávila Camacho 2900',  'Satélite',    'Naucalpan',        '53100', 19.510000, -99.234000),
(5,  4,  'hospital',    'Hospital Ceiba Lindavista',   'Calle de los Fresnos 120',                    'Lindavista',  'Ciudad de México', '07300', 19.488000, -99.129000),
(6,  5,  'consultorio', 'Consultorio Del Valle',         'Av. Coyoacán 1435, cons. 302',     'Del Valle',   'Ciudad de México', '03100', 19.383000, -99.166000),
(7,  6,  'hospital',    'Hospital Ceiba Santa Fe',          'Av. de los Encinos 300',        'Santa Fe',    'Ciudad de México', '01219', 19.360000, -99.260000),
(8,  7,  'consultorio', 'Consultorio Iztapalapa',        'Av. Ermita Iztapalapa 2210',       'Iztapalapa',  'Ciudad de México', '09000', 19.357000, -99.074000),
(9,  8,  'consultorio', 'Consultorio Condesa',           'Av. Michoacán 88, cons. 5',        'Condesa',     'Ciudad de México', '06140', 19.411000, -99.175000),
(10, 8,  'hospital',    'Hospital Ceiba Anzures',              'Calle de los Olmos 45',        'Anzures',     'Ciudad de México', '11590', 19.429000, -99.178000),
(11, 9,  'hospital',    'Hospital Ceiba Interlomas',           'Paseo de los Cedros 18',       'Interlomas',  'Huixquilucan',     '52786', 19.393000, -99.283000),
(12, 10, 'consultorio', 'Consultorio Ecatepec',          'Av. Central 145',                  'Ecatepec',    'Ecatepec',         '55020', 19.600000, -99.050000),
(13, 11, 'consultorio', 'Consultorio Nápoles',           'Montecito 38, piso 12',            'Nápoles',     'Ciudad de México', '03810', 19.396000, -99.178000),
(14, 11, 'hospital',    'Hospital Ceiba Escandón',       'Calle de los Sauces 210',                    'Escandón',    'Ciudad de México', '11800', 19.402000, -99.187000),
(15, 12, 'consultorio', 'Consultorio Narvarte',          'Av. Universidad 419, cons. 7',     'Narvarte',    'Ciudad de México', '03020', 19.393000, -99.152000),
(16, 13, 'consultorio', 'Consultorio San Ángel',         'Av. Revolución 1877, of. 601',     'San Ángel',   'Ciudad de México', '01000', 19.345000, -99.190000),
(17, 13, 'hospital',    'Hospital Ceiba Pedregal',     'Camino de los Pinos 900',        'Héroes de Padierna','Ciudad de México','10700', 19.310000, -99.213000),
(18, 14, 'consultorio', 'Consultorio Tlalpan',           'Calz. de Tlalpan 4585',            'Tlalpan',     'Ciudad de México', '14000', 19.290000, -99.167000),
(19, 15, 'consultorio', 'Consultorio Roma',              'Cda. de Frontera 12, int. 3',      'Roma Norte',  'Ciudad de México', '06700', 19.418500, -99.162000),
(20, 16, 'consultorio', 'Solo videoconsulta',            'Atención 100% en línea',           'Coyoacán',    'Ciudad de México', '04000', 19.350000, -99.162000),
(21, 17, 'consultorio', 'Consultorio Narvarte',          'Av. Cuauhtémoc 1236, cons. 4',     'Narvarte',    'Ciudad de México', '03020', 19.393000, -99.152000),
(22, 18, 'consultorio', 'Consultorio Anzures',           'Leibnitz 32, of. 205',             'Anzures',     'Ciudad de México', '11590', 19.429000, -99.178000),
(23, 18, 'hospital',    'Hospital Ceiba Anzures',              'Calle de los Olmos 45',        'Anzures',     'Ciudad de México', '11590', 19.429000, -99.178000),
(24, 19, 'consultorio', 'Consultorio Del Valle',         'Pilares 210, cons. 2',             'Del Valle',   'Ciudad de México', '03100', 19.383000, -99.166000),
(25, 20, 'consultorio', 'Consultorio Coyoacán',          'Av. Miguel Ángel de Quevedo 615',  'Coyoacán',    'Ciudad de México', '04000', 19.350000, -99.162000),
(26, 21, 'consultorio', 'Consultorio Del Valle',         'Av. Insurgentes Sur 1188, of. 9',  'Del Valle',   'Ciudad de México', '03100', 19.383000, -99.166000),
(27, 22, 'consultorio', 'Consultorio Lindavista',        'Av. Montevideo 402',               'Lindavista',  'Ciudad de México', '07300', 19.488000, -99.129000),
(28, 22, 'hospital',    'Hospital Ceiba Norte',     'Av. de las Jacarandas 5100','Magdalena de las Salinas','Ciudad de México','07760', 19.500000, -99.140000),
(29, 23, 'consultorio', 'Consultorio Doctores',          'Dr. Vértiz 185, cons. 1',          'Doctores',    'Ciudad de México', '06720', 19.413000, -99.144000),
(30, 24, 'consultorio', 'Consultorio Coyoacán',          'Av. División del Norte 2810',      'Coyoacán',    'Ciudad de México', '04000', 19.350000, -99.162000),
(31, 25, 'consultorio', 'Consultorio Ecatepec',          'Av. Insurgentes 88, local 3',      'Ecatepec',    'Ecatepec',         '55020', 19.600000, -99.050000)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), lat = VALUES(lat), lng = VALUES(lng);

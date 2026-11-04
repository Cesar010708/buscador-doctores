# Diseño del Buscador de Doctores

Detalle de cómo funciona por dentro. El resumen y la puesta en marcha están en el
[README](../README.md).

---

## La conversación del paciente

La página **es** el chat (`buscar.html` + `assets/js/conversacion.js`). El guion vive
en `assets/js/guion-paciente.js` como datos, y **cada cosa que va a pesar en el orden
tiene su propia pregunta**; nada queda implícito:

1. motivo → qué te pasa → *(repregunta si hay empate)* → **"¿Voy bien?"** con opción
   de contradecir → **servicio concreto** dentro de la especialidad (afina el eje
   "lo que necesitas")
2. para quién → dónde
3. cómo (consultorio / videollamada) → qué tan pronto
4. qué es lo que más importa (mueve los pesos)
5. al final y con otro encuadre: con quién te sientes más a gusto, presupuesto e
   idioma, cada uno con su "me da igual" y con la salida **"Buscar ya con lo que
   tengo"**
6. cierre: resumen completo de con qué se busca, con cada respuesta tocable.

Son más pasos, pero cada uno es un toque, y **lo que ya se sabe no se pregunta**: lo
que la persona dijo en su texto ("lo necesito esta semana", "prefiero videollamada") y
lo que trae su perfil cuando el buscador está embebido en un panel con sesión (para
quién, domicilio) se **prellenan** como burbujas con borde punteado y un "Cambiar".
Tocarlas vuelve a preguntar de verdad. Nunca se aplica algo en silencio.

Tres decisiones que hacen la diferencia:

1. **Se pregunta por el motivo, no por la especialidad**, y el motivo **cambia la
   siguiente pregunta**: "¿Qué sientes?", "¿Qué le pasa?", "¿A qué le das seguimiento?".
2. **Repregunta cuando de verdad no está claro.** `api/interpretar.php` no devuelve una
   especialidad sino CANDIDATOS con su confianza; si las dos primeras están parejas, el
   asistente pregunta *"¿esto es más de piel o de alergias?"* en vez de decidir a
   ciegas. Quien elige es la persona, nunca el modelo.
3. **Lo delicado va al final y con otro encuadre.** Género y presupuesto no se
   preguntan de frente: son ajustes opcionales al cierre, planteados como *comodidad*
   ("me sentiría más cómodo con una médica") y como *necesidad* ("necesito que sea
   accesible").

Cada respuesta dada queda **pulsable para corregirla**: al tocarla se rebobina el guion
a ese punto y se descarta lo posterior.

Del lado del médico, **la conversación cubre solo el alta de la cuenta**
(`assets/js/guion-doctor.js`): nombre, correo, contraseña y cédula. El perfil completo
(especialidad, servicios, dónde atiende, precios, bio) se llena en el formulario de
`mi-perfil.html`, que para muchos campos es más rápido que conversar. El cierre del alta
no promete de más: si falta la especialidad o la ubicación, dice claramente que
**todavía no aparece en las búsquedas** y por qué.

## Ubicación

En el paso de la zona hay un botón **"Usar mi ubicación"**. El permiso se pide solo al
tocarlo, nunca al abrir. Con las coordenadas, la proximidad se calcula por Haversine
directo (`zonaDesdeCoordenadas()` en `api/ranking.php`) y se le pone el nombre de la
zona más cercana del catálogo para poder decir *"te ubico por Del Valle"*. Sin
geocodificador externo. Si se niega el permiso o falla, se escribe la colonia y ya.

La geolocalización del navegador necesita contexto seguro: funciona en `localhost` y en
HTTPS, no en una IP de red local por http.

## La regla de oro: la IA no ordena

**El ranking es determinista y vive en PHP** (`api/ranking.php`). La IA solo hace dos
cosas acotadas (`api/ia.php`):

1. Traducir el texto libre del paciente a la taxonomía que ya existe en la base. Todo lo
   que devuelve se valida contra los catálogos; lo que no encaja se descarta.
2. Redactar el "por qué" de cada tarjeta con los datos reales y los sub-scores que el
   motor ya calculó, y una comparativa breve entre los primeros lugares.

Si OpenAI falla o se apaga (`BD_IA_ACTIVA=0`), el buscador sigue funcionando completo
con justificaciones de plantilla.

## Cómo se calcula el ranking

Cada doctor recibe un sub-score de 0 a 100 por eje, y el global es su promedio
ponderado. **Los pesos se reparten según lo que el paciente declaró**: sin zona no
pesa la cercanía; sin presupuesto, el precio pesa la mitad; en telemedicina la
distancia deja de contar.

| Eje | Peso base | De dónde sale |
|---|---|---|
| Lo que necesitas | 26 | Filtro duro por especialidad + qué tan exacto es el servicio |
| Cercanía | 20 | Haversine contra el catálogo de zonas; sin coordenadas, por CP/ciudad |
| Precio | 14 (18 con presupuesto declarado, 7 sin él) | Ajuste al tope de la banda |
| Reputación | 14 | Calificación con corrección bayesiana por número de opiniones |
| Experiencia | 12 | Años + formación + certificaciones |
| Tus preferencias | 8 | Género, modalidad, idioma, atiende niños |
| Perfil completo | 6 | Completitud del perfil del médico |
| Disponibilidad | 8 (solo si hay prisa) | Qué tan pronto puede atender |

Encima de esos pesos, **cada prioridad que declara el paciente multiplica su eje por
2.4** (máximo dos prioridades) y el conjunto se renormaliza. Los pesos que la interfaz
enseña en cada barra son los normalizados: el puntaje se puede recalcular a mano con
ellos y da el mismo número.

**Filtros duros** (quien no cumple, no aparece): especialidad, atiende niños o
adultos, y los requisitos que el paciente marque como indispensables (género,
modalidad, idioma).

Los resultados se presentan como **arquetipos**: "Mejor en general", "El más cercano",
"El más económico", "El de más experiencia" y "El mejor calificado", concordados con el
género del perfil.

### El incentivo de completitud

`completitud` pesa **6 de 100 a propósito**. La diferencia entre un perfil al 50 % y
uno al 100 % son unos 3 puntos: alcanza para desempatar y para mejorar la precisión
del match, pero **no para empujar a un médico peor por encima de una mejor opción**.
El paciente ve el desglose completo del puntaje, así que el criterio es auditable.

**Un eje solo se salta cuando no aplica a la búsqueda** (sin zona no pesa la cercanía).
Si aplica pero el perfil no trae el dato, puntúa bajo y sí cuenta: sin ubicación 8, sin
precio 30, sin trayectoria 20, y sin opiniones la media previa de 62.

Esto importa más de lo que parece. Cuando un eje sin dato se saltaba, su peso se
repartía entre los demás, así que **un perfil vacío quedaba juzgado solo donde no podía
perder**, y con una prioridad declarada llegaba a ganar la búsqueda: un perfil al 16 %
sin ubicación encabezaba una búsqueda ordenada *por cercanía*. No es un castigo: lo que
no se dice no se puede demostrar.

## Embebido en otra página

La búsqueda también puede vivir como pestaña de otro sitio (en producción se montó en el
panel del paciente de la plataforma). Se monta con una sola etiqueta, en **Shadow DOM**, así
que el CSS del anfitrión no entra y el de aquí no sale:

```html
<div id="bd-buscador"></div>
<script src="/buscador-doctores/assets/js/embed.js"
        data-destino="#bd-buscador" data-perfil="/ruta/al/perfil-de-sesion"></script>
```

Arranca solo cuando se abre la pestaña. Con sesión, lee el perfil (`window.datosUsuario`
o `data-perfil`) y **prellena** "para quién" y "dónde"; nada del perfil se guarda ni sale
del navegador. Sin sesión pregunta todo.

## Mapa de archivos

```
config.php               Configuración (lee .env, el entorno o config.local.php)
.env.example             Variables de entorno con valores de ejemplo
db/schema.sql            8 tablas con prefijo (idempotente)
db/seed.sql              25 perfiles ficticios, variados a propósito
db/cargar.php            Cargador por línea de comandos (solo CLI)

api/_lib.php             CORS, rate limit con flock, hash de IP, cliente HTTP
api/ranking.php          Motor determinista: sub-scores, arquetipos, contrastes
api/ia.php               Capa de OpenAI: interpretar el texto libre y redactar el porqué
api/perfil.php           Reglas de completitud y niveles (autoridad del servidor)
api/auth-doctor.php      Sesión del médico (cookie propia BDDOC)

api/buscar-doctores.php  POST · intake → ranking → arquetipos → JSON
api/catalogos.php        GET  · especialidades, servicios, zonas, motivos y prioridades
api/interpretar.php      POST · texto libre → candidatos de especialidad con confianza
api/zona-cercana.php     POST · coordenadas → nombre de la zona más cercana
api/registrar-eleccion.php POST · registra que el paciente eligió a un doctor
api/demanda.php          GET  · demanda agregada de la última semana
api/registro-doctor.php  POST · alta de cuenta
api/login-doctor.php     POST · acceso
api/logout-doctor.php    POST · cierre de sesión
api/mi-perfil.php        GET  · perfil, completitud, métricas y demanda
api/guardar-doctor.php   POST · guarda el perfil y recalcula completitud y nivel

buscar.html              Paciente: conversación y resultados
doctores.html            Landing del médico: propuesta de valor, alta y acceso
mi-perfil.html           Médico: onboarding, medidor y vista previa en vivo
assets/js/conversacion.js Motor de chat: pasos como datos, burbujas, rebobinado
assets/js/guion-paciente.js Guion de la búsqueda
assets/js/guion-doctor.js Guion del alta
assets/js/embed.js       Montaje embebido en Shadow DOM
assets/js/avatar.js      Avatares generados por perfil (nunca fotos de personas)
```

## Privacidad y seguridad

- Sentencias preparadas en todas las consultas. Como un nombre de tabla no puede ir
  como parámetro, el prefijo se valida contra `[a-z][a-z0-9_]*` en el único lugar por
  donde entra (`config.php`).
- Secretos solo en variables de entorno (`.env` o `config.local.php`), fuera de git y
  bloqueados por `.htaccess`.
- La IP del paciente se guarda **hasheada con sal** (HMAC-SHA256), nunca en claro.
- De las búsquedas **no se guarda lo que el paciente escribió con sus palabras**: solo
  los campos estructurados (especialidad, zona, presupuesto…).
- El freno por IP usa `REMOTE_ADDR`, nunca `X-Forwarded-For`: esa cabecera la pone
  quien llama.
- Rate limit por IP en los endpoints (archivo + `flock`, sin Redis).
- CORS con origen explícito; cookies de sesión `HttpOnly` y `SameSite=Lax`.
- La cédula se valida por **tipo MIME real** (no por extensión), con tope de tamaño y
  **nombre generado por el servidor**; la carpeta está cerrada por `.htaccess`.
- **No hay fotos de personas.** Los perfiles son ficticios: los avatares se generan del
  nombre y el id (`assets/js/avatar.js`).
- El sello que ve el paciente dice **"Cédula registrada"**, no "verificada": el
  prototipo solo comprueba el formato del número y que haya documento adjunto.

## Pendiente

- Geolocalización por `lat/lng` capturadas del médico, en vez del catálogo de zonas.
- Embeddings sobre `bio` y servicios para el match por texto libre.
- Conexión con un padrón real de médicos y login unificado.
- Cotejo de la cédula contra el registro público de profesiones.
- Portal del paciente: historial de búsquedas, favoritos y contacto.

## Identidad visual

Paleta: azul `#01587A` (primario), turquesa `#5CB3C1` (secundario), dorado
`#E7BA11` (llamadas a la acción), tinta `#1a2b35`, gris `#8a8a9a`, borde `#e7eaee`,
fondo `#f6f9fb`. Modo oscuro con valores propios, no una inversión automática. Poppins
auto-alojada e iconos SVG inline, sin CDNs.

/* ==========================================================================
   Buscador de Doctores — montaje embebido para el panel del paciente
   --------------------------------------------------------------------------
   Integración con una sola etiqueta, en la página anfitriona:

     <div id="bd-buscador"></div>
     <script src="https://ejemplo.mx/buscador-doctores/assets/js/embed.js"
             data-destino="#bd-buscador"
             data-perfil="/sistema/php/perfil.php"></script>

   AISLAMIENTO: el buscador vive dentro de un Shadow DOM, como el chatbot de
   la plataforma (chatbot/widget.js). El CSS del anfitrión (Bootstrap, `* { font-family
   … !important }`) no entra, y el del buscador (`*`, `body`, `h1`…) no sale.
   Tres consecuencias que este archivo resuelve:
     - Las fuentes NO cruzan el shadow al revés: el @font-face va al <head>.
     - `<use href="#i-…">` resuelve dentro del árbol: el sprite se mete al shadow.
     - Las rutas relativas del buscador se rompen desde /sistema/: la base se
       deriva de la URL de este mismo script.

   SESIÓN: si la página ya cargó el perfil (`window.datosUsuario`, lo deja
   perfil.js) se usa; si no, se pide a `data-perfil` con la cookie de sesión.
   Con eso el guion prellena "para quién" y "dónde". Nada del perfil sale del
   navegador ni se guarda: solo acorta la conversación. Sin perfil, se pregunta.

   ARRANQUE PEREZOSO: si el destino está en una pestaña de Bootstrap cerrada,
   no se pide nada hasta que se abre (`shown.bs.tab`). Quien no entra a la
   pestaña no gasta una petición, y el saludo se "escribe" al abrirla.

   data-attributes: data-destino (selector, por defecto #bd-buscador),
   data-perfil (URL del perfil de sesión), data-margen-scroll (px que tapa la
   barra fija del sitio al hacer scroll a la tarjeta; por defecto 80px).
   ========================================================================== */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var ds   = script.dataset;
  var BASE = script.src.replace(/assets\/js\/embed\.js(\?.*)?$/, '');
  var VER  = '20260912b';        // subir al cambiar cualquier css/js del buscador

  var destino = document.querySelector(ds.destino || '#bd-buscador');
  if (!destino || destino.shadowRoot) return;

  // ── Fuentes: en el documento, porque cruzan hacia el shadow; el CSS no ──
  if (!document.getElementById('bd-fuentes')) {
    var st = document.createElement('style');
    st.id = 'bd-fuentes';
    st.textContent = [400, 500, 600, 700].map(function (w) {
      return "@font-face{font-family:'BDPoppins';font-style:normal;font-weight:" + w +
        ";font-display:swap;src:url('" + BASE + 'assets/fonts/poppins-' + w + '.woff2?v=' + VER + "') format('woff2')}";
    }).join('');
    document.head.appendChild(st);
  }

  // ── Host + shadow ────────────────────────────────────────────────────
  destino.style.setProperty('all', 'initial', 'important');
  destino.style.setProperty('display', 'block', 'important');
  var SR = destino.attachShadow({ mode: 'open' });

  // Invisible hasta que llegue el CSS: sin esto se ve un instante sin estilos.
  var critico = document.createElement('style');
  critico.textContent = '.bd-raiz{visibility:hidden}';
  SR.appendChild(critico);

  var hojas = ['app', 'chat', 'buscar', 'embed'];
  var pendientes = hojas.length;
  var revelado = false;
  function revelar() { if (!revelado) { revelado = true; critico.remove(); } }
  function unaMenos() { if (--pendientes <= 0) revelar(); }

  hojas.forEach(function (h) {
    var href = BASE + 'assets/css/' + h + '.css?v=' + VER;
    try {
      var pre = document.createElement('link');
      pre.rel = 'preload'; pre.as = 'style'; pre.href = href;
      document.head.appendChild(pre);
    } catch (e) {}
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    link.addEventListener('load', unaMenos);
    link.addEventListener('error', unaMenos);   // si un css falla, no se deja oculto
    SR.appendChild(link);
  });
  setTimeout(revelar, 3000);                     // salvavidas si algún evento no dispara

  // ── Perfil de sesión → contexto del guion ────────────────────────────
  function primerNombre(completo) {
    var n = String(completo || '').trim().split(/\s+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
  }

  function edadDe(fecha) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
    if (!m) return null;
    var hoy = new Date(), nac = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(nac.getTime())) return null;
    var e = hoy.getFullYear() - nac.getFullYear();
    if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) e--;
    return e >= 0 && e < 130 ? e : null;
  }

  function contextoDe(u) {
    if (!u || typeof u !== 'object') return {};
    return {
      nombre:    primerNombre(u.nombre_completo),
      paraQuien: 'mi',
      domicilio: { colonia: u.domicilio_colonia || '', cp: u.domicilio_cp || '', municipio: u.domicilio_municipio || '' },
      edad:      edadDe(u.fecha_nacimiento)
    };
  }

  async function cargarContexto() {
    if (window.datosUsuario && typeof window.datosUsuario === 'object') return contextoDe(window.datosUsuario);
    var url = ds.perfil || '/sistema/php/perfil.php';
    try {
      var r = await fetch(url, { credentials: 'same-origin' });
      var d;
      try { d = await r.json(); } catch (e) { console.error('Buscador — perfil sin JSON:', e); return {}; }
      return (d && d.success && d.usuario) ? contextoDe(d.usuario) : {};
    } catch (e) {
      console.error('Buscador — no se pudo leer el perfil:', e);
      return {};
    }
  }
  var contextoPromesa = cargarContexto();

  // ── Módulos del buscador, en orden, sin bloquear al anfitrión ────────
  var modulos = ['iconos', 'avatar', 'conversacion', 'guion-paciente', 'buscar'];
  var listo = new Promise(function (resolver) {
    var faltan = modulos.length;
    modulos.forEach(function (m) {
      var s = document.createElement('script');
      s.src = BASE + 'assets/js/' + m + '.js?v=' + VER;
      s.async = false;                                   // respeta el orden
      if (m === 'iconos') s.setAttribute('data-insertar', 'no');   // el sprite va al shadow, no al documento
      s.addEventListener('load',  function () { if (--faltan === 0) resolver(true); });
      s.addEventListener('error', function () { console.error('Buscador — no cargó ' + m + '.js'); if (--faltan === 0) resolver(false); });
      document.head.appendChild(s);
    });
  });

  // ── Marcado, dentro del shadow: los mismos ids que buscar.html ───────
  function icono(id) { return '<svg><use href="#' + id + '"/></svg>'; }

  function pintarMarcado() {
    var raiz = document.createElement('div');
    raiz.className = 'bd-raiz';
    raiz.innerHTML =
      (window.BDIconos || '') +
      '<div class="bd-cabecera">' +
        '<span class="etiqueta-prueba">' + icono('i-alerta') + ' Perfiles de prueba · 25 médicos ficticios</span>' +
      '</div>' +
      '<section id="vista-chat" class="chat-marco">' +
        '<div id="chat"></div>' +
        '<datalist id="lista-zonas"></datalist>' +
      '</section>' +
      '<section id="vista-resultados" class="resultados oculto" aria-live="polite">' +
        '<div class="cargando oculto" id="cargando">' +
          '<svg class="girando"><use href="#i-cargando"/></svg>' +
          '<span>Buscando y comparando perfiles…</span>' +
        '</div>' +
        '<div id="contenido-resultados"></div>' +
      '</section>';
    SR.appendChild(raiz);
  }

  var arrancado = false;
  async function arrancar() {
    if (arrancado) return;
    arrancado = true;

    var ok = await listo;
    var contexto = await contextoPromesa;
    pintarMarcado();

    if (!ok || !window.BDBuscar) {
      SR.getElementById('chat').innerHTML =
        '<div class="aviso aviso-fuerte">' + icono('i-alerta') +
        '<span>No pudimos cargar el buscador. Recarga la página en un momento.</span></div>';
      return;
    }

    var ancla = destino.closest('.card') || destino;
    ancla.style.scrollMarginTop = ds.margenScroll || '80px';

    window.BDBuscar.montar({
      raiz:     SR,
      api:      BASE + 'api/',
      img:      BASE + 'assets/img/',
      contexto: contexto,
      enPanel:  true,
      ancla:    ancla
    });
  }

  // ── Arranque: ya, o cuando se abra la pestaña que contiene al destino ─
  var pane = destino.closest('.tab-pane');
  if (!pane || pane.classList.contains('active')) {
    arrancar();
  } else {
    document.addEventListener('shown.bs.tab', function (ev) {
      var objetivo = ev.target && ev.target.getAttribute('data-bs-target');
      if (objetivo === '#' + pane.id) arrancar();
    });
  }
})();

/* ==========================================================================
   Landing del médico: propuesta de valor, prueba social real, alta conversando
   y acceso para quien ya tiene cuenta.

   El alta es una conversación (guion-doctor.js). Entrar es un formulario: para
   escribir dos campos que ya te sabes, conversar estorba.
   ========================================================================== */
(function () {
  'use strict';

  var API = 'api/';

  var vistaLanding = document.getElementById('vista-landing');
  var vistaChat    = document.getElementById('vista-chat');
  var vistaCierre  = document.getElementById('vista-cierre');
  var vistaLogin   = document.getElementById('vista-login');
  var avisoEtica   = document.getElementById('aviso-etica');

  function esc(s) { return window.BDChat.esc(s); }
  function icono(id, clase) { return '<svg class="' + (clase || '') + '"><use href="#' + id + '"/></svg>'; }

  async function pedirJson(url, opciones) {
    try {
      var r = await fetch(url, opciones);
      var d;
      try { d = await r.json(); }
      catch (e) { console.error('Buscador — respuesta sin JSON:', e); return { ok: false, error: 'No pudimos leer la respuesta.' }; }
      d.estado = r.status;
      if (!r.ok && !d.error) d.error = 'El servidor respondió con un error.';
      return d;
    } catch (e) {
      console.error('Buscador — fallo de red:', e);
      return { ok: false, error: 'No pudimos conectar. Revisa tu conexión.' };
    }
  }

  function mostrar(cual) {
    vistaLanding.classList.toggle('oculto', cual !== 'landing');
    vistaChat.classList.toggle('oculto',    cual !== 'chat');
    vistaCierre.classList.toggle('oculto',  cual !== 'cierre');
    vistaLogin.classList.toggle('oculto',   cual !== 'login');
    avisoEtica.classList.toggle('oculto',   cual === 'chat');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Prueba social: si no hay demanda real, no se enseña nada ─────────
  async function cargarDemanda() {
    var d = await pedirJson(API + 'demanda.php');
    if (!d || !d.ok || !d.total) return;
    var esp = d.por_especialidad || [];
    if (!esp.length) return;

    document.getElementById('demanda-especialidades').innerHTML = esp.map(function (e) {
      return '<span class="demanda-dato"><b>' + e.total + '</b> ' + esc(e.nombre) + '</span>';
    }).join('');
    document.getElementById('demanda-zonas').innerHTML = (d.por_zona || []).map(function (z) {
      return '<span class="demanda-dato"><b>' + z.total + '</b> en ' + esc(z.nombre) + '</span>';
    }).join('');
    document.getElementById('demanda').classList.remove('oculto');
  }

  // ── Alta conversando ─────────────────────────────────────────────────
  function empezar() {
    // El alta no necesita catálogos: son cuatro datos y la cédula.
    mostrar('chat');
    window.BDChat.iniciar({
      contenedor: document.getElementById('chat'),
      guion: window.BDGuionDoctor.construir(),
      alTerminar: cerrar
    });
  }

  /**
   * Cierre del alta. Dice la verdad: la cuenta ya existe, pero un perfil sin
   * especialidad ni ubicación NO aparece en ninguna búsqueda todavía. Prometer
   * lo contrario sería justo el tipo de humo que este proyecto evita.
   */
  async function cerrar(datos) {
    var perfil = await pedirJson(API + 'mi-perfil.php', { credentials: 'same-origin' });
    if (!perfil || !perfil.ok) { window.location.href = 'mi-perfil.html'; return; }

    var p = perfil.perfil;
    var faltan = (perfil.reglas || []).filter(function (r) { return !r.cumplido; });

    // Lo que de verdad hace falta para aparecer, no una lista de todo lo vacío.
    var imprescindibles = faltan.filter(function (r) {
      return ['especialidad', 'ubicacion', 'servicios'].indexOf(r.clave) !== -1;
    });

    vistaCierre.innerHTML =
      '<div class="cierre">' +
        '<div class="cierre-cabeza">' +
          '<span class="cierre-marca">' + icono('i-check-circulo') + '</span>' +
          '<div>' +
            '<h2>Tu cuenta está lista, ' + esc(primerNombre(p.nombre)) + '</h2>' +
            '<p>' + (p.cedula
              ? 'Guardamos tu cédula' + (p.cedula_verificada ? ' y su documento: ya tienes el sello de <strong>cédula registrada</strong>.' : '. Cuando subas el documento se activa el sello de <strong>cédula registrada</strong>.')
              : 'Puedes agregar tu cédula cuando quieras desde tu perfil.') + '</p>' +
          '</div>' +
        '</div>' +

        (imprescindibles.length
          ? '<div class="aviso aviso-fuerte">' + icono('i-alerta') +
            '<span><strong>Todavía no apareces en las búsquedas.</strong> Para eso falta ' +
            esc(imprescindibles.map(function (r) { return r.etiqueta.toLowerCase(); }).join(', ')) +
            '. Son unos minutos en el formulario.</span></div>'
          : '<div class="aviso">' + icono('i-check-circulo') +
            '<span>Tu perfil ya tiene lo necesario para aparecer en las búsquedas.</span></div>') +

        '<div class="cierre-columnas">' +
          '<section class="tarjeta panel">' +
            '<div class="panel-titulo">' + icono('i-ojo') + ' Así te ven los pacientes</div>' +
            '<div class="previa-tarjeta">' +
              '<div style="display:flex;gap:11px;align-items:center">' +
                (window.BDAvatar ? window.BDAvatar.svg(p.nombre, p.id, 44) : '') +
                '<div>' +
                  '<div class="previa-nombre">' + esc(p.nombre) + '</div>' +
                  '<div class="previa-esp">' + esc(p.especialidad || 'Falta tu especialidad') + '</div>' +
                '</div>' +
              '</div>' +
              (p.cedula_verificada
                ? '<div class="chips"><span class="chip chip-ok">' + icono('i-check-circulo') + 'Cédula registrada</span></div>'
                : '') +
              '<p class="previa-vacio">Se irá llenando conforme completes tu perfil.</p>' +
            '</div>' +
          '</section>' +

          '<section class="tarjeta panel">' +
            '<div class="panel-titulo">Tu perfil</div>' +
            '<div class="medidor">' +
              '<div style="display:flex;align-items:baseline;gap:10px">' +
                '<span class="medidor-cifra">' + p.completitud + '%</span>' +
                '<span class="nivel-sello" data-nivel="' + esc(p.nivel) + '">' + icono('i-escudo') +
                  ' ' + esc(NIVEL[p.nivel] || p.nivel) + '</span>' +
              '</div>' +
              '<div class="medidor-pista"><div class="medidor-barra" data-nivel="' + esc(p.nivel) + '" ' +
                'style="width:' + p.completitud + '%" role="progressbar" aria-valuemin="0" aria-valuemax="100" ' +
                'aria-valuenow="' + p.completitud + '" aria-label="Completitud de tu perfil"></div></div>' +
            '</div>' +
            (faltan.length
              ? '<p class="campo-ayuda" style="margin-top:12px">El dato que más suma ahora: ' +
                '<strong>' + esc(faltan[0].etiqueta.toLowerCase()) + '</strong> — ' + esc(faltan[0].beneficio) + '</p>'
              : '<p class="campo-ayuda" style="margin-top:12px">Tu perfil está completo.</p>') +
          '</section>' +
        '</div>' +

        '<div class="cierre-acciones">' +
          '<a class="btn btn-acento btn-grande" href="mi-perfil.html">' + icono('i-persona') + ' Completar mi perfil</a>' +
          '<a class="btn btn-linea" href="buscar.html">Ver cómo busca un paciente</a>' +
        '</div>' +
      '</div>';

    mostrar('cierre');
  }

  var NIVEL = { basico: 'básico', destacado: 'destacado', top: 'top' };

  function primerNombre(nombre) {
    var partes = String(nombre || '').trim().split(/\s+/)
      .filter(function (x) { return ['dr', 'dra', 'dr.', 'dra.', 'lic', 'lic.'].indexOf(x.toLowerCase()) === -1; });
    return partes[0] || '';
  }

  // ── Acceso ───────────────────────────────────────────────────────────
  document.getElementById('form-login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var err = document.getElementById('error-login');
    err.classList.add('oculto');

    var boton = document.getElementById('btn-login');
    boton.disabled = true;

    var d = await pedirJson(API + 'login-doctor.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        email: document.getElementById('log-email').value.trim(),
        password: document.getElementById('log-password').value
      })
    });

    boton.disabled = false;
    if (!d.ok) {
      err.textContent = d.error || 'No pudimos iniciar tu sesión.';
      err.classList.remove('oculto');
      return;
    }
    window.location.href = 'mi-perfil.html';
  });

  document.getElementById('btn-empezar').addEventListener('click', empezar);
  document.getElementById('btn-entrar').addEventListener('click', function () { mostrar('login'); });
  document.getElementById('btn-volver-landing').addEventListener('click', function () { mostrar('landing'); });

  if (window.location.hash === '#entrar') mostrar('login');
  cargarDemanda();
})();

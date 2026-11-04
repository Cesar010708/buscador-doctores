/* ==========================================================================
   Motor conversacional — Buscador de Doctores
   --------------------------------------------------------------------------
   Sirve a las dos pantallas (paciente y médico) con guiones distintos. El guion
   es DATOS: una lista de pasos con su tipo, su validación y a dónde va después.
   No hay banderas sueltas ni un `if` por paso; así reordenar el guion o meter
   una pregunta nueva no obliga a tocar el motor.

   La regla de oro del proyecto también manda aquí: **el guion es determinista**.
   La IA interpreta lo que la persona escribe, pero nunca decide cuál es la
   siguiente pregunta.

   Uso:
     BDChat.iniciar({ contenedor, guion, alTerminar, contexto, avatarUrl });

   Un paso:
     {
       id: 'motivo',
       mensaje: 'texto' | function(datos),      // lo que dice el asistente
       nota: 'texto de apoyo bajo el mensaje',
       tipo: 'opciones'|'multi'|'texto'|'ubicacion'|'numero'|'rango'|'clave'|'archivo'|'aviso',
       opciones: [{ valor, etiqueta, apoyo, icono }],
       maximo: 2,                               // 'multi'
       opcional: true,                          // pinta "Omitir esta"
       atajo: true,                             // pinta solo la salida total (omitirTodo)
       etiquetaOmitir: 'Prefiero no decirlo',
       validar: function(v) { return true | 'qué está mal'; },
       alResponder: async function(v, datos, api) {},   // efectos (guardar, interpretar)
       siguiente: function(v, datos) { return 'idDePaso' | null; },  // null = terminar

       // Respuesta que ya se sabe (viene del contexto: el perfil del paciente en
       // el panel). Devuelve { valor, texto } o null. Si hay valor, el asistente
       // dice `mensajePrefijado` (o `mensaje`) y la respuesta se pinta como una
       // burbuja normal, pulsable: tocarla la vuelve a preguntar de verdad. Así el
       // intake se acorta sin esconder nada ni quitarle a la persona el control.
       prefijado: function(datos, contexto) { return { valor, texto } | null; },
       mensajePrefijado: 'texto' | function(datos)
     }
   ========================================================================== */
(function (global) {
  'use strict';

  // ── Utilidades ─────────────────────────────────────────────────────────
  /* Escapa TAMBIÉN la comilla simple: así el mismo escapador sirve para texto y
     para atributos, y no hay dos funciones entre las que equivocarse. */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Mini-markdown: negritas y saltos, nada más. Se aplica DESPUÉS de escapar,
     para no abrir un hueco de inyección. */
  function formato(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function icono(id, clase) {
    return id ? '<svg class="' + (clase || '') + '"><use href="#' + id + '"/></svg>' : '';
  }

  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── Instancia ──────────────────────────────────────────────────────────
  function Chat(config) {
    this.cont      = config.contenedor;
    this.guion     = config.guion;
    this.alTerminar= config.alTerminar || function () {};
    this.contexto  = config.contexto || {};
    // La ruta relativa vale para buscar.html; el widget del panel pasa la absoluta.
    this.avatarUrl = config.avatarUrl || 'assets/img/isotipo.png';
    // Salida rápida de todo lo que queda. Se pinta junto al "omitir" de cada paso
    // opcional: omitir UNA pregunta y terminar el cuestionario son cosas distintas,
    // y encadenar cinco "omitir" seguidos es un peaje que nadie quiere pagar.
    this.omitirTodo = config.omitirTodo || null;
    this.datos     = {};
    this.recorrido = [];        // [{pasoId, valor}] en orden, para poder rebobinar
    this.pasoActual= null;
    this.bloqueado = false;

    this.cont.innerHTML =
      '<div class="chat-hilo" id="chat-hilo" role="log" aria-live="polite"></div>' +
      '<div class="chat-respuesta" id="chat-respuesta"></div>';
    this.hilo    = this.cont.querySelector('#chat-hilo');
    this.zonaRes = this.cont.querySelector('#chat-respuesta');
  }

  Chat.prototype.paso = function (id) {
    for (var i = 0; i < this.guion.length; i++) {
      if (this.guion[i].id === id) return this.guion[i];
    }
    return null;
  };

  // ── Mensajes ───────────────────────────────────────────────────────────
  Chat.prototype.mensajeBot = function (texto, nota) {
    var div = document.createElement('div');
    div.className = 'chat-msg chat-msg-bot';
    div.innerHTML =
      '<span class="chat-avatar"><img src="' + esc(this.avatarUrl) + '" alt="" width="22" height="27"></span>' +
      '<span class="chat-burbuja chat-burbuja-bot">' + formato(texto) +
        (nota ? '<span class="chat-nota">' + formato(nota) + '</span>' : '') +
      '</span>';
    this.hilo.appendChild(div);
    this.alInicioDe(div);
    return div;
  };

  /* Las respuestas dadas por botón o por campo también se pintan como si la
     persona las hubiera escrito: es lo que hace que un formulario se sienta
     conversación. Y quedan pulsables para volver atrás y corregir. */
  /* Una respuesta prellenada (tomada del perfil) se distingue con borde punteado y
     un "Cambiar" visible: la persona debe notar que no la dio ella. */
  Chat.prototype.mensajeUsuario = function (texto, pasoId, prefijado) {
    var div = document.createElement('div');
    div.className = 'chat-msg chat-msg-yo';
    div.innerHTML =
      '<button type="button" class="chat-burbuja chat-burbuja-yo' + (prefijado ? ' chat-burbuja-prefijada' : '') + '" ' +
        (pasoId
          ? 'data-rebobinar="' + esc(pasoId) + '" title="' +
            (prefijado ? 'Respuesta que ya se sabía. Tocar para cambiarla' : 'Tocar para cambiar esta respuesta') + '"'
          : 'disabled') +
        '>' + esc(texto) +
        (prefijado ? ' <span class="chat-cambiar">Cambiar</span>' : '') +
        icono('i-lapiz', 'chat-editar') + '</button>';
    this.hilo.appendChild(div);
    this.alFondo();
    return div;
  };

  Chat.prototype.escribiendo = function () {
    var div = document.createElement('div');
    div.id = 'chat-escribiendo';
    div.className = 'chat-msg chat-msg-bot';
    div.innerHTML =
      '<span class="chat-avatar"><img src="' + esc(this.avatarUrl) + '" alt="" width="22" height="27"></span>' +
      '<span class="chat-burbuja chat-burbuja-bot chat-puntos"><span></span><span></span><span></span></span>';
    this.hilo.appendChild(div);
    this.alFondo();
  };

  Chat.prototype.dejarDeEscribir = function () {
    var t = this.hilo.querySelector('#chat-escribiendo');
    if (t) t.remove();
  };

  // ── Desplazamiento ─────────────────────────────────────────────────────
  // Lo que dice la persona va al fondo; lo que dice el asistente ancla su
  // INICIO, porque los mensajes largos se leen desde arriba.
  Chat.prototype.alFondo = function () {
    this.hilo.scrollTop = this.hilo.scrollHeight;
  };

  Chat.prototype.alInicioDe = function (el) {
    var h = this.hilo;
    try {
      h.scrollTop += el.getBoundingClientRect().top - h.getBoundingClientRect().top - 12;
    } catch (e) { this.alFondo(); }
  };

  // ── Errores: sacudida + aviso para lectores de pantalla ────────────────
  Chat.prototype.error = function (mensaje) {
    var caja = this.zonaRes.querySelector('.chat-control');
    if (caja) {
      caja.classList.add('chat-sacudir');
      setTimeout(function () { caja.classList.remove('chat-sacudir'); }, 450);
    }
    var campo = this.zonaRes.querySelector('input, textarea');
    if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }

    var previo = this.zonaRes.querySelector('.chat-error');
    if (previo) previo.remove();
    var p = document.createElement('p');
    p.className = 'chat-error';
    p.setAttribute('role', 'alert');
    p.textContent = mensaje;
    this.zonaRes.appendChild(p);
  };

  // ── Motor ──────────────────────────────────────────────────────────────
  Chat.prototype.arrancar = async function () {
    await this.ir(this.guion[0].id);
  };

  /* opts.sinPrefijar: al rebobinar hasta un paso prellenado se pregunta de verdad.
     Sin eso, tocar la burbuja volvería a rellenarla y nunca se podría cambiar. */
  Chat.prototype.ir = async function (id, opts) {
    var paso = this.paso(id);
    if (!paso) { this.terminar(); return; }
    this.pasoActual = paso;

    var pre = (!opts || !opts.sinPrefijar) && paso.prefijado
      ? paso.prefijado(this.datos, this.contexto)
      : null;

    this.zonaRes.innerHTML = '';
    this.escribiendo();
    // Lo que ya se sabe se dice rápido: la pausa larga es para lo que se pregunta.
    await espera(pre ? 200 : (paso.pausa === undefined ? 420 : paso.pausa));
    this.dejarDeEscribir();

    // `mensajePrefijado: ''` es válido y significa "no digas nada": un paso que se
    // resuelve solo (sin opciones que ofrecer) no tiene por qué dejar rastro.
    var fuente = pre && paso.mensajePrefijado !== undefined ? paso.mensajePrefijado : paso.mensaje;
    var texto = typeof fuente === 'function' ? fuente(this.datos) : fuente;
    // La nota explica cómo contestar; si no se va a contestar, sobra.
    var nota  = pre ? null : (typeof paso.nota === 'function' ? paso.nota(this.datos) : paso.nota);
    if (paso.antesDePintar) paso.antesDePintar(this.datos, paso);

    if (texto) this.mensajeBot(texto, nota);

    if (paso.tipo === 'aviso') {
      var sig = paso.siguiente ? paso.siguiente(null, this.datos) : null;
      if (sig) { await this.ir(sig); } else { this.terminar(); }
      return;
    }
    if (pre) { await this.responder(pre.valor, pre.texto, true); return; }
    this.pintarControl(paso);
  };

  /* Un solo lugar donde se decide qué control se pinta. Meter un tipo nuevo es
     añadir un caso aquí, no tocar cinco funciones. */
  Chat.prototype.pintarControl = function (paso) {
    var self = this;
    var caja = document.createElement('div');
    caja.className = 'chat-control chat-control-' + paso.tipo;

    var constructores = {
      opciones:  this.ctrlOpciones,
      multi:     this.ctrlMulti,
      texto:     this.ctrlTexto,
      clave:     this.ctrlTexto,
      numero:    this.ctrlTexto,
      ubicacion: this.ctrlUbicacion,
      rango:     this.ctrlRango,
      archivo:   this.ctrlArchivo
    };
    (constructores[paso.tipo] || this.ctrlTexto).call(this, caja, paso);

    /* Dos salidas distintas, cada una con su bandera en el paso:
       `opcional` pinta "Omitir esta" (saltar SOLO esta pregunta);
       `atajo` pinta la salida total ("Buscar ya con lo que tengo"), y solo donde
       el guion la pide: saltar al cierre sin especialidad sería una búsqueda vacía. */
    if (paso.opcional || (paso.atajo && this.omitirTodo)) {
      var salidas = document.createElement('div');
      salidas.className = 'chat-salidas';

      if (paso.opcional) {
        var omitir = document.createElement('button');
        omitir.type = 'button';
        omitir.className = 'btn btn-texto btn-chico chat-omitir';
        omitir.textContent = paso.etiquetaOmitir || 'Omitir esta';
        omitir.addEventListener('click', function () { self.responder(null, paso.textoOmitir || 'Prefiero omitirlo'); });
        salidas.appendChild(omitir);
      }

      if (paso.atajo && this.omitirTodo) {
        var todo = document.createElement('button');
        todo.type = 'button';
        todo.className = 'btn btn-linea btn-chico chat-omitir-todo';
        todo.innerHTML = icono('i-flecha-der') + (this.omitirTodo.etiqueta || 'Omitir todo lo demás');
        todo.addEventListener('click', function () { self.omitirResto(); });
        salidas.appendChild(todo);
      }

      caja.appendChild(salidas);
    }

    this.zonaRes.appendChild(caja);
    this.alFondo();
    var primero = caja.querySelector('input, textarea');
    if (primero) setTimeout(function () { primero.focus(); }, 60);
  };

  // ── Controles ──────────────────────────────────────────────────────────
  Chat.prototype.ctrlOpciones = function (caja, paso) {
    var self = this;
    var grid = document.createElement('div');
    grid.className = 'chat-opciones';
    paso.opciones.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-opcion' + (o.apoyo ? ' chat-opcion-amplia' : '');
      b.innerHTML =
        (o.icono ? '<span class="chat-opcion-icono">' + icono(o.icono) + '</span>' : '') +
        '<span class="chat-opcion-texto"><b>' + esc(o.etiqueta) + '</b>' +
          (o.apoyo ? '<small>' + esc(o.apoyo) + '</small>' : '') + '</span>';
      b.addEventListener('click', function () { self.responder(o.valor, o.etiqueta); });
      grid.appendChild(b);
    });
    caja.appendChild(grid);
  };

  Chat.prototype.ctrlMulti = function (caja, paso) {
    var self = this, elegidos = [];
    var grid = document.createElement('div');
    grid.className = 'chat-opciones chat-opciones-multi';

    paso.opciones.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-opcion chat-opcion-chip';
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = (o.icono ? icono(o.icono) : '') + '<span>' + esc(o.etiqueta) + '</span>';
      b.addEventListener('click', function () {
        var i = elegidos.indexOf(o.valor);
        if (i !== -1) { elegidos.splice(i, 1); }
        else {
          // Al llegar al tope se suelta la más antigua, en vez de bloquear con
          // un "ya elegiste dos" que nadie sabe cómo deshacer.
          if (paso.maximo && elegidos.length >= paso.maximo) {
            var fuera = elegidos.shift();
            var otro = grid.querySelector('[data-v="' + fuera + '"]');
            if (otro) { otro.classList.remove('activa'); otro.setAttribute('aria-pressed', 'false'); }
          }
          elegidos.push(o.valor);
        }
        b.classList.toggle('activa', elegidos.indexOf(o.valor) !== -1);
        b.setAttribute('aria-pressed', String(elegidos.indexOf(o.valor) !== -1));
      });
      b.setAttribute('data-v', o.valor);
      grid.appendChild(b);
    });

    var seguir = document.createElement('button');
    seguir.type = 'button';
    seguir.className = 'btn btn-primario chat-seguir';
    seguir.innerHTML = 'Continuar ' + icono('i-flecha-der');
    seguir.addEventListener('click', function () {
      var etiquetas = elegidos.map(function (v) {
        var e = v;
        paso.opciones.forEach(function (o) { if (o.valor === v) e = o.etiqueta; });
        return e;
      });
      self.responder(elegidos, etiquetas.length ? etiquetas.join(' y ') : (paso.textoVacio || 'Nada en especial'));
    });

    caja.appendChild(grid);
    caja.appendChild(seguir);
  };

  Chat.prototype.ctrlTexto = function (caja, paso) {
    var self = this;
    var fila = document.createElement('div');
    fila.className = 'chat-fila';

    var campo;
    if (paso.multilinea) {
      campo = document.createElement('textarea');
      campo.rows = 2;
    } else {
      campo = document.createElement('input');
      campo.type = paso.tipo === 'clave' ? 'password' : (paso.tipo === 'numero' ? 'number' : 'text');
      if (paso.tipo === 'numero') { campo.inputMode = 'numeric'; }
      if (paso.autocompletar) campo.autocomplete = paso.autocompletar;
    }
    campo.className = 'chat-campo';
    campo.maxLength = paso.max || 500;
    campo.placeholder = (typeof paso.ejemplo === 'function' ? paso.ejemplo(this.datos) : paso.ejemplo)
      || 'Escribe tu respuesta…';
    campo.setAttribute('aria-label', typeof paso.mensaje === 'string' ? paso.mensaje : 'Tu respuesta');
    if (paso.listaZonas) campo.setAttribute('list', 'lista-zonas');

    var enviar = document.createElement('button');
    enviar.type = 'button';
    enviar.className = 'chat-enviar';
    enviar.setAttribute('aria-label', 'Enviar');
    enviar.innerHTML = icono('i-flecha-der');

    var mandar = function () { self.responder(campo.value.trim(), campo.value.trim()); };
    enviar.addEventListener('click', mandar);
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); }
    });
    campo.addEventListener('input', function () { campo.removeAttribute('aria-invalid'); });

    fila.appendChild(campo);
    fila.appendChild(enviar);
    caja.appendChild(fila);

    if (paso.sugerencias && paso.sugerencias.length) {
      var sug = document.createElement('div');
      sug.className = 'chat-sugerencias';
      paso.sugerencias.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-sugerencia';
        b.textContent = t;
        b.addEventListener('click', function () { campo.value = t; campo.focus(); });
        sug.appendChild(b);
      });
      caja.appendChild(sug);
    }
  };

  /* Ubicación: campo de texto y botón para usar la real del dispositivo. El
     permiso se pide SOLO al tocar el botón, nunca al abrir la página. */
  Chat.prototype.ctrlUbicacion = function (caja, paso) {
    var self = this;
    this.ctrlTexto(caja, paso);

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-linea chat-geo';
    boton.innerHTML = icono('i-mira') + ' Usar mi ubicación';

    boton.addEventListener('click', function () {
      if (!navigator.geolocation) {
        self.mensajeBot('Tu navegador no me deja ver la ubicación. Escríbeme tu colonia o código postal y seguimos.');
        return;
      }
      boton.disabled = true;
      boton.innerHTML = icono('i-cargando', 'girando') + ' Buscando…';

      var alFallar = function () {
        boton.disabled = false;
        boton.innerHTML = icono('i-mira') + ' Usar mi ubicación';
        self.mensajeBot('Sin problema, no pude tomar tu ubicación. Escríbeme tu colonia o tu código postal.');
      };

      navigator.geolocation.getCurrentPosition(function (pos) {
        self.responder(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          'Mi ubicación actual'
        );
      }, alFallar, { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 });
    });

    caja.appendChild(boton);
  };

  Chat.prototype.ctrlRango = function (caja, paso) {
    var self = this;
    var fila = document.createElement('div');
    fila.className = 'chat-fila chat-fila-rango';

    var de = document.createElement('input');
    de.type = 'number'; de.className = 'chat-campo'; de.placeholder = paso.etiquetaDe || 'Desde';
    de.min = 0; de.step = 50; de.setAttribute('aria-label', paso.etiquetaDe || 'Desde');

    var a = document.createElement('input');
    a.type = 'number'; a.className = 'chat-campo'; a.placeholder = paso.etiquetaA || 'Hasta';
    a.min = 0; a.step = 50; a.setAttribute('aria-label', paso.etiquetaA || 'Hasta');

    var enviar = document.createElement('button');
    enviar.type = 'button'; enviar.className = 'chat-enviar';
    enviar.setAttribute('aria-label', 'Enviar');
    enviar.innerHTML = icono('i-flecha-der');
    enviar.addEventListener('click', function () {
      var v = { de: de.value.trim(), a: a.value.trim() };
      self.responder(v, (v.de && v.a) ? ('De $' + v.de + ' a $' + v.a) : 'Prefiero no decirlo');
    });

    fila.appendChild(de); fila.appendChild(a); fila.appendChild(enviar);
    caja.appendChild(fila);
  };

  Chat.prototype.ctrlArchivo = function (caja, paso) {
    var self = this;
    var etiqueta = document.createElement('label');
    etiqueta.className = 'btn btn-linea chat-archivo';
    etiqueta.innerHTML = icono('i-subir') + ' Elegir archivo';

    var campo = document.createElement('input');
    campo.type = 'file';
    campo.className = 'solo-lectores';
    campo.accept = paso.acepta || 'application/pdf,image/jpeg,image/png';
    campo.addEventListener('change', function () {
      var f = campo.files[0];
      if (f) self.responder(f, f.name);
    });

    etiqueta.appendChild(campo);
    caja.appendChild(etiqueta);
  };

  // ── Responder ──────────────────────────────────────────────────────────
  Chat.prototype.responder = async function (valor, textoVisible, prefijado) {
    if (this.bloqueado) return;
    var paso = this.pasoActual;

    // Un valor prellenado no pasa por `validar`: no hay control en pantalla donde
    // mostrar el error, y el dato viene del perfil, no de un campo a medio llenar.
    if (paso.validar && !prefijado) {
      var v = paso.validar(valor, this.datos);
      if (v !== true) { this.error(typeof v === 'string' ? v : 'Eso no me sirve, inténtalo de otra forma.'); return; }
    }

    this.bloqueado = true;
    var previo = this.zonaRes.querySelector('.chat-error');
    if (previo) previo.remove();
    this.zonaRes.innerHTML = '';

    if (textoVisible) this.mensajeUsuario(textoVisible, paso.id, prefijado);

    this.datos[paso.id] = valor;
    this.recorrido.push({ pasoId: paso.id, valor: valor, texto: textoVisible });

    if (paso.alResponder) {
      this.escribiendo();
      try {
        await paso.alResponder(valor, this.datos, this);
      } catch (e) {
        console.error('Buscador — fallo en el paso ' + paso.id + ':', e);
      }
      this.dejarDeEscribir();
    }

    this.bloqueado = false;
    var sig = paso.siguiente ? paso.siguiente(valor, this.datos) : siguientePorOrden(this.guion, paso.id);
    if (sig) { await this.ir(sig); } else { this.terminar(); }
  };

  function siguientePorOrden(guion, id) {
    for (var i = 0; i < guion.length - 1; i++) {
      if (guion[i].id === id) return guion[i + 1].id;
    }
    return null;
  }

  // ── Rebobinar: tocar una respuesta anterior para cambiarla ─────────────
  Chat.prototype.rebobinar = async function (pasoId) {
    if (this.bloqueado) return;
    var corte = -1;
    for (var i = 0; i < this.recorrido.length; i++) {
      if (this.recorrido[i].pasoId === pasoId) { corte = i; break; }
    }
    if (corte === -1) return;

    // Se descartan las respuestas posteriores: cambiar una decisión temprana
    // puede invalidar todo lo que vino después.
    this.recorrido.slice(corte).forEach(function (r) { delete this.datos[r.pasoId]; }, this);
    this.recorrido = this.recorrido.slice(0, corte);

    var burbujas = this.hilo.querySelectorAll('.chat-msg');
    var desde = null;
    for (var j = 0; j < burbujas.length; j++) {
      var b = burbujas[j].querySelector('[data-rebobinar="' + pasoId + '"]');
      if (b) { desde = j; break; }
    }
    if (desde !== null) {
      // Se borra desde el mensaje del asistente que hizo esa pregunta.
      var inicio = Math.max(0, desde - 1);
      for (var k = burbujas.length - 1; k >= inicio; k--) burbujas[k].remove();
    }
    await this.ir(pasoId, { sinPrefijar: true });
  };

  /** Salta todo lo que queda del guion y va directo al cierre. */
  Chat.prototype.omitirResto = async function () {
    if (this.bloqueado || !this.omitirTodo) return;
    this.bloqueado = true;
    this.zonaRes.innerHTML = '';
    this.mensajeUsuario(this.omitirTodo.texto || 'Lo completo después');
    this.bloqueado = false;
    await this.ir(this.omitirTodo.hasta);
  };

  Chat.prototype.terminar = function () {
    this.zonaRes.innerHTML = '';
    this.alTerminar(this.datos, this);
  };

  /** Mensaje suelto del asistente, para lo que pase fuera del guion. */
  Chat.prototype.decir = function (texto, nota) { return this.mensajeBot(texto, nota); };

  // ── Arranque ───────────────────────────────────────────────────────────
  function iniciar(config) {
    var chat = new Chat(config);
    chat.cont.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-rebobinar]');
      if (b) chat.rebobinar(b.getAttribute('data-rebobinar'));
    });
    chat.arrancar();
    return chat;
  }

  global.BDChat = { iniciar: iniciar, esc: esc, formato: formato };
})(window);

/* ==========================================================================
   Buscador de Doctores — pantalla del paciente
   --------------------------------------------------------------------------
   Este archivo hace dos cosas: arrancar la conversación (el guion vive en
   guion-paciente.js) y pintar los resultados cuando termina.

   En los resultados manda una regla: **primero los doctores**. La maquinaria del
   ranking (los sub-scores eje por eje) sigue estando —es lo que hace auditable el
   orden— pero detrás de un "¿Por qué en este orden?", no delante de la cara del
   paciente, que lo que quiere ver son médicos y por qué le conviene uno más que
   otro.
   ========================================================================== */
(function () {
  'use strict';

  /* Un montaje por página. En buscar.html arranca solo con los valores por
     defecto; en el panel del paciente lo llama embed.js con `montar(config)`:
       raiz      — document o un ShadowRoot: donde viven los ids del buscador
       api       — URL base de la API (relativa por defecto; absoluta en el panel)
       img       — URL base de assets/img/ (para el avatar del asistente)
       contexto  — lo que ya se sabe de la persona (perfil de sesión), solo prellena
       enPanel   — "Nueva búsqueda" reinicia en su sitio en vez de recargar
       ancla     — elemento al que se lleva la vista al buscar (la tarjeta del panel) */
  var config   = {};
  var raiz     = document;
  var API      = 'api/';
  var contexto = {};

  var vistaChat, vistaRes, cargando, contenido;

  var catalogo = { especialidades: [], servicios: [], zonas: [], motivos: [], prioridades: [] };
  var ultima   = null;      // última respuesta del servidor
  var intake   = null;      // el intake con el que se buscó, para poder reordenar

  // ── Utilidades ─────────────────────────────────────────────────────────
  function esc(s) { return window.BDChat.esc(s); }
  function pesos(n) { return '$' + Number(n).toLocaleString('es-MX'); }
  function icono(id, clase) { return '<svg class="' + (clase || '') + '"><use href="#' + id + '"/></svg>'; }
  function avatar(doc, px) { return window.BDAvatar ? window.BDAvatar.svg(doc.nombre, doc.id, px) : ''; }

  async function pedirJson(url, opciones) {
    try {
      var respuesta = await fetch(url, opciones);
      var datos;
      try {
        datos = await respuesta.json();
      } catch (e) {
        console.error('Buscador — respuesta sin JSON:', e);
        return { ok: false, error: 'No pudimos leer la respuesta del servidor.' };
      }
      if (!respuesta.ok && !datos.error) datos.error = 'El servidor respondió con un error.';
      return datos;
    } catch (e) {
      console.error('Buscador — fallo de red:', e);
      return { ok: false, error: 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.' };
    }
  }

  // ── Arranque ───────────────────────────────────────────────────────────
  async function iniciar() {
    var cat = await pedirJson(API + 'catalogos.php');
    if (!cat || !cat.ok) {
      raiz.getElementById('chat').innerHTML =
        '<div class="aviso aviso-fuerte">' + icono('i-alerta') +
        '<span>No pudimos cargar el buscador. Recarga la página en un momento.</span></div>';
      return;
    }
    catalogo = cat;

    raiz.getElementById('lista-zonas').innerHTML = cat.zonas.map(function (z) {
      return '<option value="' + esc(z.nombre) + '">' + esc(z.ciudad) + (z.cp ? ' · CP ' + esc(z.cp) : '') + '</option>';
    }).join('');

    arrancarChat();
  }

  /* Separado de iniciar() porque "Nueva búsqueda" en el panel vuelve a pasar por
     aquí con el mismo catálogo y el mismo contexto: se prellena otra vez. */
  function arrancarChat() {
    window.BDChat.iniciar({
      contenedor: raiz.getElementById('chat'),
      guion: window.BDGuionPaciente.construir(catalogo, contexto),
      contexto: contexto,
      avatarUrl: config.img ? config.img + 'isotipo.png' : undefined,
      // Salida desde las preguntas delicadas del final: buscar con lo que ya hay.
      omitirTodo: { etiqueta: 'Buscar ya con lo que tengo', texto: 'Busca ya con lo que tengo', hasta: 'cierre' },
      alTerminar: function (datos) {
        intake = window.BDGuionPaciente.aIntake(catalogo, datos, contexto);
        buscar();
      }
    });
  }

  /* En buscar.html la vista sube al inicio de la página; en el panel eso llevaría
     al menú, así que se lleva a la tarjeta que contiene al buscador. */
  function irArriba() {
    if (config.ancla && config.ancla.scrollIntoView) {
      config.ancla.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function reiniciar() {
    ultima = null;
    intake = null;
    contenido.innerHTML = '';
    vistaRes.classList.add('oculto');
    vistaChat.classList.remove('oculto');
    arrancarChat();
    irArriba();
  }

  // ── Búsqueda ───────────────────────────────────────────────────────────
  async function buscar(reordenando) {
    vistaChat.classList.add('oculto');
    vistaRes.classList.remove('oculto');

    if (reordenando) {
      contenido.classList.add('actualizando');
    } else {
      contenido.innerHTML = '';
      cargando.classList.remove('oculto');
    }

    var datos = await pedirJson(API + 'buscar-doctores.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intake)
    });

    cargando.classList.add('oculto');
    contenido.classList.remove('actualizando');

    if (!datos || datos.ok !== true) {
      contenido.innerHTML = plantillaVacio('No pudimos completar la búsqueda',
        (datos && datos.error) ? datos.error : 'Intenta de nuevo en un momento.', '');
      enganchar();
      if (!reordenando) irArriba();
      return;
    }

    ultima = datos;
    if (Array.isArray(datos.prioridades)) intake.prioridades = datos.prioridades;

    contenido.innerHTML = (datos.doctores && datos.doctores.length)
      ? plantillaResultados(datos)
      : plantillaSinResultados(datos);
    enganchar();
    // Se sube DESPUÉS de pintar: antes, con solo el spinner, la página es tan
    // corta que no hay a dónde desplazarse y la vista se queda donde estaba.
    if (!reordenando) irArriba();
  }

  // ── Plantillas ─────────────────────────────────────────────────────────
  function plantillaVacio(titulo, texto, extra) {
    return '<div class="tarjeta vacio">' +
      '<span class="vacio-icono">' + icono('i-vacio') + '</span>' +
      '<h3>' + esc(titulo) + '</h3>' +
      '<p>' + esc(texto) + '</p>' + (extra || '') +
      '<button class="btn btn-primario" type="button" data-nueva>' + icono('i-flecha-izq') + ' Empezar de nuevo</button>' +
      '</div>';
  }

  function plantillaSinResultados(d) {
    var extra = '';
    if (d.filtros_bloqueantes && d.filtros_bloqueantes.length) {
      extra += '<div class="chips">' + d.filtros_bloqueantes.map(function (f) {
        return '<button class="sugerido" type="button" data-quitar="' + esc(f.clave) + '">Quitar: ' + esc(f.texto) + ' (' + f.resultados + ')</button>';
      }).join('') + '</div>';
    }
    if (d.sugerencias && d.sugerencias.length) {
      extra += '<div class="chips">' + d.sugerencias.slice(0, 8).map(function (s) {
        return '<button class="sugerido" type="button" data-especialidad="' + esc(s.slug) + '">' + esc(s.nombre) + '</button>';
      }).join('') + '</div>';
    }
    return plantillaVacio('No encontramos a nadie que encaje', d.mensaje || 'Prueba con otra zona o con menos requisitos.', extra);
  }

  function plantillaResultados(d) {
    var partes = [];
    var mejor = d.doctores[0];

    // ── Encabezado: qué se buscó y cómo se ordenó ──────────────────────
    var contexto = [];
    if (d.zona) {
      contexto.push(d.zona.exacta
        ? 'cerca de donde estás' + (d.zona.nombre ? ' (' + d.zona.nombre + ')' : '')
        : 'cerca de ' + d.zona.nombre);
    }
    if (d.necesidad && d.necesidad.servicio) contexto.push(d.necesidad.servicio.toLowerCase());

    partes.push(
      '<div class="resumen-busqueda">' +
        '<div class="crece">' +
          '<h2>' + d.total + (d.total === 1 ? ' médico' : ' médicos') + ' de ' + esc(d.necesidad.especialidad) + '</h2>' +
          '<p class="resumen-detalle">' + (contexto.length ? esc(contexto.join(' · ')) : 'En toda la zona') +
            (d.orden_por ? ' · <strong>ordenado por ' + esc(d.orden_por) + '</strong>' : '') + '</p>' +
        '</div>' +
        '<button class="btn btn-linea" type="button" data-nueva>' + icono('i-flecha-izq') + ' Nueva búsqueda</button>' +
      '</div>'
    );

    if (d.zona && d.zona.lejos) {
      partes.push('<div class="aviso aviso-fuerte">' + icono('i-alerta') +
        '<span>Estás a unos ' + d.zona.distancia_zona + ' km del área donde este prototipo tiene perfiles de prueba, ' +
        'así que las distancias que verás son grandes.</span></div>');
    }

    // ── La recomendación principal, en grande ──────────────────────────
    var etiquetaMejor = 'Mi recomendación';
    (d.arquetipos || []).forEach(function (a) { if (a.clave === 'mejor_general') etiquetaMejor = a.etiqueta; });

    partes.push(
      '<article class="tarjeta destacada">' +
        '<div class="destacada-sello">' + icono('i-check-circulo') + esc(etiquetaMejor) + '</div>' +
        '<div class="destacada-cuerpo">' +
          avatar(mejor, 60) +
          '<div class="destacada-datos">' +
            '<div class="destacada-nombre">' + esc(mejor.nombre) + '</div>' +
            '<div class="destacada-esp">' + esc(mejor.especialidad) +
              (mejor.ubicacion ? ' · ' + esc(mejor.ubicacion.nombre) + ', ' + esc(mejor.ubicacion.colonia) : '') + '</div>' +
            '<p class="destacada-porque">' + esc(mejor.justificacion) + '</p>' +
            '<div class="chips">' + chipsDoctor(mejor).join('') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="destacada-pie">' +
          '<span class="crece"></span>' +
          '<button class="btn btn-acento" type="button" data-elegir="' + mejor.id + '" data-posicion="1">' +
            'Ver contacto</button>' +
        '</div>' +
      '</article>'
    );

    // ── Por qué te conviene uno más que otro ───────────────────────────
    if (d.comparativa) {
      partes.push(
        '<section class="tarjeta comparativa-narrada">' +
          '<div class="comparativa-icono">' + icono('i-balanza') + '</div>' +
          '<div>' +
            '<div class="comparativa-titulo">Por qué te conviene uno más que otro</div>' +
            '<p>' + esc(d.comparativa) + '</p>' +
          '</div>' +
        '</section>'
      );
    }

    // ── El resto de opciones ───────────────────────────────────────────
    if (d.doctores.length > 1) {
      var etiquetaPorId = {};
      (d.arquetipos || []).forEach(function (a) {
        if (a.clave !== 'mejor_general') etiquetaPorId[a.doctor_id] = a.etiqueta;
      });

      partes.push('<div class="lista-titulo"><h3 class="crece">Otras opciones para ti</h3></div>');
      partes.push('<div class="lista">' + d.doctores.slice(1).map(function (doc, i) {
        return tarjetaDoctor(doc, i + 2, etiquetaPorId[doc.id], d);
      }).join('') + '</div>');
    }

    if (d.doctores.length >= 2) partes.push(comparador(d.doctores.slice(0, 3)));

    partes.push(ajustarOrden(d));

    partes.push('<div class="aviso nota-legal">' + icono('i-info') +
      '<span>Los perfiles son ficticios y las calificaciones, simuladas. Este directorio no da diagnósticos ni consejo médico.</span></div>');

    return partes.join('');
  }

  /* Reordenar sin volver a conversar: lo único que se deja tocar aquí es lo que
     más le importa, que es lo que de verdad cambia el orden. */
  function ajustarOrden(d) {
    var chips = (catalogo.prioridades || []).map(function (p) {
      var activa = (intake.prioridades || []).indexOf(p.clave) !== -1;
      return '<button type="button" class="elegible' + (activa ? ' activa' : '') + '" ' +
        'data-prioridad="' + esc(p.clave) + '" aria-pressed="' + activa + '">' +
        (activa ? icono('i-check') : '') + esc(p.etiqueta) + '</button>';
    }).join('');

    return '<section class="tarjeta afinar">' +
      '<div class="afinar-titulo">' + icono('i-corazon') + '¿Cambió lo que más te importa?</div>' +
      '<div class="elegibles">' + chips + '</div>' +
      '<p class="afinar-nota">Tócalo y reordeno la lista al instante.</p>' +
    '</section>';
  }

  function chipsDoctor(doc) {
    var chips = [];
    if (doc.precio_min !== null) {
      chips.push('<span class="chip">' + icono('i-moneda') + 'Desde ' + pesos(doc.precio_min) + '</span>');
    } else {
      chips.push('<span class="chip chip-aviso">' + icono('i-info') + 'No especifica precio</span>');
    }
    if (doc.distancia_km !== null) {
      chips.push('<span class="chip">' + icono('i-pin') + (doc.distancia_km < 1 ? 'En tu zona' : 'A ' + doc.distancia_km + ' km') + '</span>');
    } else if (doc.ubicacion) {
      chips.push('<span class="chip">' + icono('i-pin') + esc(doc.ubicacion.colonia) + '</span>');
    } else {
      // Que no diga dónde atiende es un dato en sí, y explica por qué va abajo.
      chips.push('<span class="chip chip-aviso">' + icono('i-info') + 'No dice dónde atiende</span>');
    }
    if (doc.rating !== null && doc.num_opiniones > 0) {
      chips.push('<span class="chip">' + icono('i-estrella') + doc.rating + ' · ' + doc.num_opiniones + ' opiniones</span>');
    } else {
      chips.push('<span class="chip chip-aviso">' + icono('i-info') + 'Todavía sin opiniones</span>');
    }
    if (doc.anios_experiencia !== null) {
      chips.push('<span class="chip">' + icono('i-medalla') + doc.anios_experiencia + ' años de experiencia</span>');
    }
    if (doc.modalidad.indexOf('telemedicina') !== -1) {
      chips.push('<span class="chip">' + icono('i-video') + 'Videoconsulta</span>');
    }
    if (doc.disponibilidad === 'inmediata') {
      chips.push('<span class="chip">' + icono('i-reloj') + 'Puede atender hoy</span>');
    }
    if (doc.cedula_verificada) {
      chips.push('<span class="chip chip-ok" title="Número de cédula y documento en el expediente. El cotejo contra el registro público está pendiente en este prototipo.">' +
        icono('i-check-circulo') + 'Cédula registrada</span>');
    }
    return chips;
  }

  var TEXTO_NOTA = {
    bueno_pero_lejos:                'Muy buena opción, pero te queda lejos',
    economico_pero_nuevo:            'Más económico, pero lleva poco tiempo ejerciendo',
    experimentado_pero_caro:         'Más experiencia, pero cobra más',
    cerca_pero_menos_experiencia:    'Te queda cerca, con menos años de práctica',
    bien_calificado_pocas_opiniones: 'Bien calificado, aunque con pocas opiniones todavía',
    puede_atender_pronto:            'Puede atenderte en el plazo que necesitas'
  };

  function tarjetaDoctor(doc, posicion, etiqueta, d) {
    var notas = (doc.notas || []).map(function (n) {
      return TEXTO_NOTA[n] ? '<span class="chip chip-aviso">' + icono('i-info') + esc(TEXTO_NOTA[n]) + '</span>' : '';
    }).join('');

    return '<article class="tarjeta doctor">' +
      '<div class="doctor-cabeza">' +
        avatar(doc, 46) +
        '<div class="doctor-identidad">' +
          (etiqueta ? '<span class="doctor-etiqueta">' + esc(etiqueta) + '</span>' : '') +
          '<div class="doctor-nombre">' + esc(doc.nombre) + '</div>' +
          '<div class="doctor-esp">' + esc(doc.especialidad) +
            (doc.ubicacion ? ' · ' + esc(doc.ubicacion.colonia) : '') + '</div>' +
        '</div>' +
        '<span class="doctor-posicion">' + posicion + '</span>' +
      '</div>' +
      '<p class="doctor-porque">' + esc(doc.justificacion) + '</p>' +
      '<div class="chips">' + chipsDoctor(doc).join('') + notas + '</div>' +
      // La maquinaria del ranking sigue disponible y auditable, pero plegada.
      detalleEjes(doc, d) +
      '<div class="doctor-pie">' +
        '<span class="crece"></span>' +
        '<button class="btn btn-chico btn-primario" type="button" data-elegir="' + doc.id + '" data-posicion="' + posicion + '">Ver contacto</button>' +
      '</div>' +
    '</article>';
  }

  /* Lo que hay para contactar, tal cual está en el perfil. Lo que falta se dice
     ("No registró teléfono"): nunca se rellena con un dato que no existe. */
  function contactoDoctor(doc) {
    var u = doc.ubicacion;
    var filas = [];

    if (u) {
      var lugar = [u.nombre, u.direccion, [u.colonia, u.cp ? 'CP ' + u.cp : ''].filter(Boolean).join(' · '), u.ciudad]
        .filter(Boolean).map(esc).join('<br>');
      filas.push('<div class="contacto-fila">' + icono('i-pin') + '<span>' + lugar + '</span></div>');
    }

    filas.push('<div class="contacto-fila">' + icono('i-telefono') +
      (doc.telefono
        ? '<a href="tel:' + esc(String(doc.telefono).replace(/[^\d+]/g, '')) + '">' + esc(doc.telefono) + '</a>'
        : '<span class="contacto-falta">No registró teléfono</span>') +
      '</div>');

    if (doc.modalidad && doc.modalidad.length) {
      var mod = { consultorio: 'Consultorio', hospital: 'Hospital', telemedicina: 'Videoconsulta' };
      filas.push('<div class="chips">' + doc.modalidad.map(function (m) {
        return '<span class="chip">' + esc(mod[m] || m) + '</span>';
      }).join('') + '</div>');
    }

    return '<div class="contacto">' +
      filas.join('') +
      '<p class="contacto-nota">Anotamos que te interesó este perfil. Es un perfil de prueba: el teléfono no corresponde a una persona real.</p>' +
    '</div>';
  }

  function detalleEjes(doc, d) {
    var barras = Object.keys(d.ejes).map(function (clave) {
      var valor = doc.scores[clave];
      var peso  = doc.pesos[clave] || 0;
      if (valor === null) {
        return '<div class="eje" data-peso="0"><span class="eje-nombre">' + esc(d.ejes[clave]) + '</span>' +
          '<span class="eje-sin-dato">' + esc(motivoSinDato(clave, d)) + '</span><span></span></div>';
      }
      var pedido = esPrioridad(clave);
      return '<div class="eje' + (pedido ? ' eje--pedido' : '') + '" data-peso="' + peso + '" ' +
        'title="' + esc(d.ejes[clave] + ': ' + valor + ' de 100 · pesa ' + peso + '% en esta búsqueda') + '">' +
        '<span class="eje-nombre">' + esc(d.ejes[clave]) + (pedido ? icono('i-corazon', 'eje-marca') : '') + '</span>' +
        '<span class="eje-pista"><span class="eje-barra" style="width:' + valor + '%"></span></span>' +
        '<span class="eje-valor">' + valor + '</span></div>';
    }).join('');

    return '<details class="detalle-ejes">' +
      '<summary>¿Por qué en este orden? · ' + doc.score + ' de 100</summary>' +
      '<div class="ejes">' + barras + '</div>' +
      '<p class="detalle-pie">El orden lo calculan reglas fijas con estos ejes; la inteligencia artificial solo redacta la explicación.</p>' +
      '</details>';
  }

  function motivoSinDato(clave, d) {
    if (clave === 'proximidad')     return 'no aplica: no diste zona';
    if (clave === 'disponibilidad') return (!intake.urgencia || intake.urgencia === 'sin_prisa')
      ? 'no aplica: no tienes prisa' : 'el perfil no declara disponibilidad';
    if (clave === 'preferencias')   return 'no aplica: sin preferencias';
    if (clave === 'precio')         return 'el perfil no declara precio';
    if (clave === 'experiencia')    return 'el perfil no declara experiencia';
    return 'sin dato en el perfil';
  }

  function esPrioridad(eje) {
    var mapa = { cerca: 'proximidad', precio: 'precio', experiencia: 'experiencia',
                 pronto: 'disponibilidad', confianza: 'reputacion' };
    return (intake.prioridades || []).some(function (p) { return mapa[p] === eje; });
  }

  function comparador(docs) {
    function fila(titulo, fn) {
      return '<tr><th scope="row">' + esc(titulo) + '</th>' +
        docs.map(function (d) { return '<td>' + fn(d) + '</td>'; }).join('') + '</tr>';
    }
    return '<section class="tarjeta comparador">' +
      '<div class="comparador-cabeza">' + icono('i-balanza') + '<h3>Lado a lado</h3></div>' +
      '<div class="tabla-envoltura"><table class="tabla">' +
        '<thead><tr><th scope="col">Dato</th>' +
          docs.map(function (d) { return '<th scope="col">' + esc(d.nombre) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        fila('Consulta desde',  function (d) { return d.precio_min !== null ? pesos(d.precio_min) : 'No lo especifica'; }) +
        fila('Distancia',       function (d) { return d.distancia_km !== null ? d.distancia_km + ' km' : (d.ubicacion ? esc(d.ubicacion.colonia) : 'Sin ubicación'); }) +
        fila('Experiencia',     function (d) { return d.anios_experiencia !== null ? d.anios_experiencia + ' años' : 'No lo especifica'; }) +
        fila('Calificación',    function (d) { return (d.rating !== null && d.num_opiniones > 0) ? d.rating + ' (' + d.num_opiniones + ')' : 'Sin opiniones'; }) +
        fila('Puede atender',   function (d) { return { inmediata: 'El mismo día', esta_semana: 'Esta semana', programada: 'Con cita' }[d.disponibilidad] || 'No lo especifica'; }) +
        fila('Modalidad',       function (d) { return esc(d.modalidad.join(', ')) || 'No lo especifica'; }) +
        fila('Cédula',          function (d) { return d.cedula_verificada ? 'Registrada' : 'Sin registrar'; }) +
      '</tbody></table></div></section>';
  }

  // ── Interacciones ──────────────────────────────────────────────────────
  function enganchar() {
    Array.prototype.forEach.call(contenido.querySelectorAll('[data-nueva]'), function (b) {
      b.addEventListener('click', function () {
        // En el panel recargar tiraría la pestaña y la sesión visual; se reinicia en su sitio.
        if (config.enPanel) reiniciar(); else window.location.reload();
      });
    });

    Array.prototype.forEach.call(contenido.querySelectorAll('[data-prioridad]'), function (b) {
      b.addEventListener('click', function () {
        var clave = b.dataset.prioridad;
        var lista = intake.prioridades || [];
        var i = lista.indexOf(clave);
        if (i !== -1) { lista.splice(i, 1); }
        else {
          if (lista.length >= (catalogo.max_prioridades || 2)) lista.shift();
          lista.push(clave);
        }
        intake.prioridades = lista;
        intake.prioridades_tocadas = true;
        buscar(true);
      });
    });

    Array.prototype.forEach.call(contenido.querySelectorAll('[data-elegir]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;

        // El contacto se despliega en el sitio del botón, dentro de la misma tarjeta.
        var id  = Number(b.dataset.elegir);
        var doc = null;
        ((ultima && ultima.doctores) || []).forEach(function (x) { if (x.id === id) doc = x; });
        var pie = b.closest('.destacada-pie, .doctor-pie');
        if (doc && pie) {
          pie.insertAdjacentHTML('afterend', contactoDoctor(doc));
          pie.remove();
        } else {
          b.textContent = 'Guardado';
        }

        // Métrica del lado del doctor. Si falla, al paciente no le cambia nada.
        await pedirJson(API + 'registrar-eleccion.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_id:   Number(b.dataset.elegir),
            busqueda_id: ultima ? ultima.busqueda_id : null,
            posicion:    Number(b.dataset.posicion || 0)
          })
        });
      });
    });

    Array.prototype.forEach.call(contenido.querySelectorAll('[data-especialidad]'), function (b) {
      b.addEventListener('click', function () {
        intake.especialidad_slug = b.dataset.especialidad;
        intake.texto_libre = '';
        buscar();
      });
    });

    Array.prototype.forEach.call(contenido.querySelectorAll('[data-quitar]'), function (b) {
      b.addEventListener('click', function () {
        var campo = b.dataset.quitar;
        if (campo === 'para_nino')             delete intake.para_nino;
        if (campo === 'genero_obligatorio')    { delete intake.genero; delete intake.genero_obligatorio; }
        if (campo === 'modalidad_obligatoria') { delete intake.modalidad; delete intake.modalidad_obligatoria; }
        if (campo === 'idioma_obligatorio')    { delete intake.idioma; delete intake.idioma_obligatorio; }
        buscar();
      });
    });
  }

  // ── Montaje ────────────────────────────────────────────────────────────
  function montar(cfg) {
    config   = cfg || {};
    raiz     = config.raiz || document;
    API      = config.api || 'api/';
    contexto = config.contexto || {};
    contexto.api = API;     // el guion llama a interpretar.php con la misma base

    vistaChat = raiz.getElementById('vista-chat');
    vistaRes  = raiz.getElementById('vista-resultados');
    cargando  = raiz.getElementById('cargando');
    contenido = raiz.getElementById('contenido-resultados');

    iniciar();
  }

  // buscar.html: el marcado ya está en la página y arranca solo, como siempre.
  if (document.getElementById('vista-chat')) montar({});

  window.BDBuscar = { montar: montar };
})();

/* ==========================================================================
   Guion de la conversación del paciente.
   --------------------------------------------------------------------------
   Son DATOS: el motor (conversacion.js) no sabe nada de medicina y este archivo
   no sabe nada de burbujas. Todo lo que se le pregunta a alguien está aquí, en
   un solo lugar, y en el orden en que se le pregunta.

   El guion es determinista de principio a fin. La IA solo entra en un punto —
   interpretar lo que la persona escribió— y ni siquiera ahí decide: cuando el
   texto es ambiguo, quien elige es la persona, no el modelo. Y lo que la IA
   deduce del texto (que es urgente, que prefiere videollamada…) no se aplica en
   silencio: se PRELLENA como una respuesta visible que se puede corregir.

   El orden tiene intención:
     1. qué te pasa           → especialidad, con confirmación y servicio concreto
     2. para quién y dónde    → filtros duros y cercanía
     3. cómo y cuándo         → modalidad y urgencia
     4. qué te importa        → las prioridades que mueven los pesos
     5. lo delicado, al final → género del médico, presupuesto e idioma, con
                                una salida "buscar ya con lo que tengo"
   ========================================================================== */
(function (global) {
  'use strict';

  var API = 'api/';

  async function pedirJson(url, cuerpo) {
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      });
      try { return await r.json(); }
      catch (e) { console.error('Buscador — respuesta sin JSON:', e); return { ok: false }; }
    } catch (e) {
      console.error('Buscador — fallo de red:', e);
      return { ok: false };
    }
  }

  function motivoDe(catalogo, clave) {
    var m = null;
    (catalogo.motivos || []).forEach(function (x) { if (x.clave === clave) m = x; });
    return m;
  }

  // ── Etiquetas de las opciones: una sola fuente para el guion y el cierre ──
  var MODALIDAD = {
    consultorio:  { etiqueta: 'En consultorio',   apoyo: 'Verlo en persona',                 icono: 'i-consultorio', frase: 'en consultorio' },
    telemedicina: { etiqueta: 'Por videollamada', apoyo: 'Desde donde estés',                icono: 'i-video',       frase: 'por videollamada' },
    cualquiera:   { etiqueta: 'Me da igual',      apoyo: 'Lo que resulte más conveniente',   icono: 'i-check',       frase: null }
  };
  var URGENCIA = {
    hoy:         { etiqueta: 'Hoy mismo',      apoyo: 'No puede esperar',              icono: 'i-rayo',      frase: 'que pueda verte hoy' },
    esta_semana: { etiqueta: 'Esta semana',    apoyo: 'Pronto, pero no es urgencia',   icono: 'i-reloj',     frase: 'que pueda verte esta semana' },
    sin_prisa:   { etiqueta: 'Puedo esperar',  apoyo: 'Cuando haya un buen espacio',   icono: 'i-calendario', frase: null }
  };
  var GENERO = {
    F:          { etiqueta: 'Con una médica', icono: 'i-persona', frase: 'de preferencia una médica' },
    M:          { etiqueta: 'Con un médico',  icono: 'i-persona', frase: 'de preferencia un médico' },
    cualquiera: { etiqueta: 'Me da igual',    icono: 'i-check',   frase: null }
  };
  var PRESUPUESTO = {
    economico:  { etiqueta: 'Necesito que sea accesible', apoyo: 'El precio pesa mucho para mí', icono: 'i-moneda', frase: 'cuidando el precio' },
    medio:      { etiqueta: 'Tengo algo de margen',       apoyo: 'Precio razonable, sin exagerar', icono: 'i-balanza', frase: 'con un precio razonable' },
    sin_limite: { etiqueta: 'No es un problema',          apoyo: 'Que sea quien me convenga',      icono: 'i-check',   frase: null }
  };
  var IDIOMA = {
    es: { etiqueta: 'En español', icono: 'i-check',  frase: null },
    en: { etiqueta: 'En inglés',  icono: 'i-globos', frase: 'que hable inglés' }
  };

  function opcionesDe(tabla) {
    return Object.keys(tabla).map(function (k) {
      return { valor: k, etiqueta: tabla[k].etiqueta, apoyo: tabla[k].apoyo, icono: tabla[k].icono };
    });
  }

  /* Prellena un paso con lo que la IA sacó del texto libre. La persona ya lo dijo
     con sus palabras: se le muestra lo entendido y se le deja corregirlo. */
  function prefijadoDeTexto(tabla, valor) {
    if (!valor || !tabla[valor]) return null;
    return { valor: valor, texto: tabla[valor].etiqueta };
  }

  /**
   * El guion completo. `catalogo` viene de api/catalogos.php.
   *
   * `contexto` es lo que ya se sabe de la persona sin preguntarle: en el panel del
   * paciente viene de su perfil ({ nombre, paraQuien, domicilio, edad, api }). Solo
   * PRELLENA pasos: cada respuesta prellenada se pinta como burbuja y se puede
   * tocar para cambiarla. Sin contexto (buscar.html) el guion pregunta todo.
   */
  function construir(catalogo, contexto) {
    contexto = contexto || {};
    var api = contexto.api || API;

    return [

      // ── 1. Por qué vienes ────────────────────────────────────────────
      {
        id: 'motivo',
        pausa: 260,
        mensaje: 'Hola' + (contexto.nombre ? ', **' + contexto.nombre + '**' : '') +
          '. Te ayudo a encontrar al médico que te conviene, y te explico **por qué** te conviene.\n\n¿Qué te trae por aquí?',
        nota: 'No doy diagnósticos ni consejo médico: esto es un directorio.',
        tipo: 'opciones',
        opciones: (catalogo.motivos || []).map(function (m) {
          return { valor: m.clave, etiqueta: m.etiqueta, apoyo: m.apoyo, icono: m.icono };
        }).concat([
          { valor: '_especialidad', etiqueta: 'Ya sé qué especialista busco', apoyo: 'Elegirla de una lista', icono: 'i-lupa' }
        ]),
        siguiente: function (v) { return v === '_especialidad' ? 'especialidad' : 'necesidad'; }
      },

      // ── Atajo para quien ya lo tiene claro ───────────────────────────
      {
        id: 'especialidad',
        mensaje: '¿Cuál necesitas?',
        nota: 'Si no estás seguro, elige medicina general: de ahí te orientan.',
        tipo: 'opciones',
        opciones: (catalogo.especialidades || []).map(function (e) {
          return { valor: e.slug, etiqueta: e.nombre };
        }),
        siguiente: function () { return 'servicio'; }
      },

      // ── 2. Qué necesitas, con la pregunta del motivo ─────────────────
      {
        id: 'necesidad',
        mensaje: function (d) {
          var m = motivoDe(catalogo, d.motivo);
          return m ? m.pregunta : '¿Qué necesitas?';
        },
        nota: function (d) {
          var m = motivoDe(catalogo, d.motivo);
          return (m ? m.ayuda : 'Descríbelo con tus palabras.') +
            ' Si mencionas desde cuándo, dónde te queda bien o si lo necesitas pronto, lo tomo en cuenta.';
        },
        tipo: 'texto',
        multilinea: true,
        ejemplo: function (d) {
          var m = motivoDe(catalogo, d.motivo);
          return m ? m.ejemplo : 'Me salen granos en la cara';
        },
        // El chequeo ya trae especialidad, así que puede seguir sin texto.
        opcional: true,
        etiquetaOmitir: 'No sé cómo describirlo',
        textoOmitir: 'No sabría cómo describirlo',
        validar: function (v, d) {
          if (v === null) return true;
          if (String(v).trim().length < 3 && d.motivo !== 'chequeo') {
            return 'Cuéntame un poco más, con eso no puedo encontrar al especialista.';
          }
          return true;
        },

        alResponder: async function (v, d, chat) {
          d._interp = null;
          if (!v || String(v).trim().length < 3) return;

          var r = await pedirJson(api + 'interpretar.php', { texto: v, motivo: d.motivo });
          if (!r || !r.ok) return;
          d._interp = r;

          // Lo que la persona ya dijo con sus palabras se prellena más adelante,
          // visible y corregible; nunca se aplica en silencio.
          var ex = r.extraido || {};
          if (ex.zona_texto)  d._zonaTexto = ex.zona_texto;
          if (ex.presupuesto) d._presupuesto = ex.presupuesto;
          if (ex.modalidad)   d._modalidad = ex.modalidad;
          if (ex.genero)      d._genero = ex.genero;
          if (ex.urgencia)    d._urgencia = ex.urgencia;
          if (ex.idioma)      d._idioma = ex.idioma;
          if (ex.para_nino === true) d._paraNino = true;

          if (!r.reconocido) {
            chat.decir('Con eso no logro identificar a qué especialista te toca ir. Elígelo tú y seguimos.');
          }
        },

        siguiente: function (v, d) {
          var r = d._interp;
          if (d.motivo === 'chequeo' && (!r || !r.reconocido)) return 'servicio';
          if (!r || !r.reconocido) return 'especialidad';
          if (r.ambiguo) return 'desambiguar';
          return 'confirmacion';
        }
      },

      // ── 3. Repreguntar cuando de verdad no está claro ────────────────
      {
        id: 'desambiguar',
        mensaje: function (d) {
          var c = (d._interp.candidatos || []).slice(0, 2);
          return 'Por lo que me cuentas, esto podría ser tema de **' + c[0].nombre.toLowerCase() +
                 '** o de **' + c[1].nombre.toLowerCase() + '**. ¿Cuál te suena más?';
        },
        nota: 'Si no estás seguro, no pasa nada: te mando con medicina general y de ahí te orientan.',
        tipo: 'opciones',
        opciones: [],
        // Las opciones salen de lo que la persona acaba de escribir, así que se
        // arman justo antes de pintar el paso.
        antesDePintar: function (d, paso) {
          var c = (d._interp && d._interp.candidatos) ? d._interp.candidatos.slice(0, 3) : [];
          paso.opciones = c.map(function (x) { return { valor: x.slug, etiqueta: x.nombre }; })
            .concat([{ valor: 'medicina-general', etiqueta: 'No estoy seguro',
                       apoyo: 'Que me orienten en medicina general' }]);
        },
        siguiente: function () { return 'servicio'; }
      },

      // ── 4. Acuse que se puede contradecir ────────────────────────────
      // Antes era un aviso: si la IA se equivocaba, la persona se enteraba en los
      // resultados. Ahora se pregunta, y "no, es otra cosa" lleva a la lista.
      {
        id: 'confirmacion',
        pausa: 500,
        mensaje: function (d) {
          var esp = especialidadElegida(catalogo, d);
          var srv = (d._interp && d._interp.servicio) ? d._interp.servicio.nombre.toLowerCase() : null;
          return 'Por lo que me cuentas, esto es tema de **' + (esp ? esp.nombre.toLowerCase() : 'un especialista') + '**' +
                 (srv ? ', y en concreto ' + srv : '') + '. ¿Voy bien?';
        },
        tipo: 'opciones',
        opciones: [
          { valor: 'si', etiqueta: 'Sí, es eso',        icono: 'i-check' },
          { valor: 'no', etiqueta: 'No, es otra cosa',  apoyo: 'Elijo la especialidad yo', icono: 'i-flecha-der' }
        ],
        siguiente: function (v) { return v === 'no' ? 'especialidad' : 'servicio'; }
      },

      // ── 5. El servicio concreto: lo que afina el eje "lo que necesitas" ─
      {
        id: 'servicio',
        mensaje: function (d) {
          var esp = especialidadElegida(catalogo, d);
          return 'Dentro de **' + (esp ? esp.nombre.toLowerCase() : 'esa especialidad') +
                 '**, ¿alguno de estos se parece a lo que necesitas?';
        },
        nota: 'Con esto afino el emparejamiento: cuenta más quien ofrece justo ese servicio. Si ninguno encaja, sigue sin problema.',
        tipo: 'opciones',
        opciones: [],
        antesDePintar: function (d, paso) {
          var esp = especialidadElegida(catalogo, d);
          var lista = serviciosDe(catalogo, esp);
          // El que la IA dedujo va primero: es la mejor pista que hay.
          var pista = (d._interp && d._interp.servicio) ? d._interp.servicio.slug : null;
          lista.sort(function (a, b) { return (b.slug === pista) - (a.slug === pista); });
          paso.opciones = lista.slice(0, 8).map(function (s) { return { valor: s.slug, etiqueta: s.nombre }; })
            .concat([{ valor: 'ninguno', etiqueta: 'Ninguno en particular', apoyo: 'Busco la especialidad en general', icono: 'i-check' }]);
        },
        // Sin servicios en el catálogo para esa especialidad, el paso se salta
        // solo: prellenado con "ninguno", sin mensaje.
        prefijado: function (d) {
          var esp = especialidadElegida(catalogo, d);
          return serviciosDe(catalogo, esp).length ? null : { valor: 'ninguno', texto: null };
        },
        mensajePrefijado: '',    // cadena vacía: el asistente no dice nada
        siguiente: function (v, d) { return d.motivo === 'nino' || d._paraNino ? 'ubicacion' : 'para_quien'; }
      },

      // ── 6. Para quién es ─────────────────────────────────────────────
      {
        id: 'para_quien',
        mensaje: '¿La consulta es para ti?',
        nota: 'Si es para un niño o niña, solo te muestro a quienes atienden menores.',
        // En el panel se da por hecho que es para quien tiene la sesión; la burbuja
        // queda a un toque de cambiarlo.
        mensajePrefijado: 'Doy por hecho que la consulta es para ti.',
        prefijado: function () {
          return contexto.paraQuien === 'mi' ? { valor: 'mi', texto: 'Sí, para mí' } : null;
        },
        tipo: 'opciones',
        opciones: [
          { valor: 'mi',    etiqueta: 'Sí, para mí',            icono: 'i-persona' },
          { valor: 'menor', etiqueta: 'Es para un niño o niña', icono: 'i-nino' },
          { valor: 'otro',  etiqueta: 'Para otra persona adulta', icono: 'i-persona' }
        ],
        siguiente: function () { return 'ubicacion'; }
      },

      // ── 7. Dónde ─────────────────────────────────────────────────────
      {
        id: 'ubicacion',
        mensaje: '¿Por dónde te queda bien?',
        mensajePrefijado: 'Te busco cerca de tu domicilio. Si prefieres otra zona, toca tu respuesta y la cambias.',
        // Las palabras de la persona mandan sobre el perfil: si ya mencionó una zona
        // al describir lo que le pasa, se pregunta con esa pista y no se prellena.
        prefijado: function (d) {
          if (d._zonaTexto) return null;
          var z = zonaDeDomicilio(catalogo, contexto.domicilio);
          return z ? { valor: z.valor, texto: 'Cerca de ' + z.nombre + ' (mi domicilio)' } : null;
        },
        nota: function (d) {
          return d._zonaTexto
            ? 'Mencionaste ' + d._zonaTexto + '. Confírmalo o dime otra zona; también puedo tomar tu ubicación exacta.'
            : 'Colonia, alcaldía o código postal. Si prefieres, tomo tu ubicación exacta.';
        },
        tipo: 'ubicacion',
        listaZonas: true,
        ejemplo: 'Polanco, Coyoacán, 03100…',
        validar: function (v) {
          if (v && typeof v === 'object') return true;      // coordenadas
          if (!v || String(v).trim().length < 3) return 'Dime una colonia, una alcaldía o un código postal.';
          return true;
        },
        siguiente: function () { return 'modalidad'; }
      },

      // ── 8. Cómo ──────────────────────────────────────────────────────
      {
        id: 'modalidad',
        mensaje: '¿Cómo prefieres la consulta?',
        nota: 'Si eliges videollamada, solo verás a quienes la ofrecen. Consultorio ordena, no excluye.',
        prefijado: function (d) {
          var v = d._modalidad === 'hospital' ? 'consultorio' : d._modalidad;
          return prefijadoDeTexto(MODALIDAD, v);
        },
        mensajePrefijado: function (d) {
          return 'Me dijiste que la prefieres ' + MODALIDAD[d._modalidad === 'hospital' ? 'consultorio' : d._modalidad].frase + '; lo tomo en cuenta.';
        },
        tipo: 'opciones',
        opciones: opcionesDe(MODALIDAD),
        siguiente: function () { return 'urgencia'; }
      },

      // ── 9. Cuándo ────────────────────────────────────────────────────
      {
        id: 'urgencia',
        mensaje: '¿Qué tan pronto necesitas que te vean?',
        nota: 'Con "hoy" o "esta semana", la disponibilidad empieza a pesar en el orden.',
        prefijado: function (d) {
          if (d.motivo === 'urgente') return { valor: 'hoy', texto: URGENCIA.hoy.etiqueta };
          return prefijadoDeTexto(URGENCIA, d._urgencia);
        },
        mensajePrefijado: function (d) {
          return d.motivo === 'urgente'
            ? 'Como es algo que no puede esperar, busco a quien pueda verte hoy.'
            : 'Por lo que escribiste, entiendo que lo necesitas ' + URGENCIA[d._urgencia].etiqueta.toLowerCase() + '; lo tomo en cuenta.';
        },
        tipo: 'opciones',
        opciones: opcionesDe(URGENCIA),
        siguiente: function () { return 'prioridades'; }
      },

      // ── 10. Lo que más importa (mueve los pesos del motor) ───────────
      {
        id: 'prioridades',
        mensaje: 'Y para ti, ¿qué es lo que más importa?',
        nota: 'Elige hasta dos y ordeno la lista pensando en eso. Si no eliges nada, la ordeno de forma equilibrada.',
        tipo: 'multi',
        maximo: catalogo.max_prioridades || 2,
        textoVacio: 'Lo que tú veas',
        opciones: (catalogo.prioridades || []).map(function (p) {
          return { valor: p.clave, etiqueta: p.etiqueta, icono: iconoPrioridad(p.clave) };
        }),
        siguiente: function () { return 'genero'; }
      },

      // ── 11-13. Lo delicado, al final, con otro encuadre y con salida ──
      // Género como comodidad, presupuesto como necesidad, idioma como requisito.
      // Cada uno con su "me da igual" y con "Buscar ya con lo que tengo".
      {
        id: 'genero',
        mensaje: 'Ya casi. ¿Con quién te sentirías más a gusto?',
        nota: 'Es una preferencia, no un filtro: ordena la lista, no deja a nadie fuera.',
        prefijado: function (d) { return prefijadoDeTexto(GENERO, d._genero); },
        mensajePrefijado: function (d) { return 'Me dijiste que te sentirías más a gusto ' + GENERO[d._genero].etiqueta.toLowerCase() + '; lo tomo en cuenta.'; },
        tipo: 'opciones',
        atajo: true,
        opciones: opcionesDe(GENERO),
        siguiente: function () { return 'presupuesto'; }
      },
      {
        id: 'presupuesto',
        mensaje: 'Sobre el costo de la consulta, ¿cómo andas?',
        nota: 'Solo lo uso para ordenar. Ningún precio se oculta y ningún perfil se descarta por esto.',
        prefijado: function (d) { return prefijadoDeTexto(PRESUPUESTO, d._presupuesto); },
        mensajePrefijado: function (d) { return 'Entendí que ' + PRESUPUESTO[d._presupuesto].etiqueta.toLowerCase() + '; lo tomo en cuenta.'; },
        tipo: 'opciones',
        atajo: true,
        opciones: opcionesDe(PRESUPUESTO),
        siguiente: function () { return 'idioma'; }
      },
      {
        id: 'idioma',
        mensaje: '¿En qué idioma necesitas la consulta?',
        nota: 'Con inglés, solo verás a quienes lo hablan.',
        prefijado: function (d) { return d._idioma === 'en' ? prefijadoDeTexto(IDIOMA, 'en') : null; },
        mensajePrefijado: 'Me dijiste que necesitas que hable inglés; lo tomo en cuenta.',
        tipo: 'opciones',
        atajo: true,
        opciones: opcionesDe(IDIOMA),
        siguiente: function () { return 'cierre'; }
      },

      // ── 14. Resumen completo y a buscar ──────────────────────────────
      // Todo lo que va a pesar se dice aquí, para que la persona vea con qué se
      // busca y pueda tocar cualquier respuesta antes de ver resultados.
      {
        id: 'cierre',
        pausa: 380,
        mensaje: function (d) { return resumen(catalogo, d, contexto); },
        tipo: 'aviso',
        siguiente: function () { return null; }    // termina y dispara la búsqueda
      }
    ];
  }

  // ── Auxiliares ───────────────────────────────────────────────────────
  function iconoPrioridad(clave) {
    return { cerca: 'i-pin', precio: 'i-moneda', experiencia: 'i-medalla',
             pronto: 'i-reloj', confianza: 'i-estrella' }[clave] || 'i-check';
  }

  function frasePrioridad(catalogo, clave) {
    var f = clave;
    (catalogo.prioridades || []).forEach(function (p) {
      if (p.clave === clave) f = p.etiqueta.toLowerCase().replace(/^que me /, 'que te ').replace(/^que /, 'que ');
    });
    return f;
  }

  /** Sin acentos ni mayúsculas, para comparar "Del Valle" con "del valle". */
  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  /**
   * Traduce el domicilio del perfil a lo que entiende `zona` en el intake. Primero
   * la colonia si está en el catálogo (proximidad exacta); si no, colonia + CP (el
   * servidor resuelve el CP primero); si no, colonia + municipio (puede quedar en
   * "misma ciudad", que es lo que de verdad se sabe). Sin nada usable, null: se
   * pregunta. Nunca se inventa una zona.
   */
  function zonaDeDomicilio(catalogo, dom) {
    if (!dom) return null;
    var colonia = String(dom.colonia || '').trim();
    var cp      = String(dom.cp || '').trim();
    var muni    = String(dom.municipio || '').trim();
    if (!colonia && !cp) return null;

    if (colonia) {
      var buscada = normalizar(colonia), zona = null;
      (catalogo.zonas || []).forEach(function (z) { if (normalizar(z.nombre) === buscada) zona = z; });
      if (zona) return { valor: zona.nombre, nombre: zona.nombre };
    }
    if (/^\d{5}$/.test(cp)) {
      return { valor: (colonia ? colonia + ', ' : '') + 'CP ' + cp, nombre: colonia || 'CP ' + cp };
    }
    if (colonia && muni) return { valor: colonia + ', ' + muni, nombre: colonia };
    return colonia ? { valor: colonia, nombre: colonia } : null;
  }

  /** La persona de la sesión es menor y la consulta es para ella. */
  function esMenor(d, contexto) {
    return d.para_quien === 'mi' && !!contexto && typeof contexto.edad === 'number' && contexto.edad < 18;
  }

  /** Los servicios del catálogo que pertenecen a una especialidad. */
  function serviciosDe(catalogo, esp) {
    if (!esp) return [];
    return (catalogo.servicios || []).filter(function (s) { return s.especialidad_id === esp.id; });
  }

  /** El servicio elegido, validado: tiene que pertenecer a la especialidad final. */
  function servicioElegido(catalogo, d, esp) {
    if (!esp) return null;
    var slug = d.servicio && d.servicio !== 'ninguno' ? d.servicio : null;
    // Si la persona no eligió pero la IA dedujo uno, vale como pista; si eligió
    // "ninguno" a propósito, manda su decisión.
    if (!slug && d.servicio !== 'ninguno' && d._interp && d._interp.servicio) slug = d._interp.servicio.slug;
    var s = null;
    serviciosDe(catalogo, esp).forEach(function (x) { if (x.slug === slug) s = x; });
    return s;
  }

  /** La especialidad que quedó elegida, venga del atajo, de la IA o de la repregunta. */
  function especialidadElegida(catalogo, d) {
    var slug = d.especialidad || d.desambiguar ||
      (d._interp && d._interp.candidatos && d._interp.candidatos.length ? d._interp.candidatos[0].slug : null);
    if (!slug) return null;
    var esp = null;
    (catalogo.especialidades || []).forEach(function (e) { if (e.slug === slug) esp = e; });
    return esp;
  }

  /** El resumen del cierre: todo lo que va a pesar, en una frase legible. */
  function resumen(catalogo, d, contexto) {
    var esp = especialidadElegida(catalogo, d);
    var srv = servicioElegido(catalogo, d, esp);
    var partes = ['Voy a buscarte **' + (esp ? esp.nombre.toLowerCase() : 'un especialista') + '**' +
                  (srv ? ' para ' + srv.nombre.toLowerCase() : '')];

    if (d.ubicacion && typeof d.ubicacion === 'object') partes.push('cerca de donde estás');
    else if (d.ubicacion) partes.push('por ' + d.ubicacion);

    if (d.modalidad && MODALIDAD[d.modalidad] && MODALIDAD[d.modalidad].frase) partes.push(MODALIDAD[d.modalidad].frase);
    if (d.urgencia  && URGENCIA[d.urgencia]   && URGENCIA[d.urgencia].frase)   partes.push(URGENCIA[d.urgencia].frase);

    if (d.prioridades && d.prioridades.length) {
      partes.push('priorizando ' + d.prioridades.map(function (p) { return frasePrioridad(catalogo, p); }).join(' y '));
    }

    if (d.genero      && GENERO[d.genero]           && GENERO[d.genero].frase)           partes.push(GENERO[d.genero].frase);
    if (d.presupuesto && PRESUPUESTO[d.presupuesto] && PRESUPUESTO[d.presupuesto].frase) partes.push(PRESUPUESTO[d.presupuesto].frase);
    if (d.idioma      && IDIOMA[d.idioma]           && IDIOMA[d.idioma].frase)           partes.push(IDIOMA[d.idioma].frase);

    // El filtro por edad se dice: un filtro aplicado en silencio es un resultado
    // que la persona no entiende.
    if (d.para_quien === 'menor' || d.motivo === 'nino' || d._paraNino) partes.push('que atienda a niños');
    else if (esMenor(d, contexto)) partes.push('que atienda a menores de edad');

    return partes.join(', ') + '.\n\nSi algo no es así, toca esa respuesta y la cambias.';
  }

  /** Convierte lo contestado en el intake que entiende api/buscar-doctores.php. */
  function aIntake(catalogo, d, contexto) {
    var esp = especialidadElegida(catalogo, d);
    var srv = servicioElegido(catalogo, d, esp);

    var intake = {
      motivo:            d.motivo && d.motivo !== '_especialidad' ? d.motivo : null,
      texto_libre:       typeof d.necesidad === 'string' ? d.necesidad : '',
      especialidad_slug: esp ? esp.slug : null,
      servicio_slug:     srv ? srv.slug : null,
      prioridades:       d.prioridades || [],
      prioridades_tocadas: true,
      zona:              '',
      lat: null, lng: null
    };

    if (d.ubicacion && typeof d.ubicacion === 'object') {
      intake.lat = d.ubicacion.lat;
      intake.lng = d.ubicacion.lng;
    } else if (d.ubicacion) {
      intake.zona = d.ubicacion;
    }

    if (d.para_quien === 'menor' || d.motivo === 'nino' || d._paraNino || esMenor(d, contexto)) intake.para_nino = true;

    // Modalidad: videollamada es requisito (quien no la ofrece no sirve);
    // consultorio es preferencia (casi todos lo tienen).
    if (d.modalidad === 'telemedicina') { intake.modalidad = 'telemedicina'; intake.modalidad_obligatoria = true; }
    if (d.modalidad === 'consultorio')  { intake.modalidad = 'consultorio'; }

    if (d.urgencia && URGENCIA[d.urgencia]) intake.urgencia = d.urgencia;
    if (d.genero === 'F' || d.genero === 'M') intake.genero = d.genero;        // preferencia, no filtro
    if (d.presupuesto && PRESUPUESTO[d.presupuesto]) intake.presupuesto = d.presupuesto;
    if (d.idioma === 'en') { intake.idioma = 'en'; intake.idioma_obligatorio = true; }

    return intake;
  }

  global.BDGuionPaciente = {
    construir: construir,
    aIntake: aIntake,
    especialidadElegida: especialidadElegida
  };
})(window);

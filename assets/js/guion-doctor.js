/* ==========================================================================
   Guion del alta de cuenta del médico.
   --------------------------------------------------------------------------
   Conversación CORTA y con un solo objetivo: crear la cuenta. Nombre, correo,
   contraseña y cédula. Nada más.

   El resto del perfil —especialidad, servicios, dónde atiende, precios, bio—
   vive en el formulario de `mi-perfil.html`, que para llenar muchos campos es
   más rápido que conversar. La conversación gana en el alta, donde importa que
   la primera impresión sea humana; pierde en el llenado largo, donde importa
   poder saltar de un campo a otro.

   Dos decisiones dentro:
   1. La cuenta se crea al dar la contraseña, no al final. La cédula viene
      después, así que abandonar en ese punto ya deja la cuenta hecha.
   2. La cédula lleva **"Omitir por ahora"** a la vista. En una demo nadie va a
      subir la suya, y esconder esa salida solo produce abandonos.
   ========================================================================== */
(function (global) {
  'use strict';

  var API = 'api/';

  async function json(url, cuerpo) {
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(cuerpo)
      });
      var d;
      try { d = await r.json(); } catch (e) { return { ok: false, error: 'Respuesta ilegible del servidor.' }; }
      d.estado = r.status;
      return d;
    } catch (e) {
      console.error('Buscador — fallo de red:', e);
      return { ok: false, error: 'No pudimos conectar. Revisa tu conexión.' };
    }
  }

  /**
   * Guarda lo capturado en el alta. Se manda el nombre junto con la cédula
   * porque el endpoint reescribe el perfil entero: mandar solo la cédula
   * borraría el nombre que se acaba de dar.
   */
  async function guardarCedula(d) {
    if (!d._cuenta) return { ok: false };

    var fd = new FormData();
    fd.append('nombre',          d.nombre || '');
    fd.append('cedula',          d.cedula || '');
    fd.append('atiende_adultos', '1');
    if (d._cedulaArchivo) fd.append('cedula_archivo', d._cedulaArchivo);

    try {
      var r = await fetch(API + 'guardar-doctor.php', { method: 'POST', body: fd, credentials: 'same-origin' });
      return await r.json();
    } catch (e) {
      console.error('Buscador — no se pudo guardar la cédula:', e);
      return { ok: false };
    }
  }

  function construir() {
    return [

      // ── 1. Nombre ────────────────────────────────────────────────────
      {
        id: 'nombre',
        pausa: 260,
        mensaje: 'Hola. Vamos a crear tu cuenta; son cuatro datos y en un minuto estás dentro.\n\n¿Cómo quieres que te vean los pacientes?',
        nota: 'Como lo pondrías en tu consultorio. Por ejemplo: Dra. Ana Ruiz Medina.',
        tipo: 'texto',
        autocompletar: 'name',
        max: 120,
        ejemplo: 'Dra. Ana Ruiz Medina',
        validar: function (v) {
          if (!v || v.trim().length < 4) return 'Escribe tu nombre completo, como quieres que lo vean.';
          return true;
        }
      },

      // ── 2. Correo ────────────────────────────────────────────────────
      {
        id: 'email',
        mensaje: function (d) { return 'Mucho gusto, ' + primerNombre(d.nombre) + '. ¿Cuál es tu correo?'; },
        nota: 'Con él entras después a tu perfil.',
        tipo: 'texto',
        autocompletar: 'email',
        max: 160,
        ejemplo: 'tucorreo@ejemplo.com',
        validar: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())
            ? true : 'Ese correo no parece válido. Revísalo y seguimos.';
        }
      },

      // ── 3. Contraseña · aquí nace la cuenta ──────────────────────────
      {
        id: 'password',
        mensaje: 'Elige una contraseña.',
        nota: 'Mínimo 8 caracteres.',
        tipo: 'clave',
        ejemplo: '••••••••',
        validar: function (v) {
          return String(v || '').length >= 8 ? true : 'Necesita al menos 8 caracteres.';
        },
        alResponder: async function (v, d, chat) {
          var r = await json(API + 'registro-doctor.php', {
            nombre: d.nombre, email: d.email, password: v
          });
          if (r.ok) {
            d._cuenta = true;
            chat.decir('Listo, **tu cuenta ya existe**. Te queda un dato y terminamos.');
          } else {
            d._errorCuenta = r.error || 'No pudimos crear tu cuenta.';
          }
        },
        siguiente: function (v, d) { return d._cuenta ? 'cedula' : 'error_cuenta'; }
      },

      // Si el correo ya existía, se dice y se ofrece entrar en vez de insistir.
      {
        id: 'error_cuenta',
        mensaje: function (d) { return d._errorCuenta; },
        tipo: 'opciones',
        opciones: [
          { valor: 'otro',   etiqueta: 'Usar otro correo',              icono: 'i-flecha-izq' },
          { valor: 'entrar', etiqueta: 'Ya tengo cuenta, quiero entrar', icono: 'i-salir' }
        ],
        siguiente: function (v) {
          if (v === 'entrar') { window.location.href = 'doctores.html#entrar'; return null; }
          return 'email';
        }
      },

      // ── 4. Cédula profesional ────────────────────────────────────────
      {
        id: 'cedula',
        mensaje: '¿Cuál es tu cédula profesional?',
        nota: 'Con ella el paciente ve el sello de **cédula registrada** en tu tarjeta. Puedes ponerla después sin problema.',
        tipo: 'texto',
        max: 10,
        ejemplo: '1234567',
        opcional: true,
        etiquetaOmitir: 'Omitir por ahora',
        textoOmitir: 'Prefiero ponerla después',
        validar: function (v) {
          if (v === null || v === '') return true;
          return /^[0-9]{6,10}$/.test(String(v).trim()) ? true : 'La cédula son entre 6 y 10 dígitos.';
        },
        alResponder: async function (v, d) { await guardarCedula(d); },
        siguiente: function (v) { return v ? 'cedula_archivo' : 'cierre'; }
      },

      // ── 5. Documento de la cédula ────────────────────────────────────
      {
        id: 'cedula_archivo',
        mensaje: '¿Subes el documento?',
        nota: 'PDF, JPG o PNG, hasta 5 MB. Solo lo ve el equipo del directorio; nunca se publica. En este prototipo se valida el formato, no se coteja contra el registro público.',
        tipo: 'archivo',
        opcional: true,
        etiquetaOmitir: 'Lo subo después',
        textoOmitir: 'Lo subo después',
        alResponder: async function (v, d) {
          if (v) d._cedulaArchivo = v;
          await guardarCedula(d);
        },
        siguiente: function () { return 'cierre'; }
      },

      // ── 6. Cierre ────────────────────────────────────────────────────
      {
        id: 'cierre',
        pausa: 450,
        mensaje: 'Cuenta creada. Ahora sí, vamos por tu perfil.',
        tipo: 'aviso',
        siguiente: function () { return null; }
      }
    ];
  }

  function primerNombre(nombre) {
    var partes = String(nombre || '').trim().split(/\s+/)
      .filter(function (p) { return ['dr', 'dra', 'dr.', 'dra.', 'lic', 'lic.'].indexOf(p.toLowerCase()) === -1; });
    return partes[0] || 'doctor';
  }

  global.BDGuionDoctor = { construir: construir };
})(window);

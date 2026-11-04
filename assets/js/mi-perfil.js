/* ==========================================================================
   Perfil del médico: onboarding con medidor de completitud, vista previa en
   vivo y métricas reales.

   El servidor (api/perfil.php) es la ÚNICA autoridad sobre la completitud y el
   nivel. Lo que hay aquí es un espejo de esas mismas reglas, y sirve solo para
   que el medidor y la vista previa reaccionen mientras se escribe: al guardar
   siempre mandan los valores que devuelve el servidor.
   ========================================================================== */
(function () {
  'use strict';

  var API = 'api/';

  var form      = document.getElementById('form-perfil');
  var cargando  = document.getElementById('cargando');
  var catalogo  = { especialidades: [], servicios: [] };
  var reglas    = [];
  var perfil    = null;
  var metricas  = null;

  var NIVELES = {
    basico:    { texto: 'Básico',    minimo: 0 },
    destacado: { texto: 'Destacado', minimo: 50 },
    top:       { texto: 'Top',       minimo: 80 }
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icono(id) { return '<svg><use href="#' + id + '"/></svg>'; }

  async function pedirJson(url, opciones) {
    try {
      var respuesta = await fetch(url, opciones);
      var datos;
      try {
        datos = await respuesta.json();
      } catch (e) {
        console.error('Buscador — respuesta sin JSON:', e);
        return { ok: false, error: 'No pudimos leer la respuesta del servidor.', estado: respuesta.status };
      }
      datos.estado = respuesta.status;
      if (!respuesta.ok && !datos.error) datos.error = 'El servidor respondió con un error.';
      return datos;
    } catch (e) {
      console.error('Buscador — fallo de red:', e);
      return { ok: false, error: 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.' };
    }
  }

  function valor(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function marcados(nombre) {
    return Array.prototype.map.call(
      form.querySelectorAll('input[name="' + nombre + '"]:checked'),
      function (i) { return i.value; }
    );
  }

  // ── Espejo de las reglas del servidor (solo para el medidor en vivo) ──
  function evaluarLocal() {
    return {
      nombre:         valor('nombre') !== '',
      especialidad:   valor('especialidad') !== '',
      servicios:      form.querySelectorAll('input[name="servicios"]:checked').length > 0,
      ubicacion:      ubicacionesDelFormulario().length > 0,
      telefono:       valor('telefono') !== '',
      genero:         marcados('genero').length > 0,
      experiencia:    valor('anios') !== '',
      formacion:      valor('formacion') !== '',
      precio:         valor('precio-min') !== '' && valor('precio-max') !== '',
      bio:            valor('bio').length >= 60,
      idiomas:        marcados('idiomas').length > 0,
      modalidad:      marcados('modalidad').length > 0,
      disponibilidad: valor('disponibilidad') !== '',
      cedula:         valor('cedula') !== '',
      cedula_archivo: (perfil && perfil.cedula_archivo) || document.getElementById('cedula-archivo').files.length > 0
    };
  }

  function nivelDe(completitud) {
    if (completitud >= 80) return 'top';
    if (completitud >= 50) return 'destacado';
    return 'basico';
  }

  // ── Pintado del medidor, los pendientes y la vista previa ────────────
  function pintarEstado() {
    var cumple = evaluarLocal();
    var total  = 0;
    reglas.forEach(function (r) { if (cumple[r.clave]) total += r.puntos; });
    total = Math.min(100, total);
    var nivel = nivelDe(total);

    document.getElementById('medidor-cifra').textContent = total + '%';
    var barra = document.getElementById('medidor-barra');
    barra.style.width = total + '%';
    barra.dataset.nivel = nivel;
    barra.setAttribute('aria-valuenow', String(total));
    document.getElementById('nivel-sello').dataset.nivel = nivel;
    document.getElementById('nivel-texto').textContent = NIVELES[nivel].texto;

    Array.prototype.forEach.call(document.querySelectorAll('.medidor-escala span'), function (s) {
      s.classList.toggle('activo', s.dataset.escala === nivel);
    });

    // Primero lo que falta, y cada cosa con el beneficio real que trae.
    var faltan = reglas.filter(function (r) { return !cumple[r.clave]; });
    var listos = reglas.filter(function (r) { return cumple[r.clave]; });

    document.getElementById('pendientes').innerHTML =
      faltan.concat(listos).map(function (r) {
        var ok = cumple[r.clave] ? '1' : '0';
        return '<div class="pendiente" data-cumplido="' + ok + '">' +
          '<span class="pendiente-marca">' + icono('i-check') + '</span>' +
          '<div><b>' + esc(r.etiqueta) + '</b>' +
            (cumple[r.clave] ? '' : '<span>' + esc(r.beneficio) + '</span>') + '</div>' +
          '<span class="pendiente-puntos">' + (cumple[r.clave] ? '+' + r.puntos : r.puntos + ' pts') + '</span>' +
        '</div>';
      }).join('');

    pintarPrevia(total, nivel, cumple);
  }

  function pintarPrevia(total, nivel, cumple) {
    var especialidad = '';
    var sel = document.getElementById('especialidad');
    if (sel.value) especialidad = sel.options[sel.selectedIndex].textContent;

    var ubis = ubicacionesDelFormulario();
    var chips = [];
    if (valor('precio-min')) chips.push('<span class="chip">' + icono('i-moneda') + 'Desde $' + esc(valor('precio-min')) + '</span>');
    if (ubis.length && ubis[0].colonia) chips.push('<span class="chip">' + icono('i-pin') + esc(ubis[0].colonia) + '</span>');
    if (valor('anios')) chips.push('<span class="chip">' + icono('i-medalla') + esc(valor('anios')) + ' años de experiencia</span>');
    if (marcados('modalidad').indexOf('telemedicina') !== -1) chips.push('<span class="chip">' + icono('i-video') + 'Videoconsulta</span>');
    if (valor('disponibilidad') === 'inmediata') chips.push('<span class="chip">' + icono('i-reloj') + 'Puede atender hoy</span>');
    // El sello de la vista previa es el que el paciente ve HOY: o ya está
    // otorgado, o se otorgará al guardar porque hay número y documento.
    if ((perfil && perfil.cedula_verificada) || (cumple.cedula && cumple.cedula_archivo)) {
      chips.push('<span class="chip chip-ok">' + icono('i-check-circulo') + 'Cédula registrada</span>');
    }

    document.getElementById('previa').innerHTML =
      '<div>' +
        '<div class="previa-nombre">' + (esc(valor('nombre')) || '<span class="previa-vacio">Tu nombre</span>') + '</div>' +
        '<div class="previa-esp">' + (esc(especialidad) || 'Sin especialidad') +
          (ubis.length && ubis[0].colonia ? ' · ' + esc(ubis[0].colonia) : '') + '</div>' +
      '</div>' +
      (chips.length ? '<div class="chips">' + chips.join('') + '</div>'
                    : '<p class="previa-vacio">Conforme llenes tu perfil, aquí aparecen los datos que el paciente ve de un vistazo.</p>') +
      (valor('bio') ? '<p class="previa-bio">' + esc(valor('bio').slice(0, 160)) + (valor('bio').length > 160 ? '…' : '') + '</p>' : '') +
      '<p class="previa-vacio" style="margin-top:2px">Perfil ' + NIVELES[nivel].texto.toLowerCase() + ' · ' + total + '% completo</p>';
  }

  // ── Ubicaciones ──────────────────────────────────────────────────────
  function filaUbicacion(u, indice) {
    u = u || {};
    return '<div class="ubicacion" data-fila="' + indice + '">' +
      '<div class="ubicacion-cabeza">' +
        '<b>Lugar ' + (indice + 1) + '</b>' +
        '<button class="btn btn-texto btn-chico" type="button" data-quitar-ubicacion="' + indice + '" aria-label="Quitar este lugar">' +
          icono('i-basura') + '</button>' +
      '</div>' +
      '<div class="rejilla rejilla-2">' +
        '<div class="campo">' +
          '<label class="campo-etiqueta">Tipo</label>' +
          '<select class="selector" data-campo="tipo">' +
            '<option value="consultorio"' + (u.tipo === 'hospital' ? '' : ' selected') + '>Consultorio</option>' +
            '<option value="hospital"' + (u.tipo === 'hospital' ? ' selected' : '') + '>Hospital</option>' +
          '</select>' +
        '</div>' +
        '<div class="campo">' +
          '<label class="campo-etiqueta">Nombre del lugar</label>' +
          '<input class="entrada" data-campo="nombre" maxlength="160" value="' + esc(u.nombre) + '" placeholder="Consultorio Roma Norte">' +
        '</div>' +
      '</div>' +
      '<div class="campo">' +
        '<label class="campo-etiqueta">Dirección</label>' +
        '<input class="entrada" data-campo="direccion" maxlength="255" value="' + esc(u.direccion) + '" placeholder="Av. Álvaro Obregón 145, piso 4">' +
      '</div>' +
      '<div class="rejilla rejilla-2">' +
        '<div class="campo">' +
          '<label class="campo-etiqueta">Colonia</label>' +
          '<input class="entrada" data-campo="colonia" list="lista-zonas" maxlength="120" value="' + esc(u.colonia) + '" placeholder="Roma Norte">' +
        '</div>' +
        '<div class="campo">' +
          '<label class="campo-etiqueta">Código postal</label>' +
          '<input class="entrada" data-campo="cp" maxlength="5" inputmode="numeric" value="' + esc(u.cp) + '" placeholder="06700">' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function pintarUbicaciones(lista) {
    var cont = document.getElementById('ubicaciones');
    cont.innerHTML = (lista.length ? lista : [{}]).map(filaUbicacion).join('');
    document.getElementById('btn-agregar-ubicacion').disabled = cont.querySelectorAll('.ubicacion').length >= 3;
  }

  function ubicacionesDelFormulario() {
    return Array.prototype.map.call(document.querySelectorAll('#ubicaciones .ubicacion'), function (fila) {
      var dato = function (campo) {
        var el = fila.querySelector('[data-campo="' + campo + '"]');
        return el ? el.value.trim() : '';
      };
      return {
        tipo: dato('tipo'), nombre: dato('nombre'), direccion: dato('direccion'),
        colonia: dato('colonia'), cp: dato('cp')
      };
    }).filter(function (u) { return u.nombre !== '' || u.colonia !== '' || u.cp !== ''; });
  }

  document.getElementById('btn-agregar-ubicacion').addEventListener('click', function () {
    var actuales = ubicacionesDelFormulario();
    if (actuales.length >= 3) return;
    pintarUbicaciones(actuales.concat([{}]));
    pintarEstado();
  });

  document.getElementById('ubicaciones').addEventListener('click', function (ev) {
    var boton = ev.target.closest('[data-quitar-ubicacion]');
    if (!boton) return;
    var indice = Number(boton.dataset.quitarUbicacion);
    var lista = Array.prototype.map.call(document.querySelectorAll('#ubicaciones .ubicacion'), function (fila, i) {
      var dato = function (c) { var el = fila.querySelector('[data-campo="' + c + '"]'); return el ? el.value.trim() : ''; };
      return { indice: i, tipo: dato('tipo'), nombre: dato('nombre'), direccion: dato('direccion'), colonia: dato('colonia'), cp: dato('cp') };
    }).filter(function (u) { return u.indice !== indice; });
    pintarUbicaciones(lista);
    pintarEstado();
  });

  // ── Servicios de la especialidad elegida ─────────────────────────────
  function pintarServicios(seleccionados) {
    var espId = Number(document.getElementById('especialidad').value || 0);
    var lista = catalogo.servicios.filter(function (s) { return s.especialidad_id === espId; });
    var cont  = document.getElementById('servicios');

    cont.innerHTML = lista.map(function (s) {
      var marcado = seleccionados.indexOf(s.id) !== -1 ? ' checked' : '';
      return '<label class="servicio-opcion"><input type="checkbox" name="servicios" value="' + s.id + '"' + marcado + '>' +
        '<span>' + esc(s.nombre) + '</span></label>';
    }).join('');

    document.getElementById('servicios-ayuda').textContent = lista.length
      ? 'Quien busca justo ese servicio te ve arriba, no a media lista.'
      : 'Elige tu especialidad para ver los servicios.';
  }

  document.getElementById('especialidad').addEventListener('change', function () {
    pintarServicios([]);
    pintarEstado();
  });

  // ── Carga inicial ────────────────────────────────────────────────────
  async function iniciar() {
    var cat = await pedirJson(API + 'catalogos.php');
    if (cat && cat.ok) {
      catalogo = cat;
      var sel = document.getElementById('especialidad');
      cat.especialidades.forEach(function (e) {
        var op = document.createElement('option');
        op.value = e.id;
        op.textContent = e.nombre;
        sel.appendChild(op);
      });
      // El datalist de colonias reutiliza el catálogo de zonas.
      var dl = document.createElement('datalist');
      dl.id = 'lista-zonas';
      dl.innerHTML = cat.zonas.map(function (z) { return '<option value="' + esc(z.nombre) + '">'; }).join('');
      document.body.appendChild(dl);
    }

    var datos = await pedirJson(API + 'mi-perfil.php', { credentials: 'same-origin' });
    if (!datos.ok) {
      if (datos.estado === 401) { window.location.href = 'doctores.html'; return; }
      cargando.innerHTML = '<span>' + esc(datos.error || 'No pudimos cargar tu perfil.') + '</span>';
      return;
    }

    perfil   = datos.perfil;
    reglas   = datos.reglas;
    metricas = datos.metricas;

    llenarFormulario(perfil);
    pintarMetricas(datos.metricas, datos.demanda);

    cargando.classList.add('oculto');
    form.classList.remove('oculto');
    pintarEstado();
  }

  function llenarFormulario(p) {
    document.getElementById('chip-doctor').textContent = p.nombre || p.email;
    document.getElementById('nombre').value    = p.nombre || '';
    document.getElementById('telefono').value  = p.telefono || '';
    document.getElementById('cedula').value    = p.cedula || '';
    document.getElementById('anios').value     = p.anios_experiencia !== null ? p.anios_experiencia : '';
    document.getElementById('formacion').value = p.formacion || '';
    document.getElementById('certificaciones').value = p.certificaciones || '';
    document.getElementById('bio').value       = p.bio || '';
    document.getElementById('precio-min').value = p.precio_min !== null ? p.precio_min : '';
    document.getElementById('precio-max').value = p.precio_max !== null ? p.precio_max : '';
    document.getElementById('disponibilidad').value = p.disponibilidad || '';
    document.getElementById('especialidad').value = p.especialidad_id || '';

    if (p.genero) {
      var g = form.querySelector('input[name="genero"][value="' + p.genero + '"]');
      if (g) g.checked = true;
    }
    (p.modalidad ? p.modalidad.split(',') : []).forEach(function (m) {
      var el = form.querySelector('input[name="modalidad"][value="' + m + '"]');
      if (el) el.checked = true;
    });
    (p.idiomas ? p.idiomas.split(',') : []).forEach(function (i) {
      var el = form.querySelector('input[name="idiomas"][value="' + i.trim() + '"]');
      if (el) el.checked = true;
    });
    form.querySelector('input[name="atiende_ninos"]').checked   = !!p.atiende_ninos;
    form.querySelector('input[name="atiende_adultos"]').checked = !!p.atiende_adultos;

    if (p.cedula_archivo) {
      document.getElementById('cedula-estado').textContent = p.cedula_verificada
        ? 'Documento cargado · sello activo' : 'Documento cargado';
    }

    pintarUbicaciones(p.ubicaciones || []);
    pintarServicios(p.servicios || []);
    document.getElementById('bio-cuenta').textContent = String((p.bio || '').length);
  }

  function pintarMetricas(m, demanda) {
    document.getElementById('m-apariciones').textContent = m.apariciones_semana;
    document.getElementById('m-elecciones').textContent  = m.elecciones_semana;

    var nota = document.getElementById('demanda-nota');
    // Prueba social honesta: si no hubo demanda, no se dice nada.
    if (demanda && demanda.especialidad > 0) {
      nota.textContent = 'Esta semana hubo ' + demanda.especialidad + ' búsqueda' +
        (demanda.especialidad === 1 ? '' : 's') + ' de tu especialidad' +
        (demanda.zona > 0 && demanda.zona_nombre ? ', ' + demanda.zona + ' en ' + demanda.zona_nombre : '') + '.';
    } else if (m.apariciones_total === 0) {
      nota.textContent = 'Todavía no hay búsquedas que te hayan alcanzado. En cuanto las haya, aparecen aquí.';
    } else {
      nota.textContent = 'En total has aparecido ' + m.apariciones_total + ' veces y te han elegido ' + m.elecciones_total + '.';
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  var salirAlGuardar = false;

  document.getElementById('btn-guardar-salir').addEventListener('click', function () {
    salirAlGuardar = true;
    form.requestSubmit(document.getElementById('btn-guardar'));
  });

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();

    var boton   = document.getElementById('btn-guardar');
    var mensaje = document.getElementById('barra-mensaje');
    boton.disabled = true;
    mensaje.className = 'barra-mensaje';
    mensaje.textContent = 'Guardando…';

    var fd = new FormData();
    fd.append('nombre',            valor('nombre'));
    fd.append('telefono',          valor('telefono'));
    fd.append('cedula',            valor('cedula'));
    fd.append('especialidad_id',   valor('especialidad'));
    fd.append('anios_experiencia', valor('anios'));
    fd.append('formacion',         valor('formacion'));
    fd.append('certificaciones',   valor('certificaciones'));
    fd.append('bio',               valor('bio'));
    fd.append('precio_min',        valor('precio-min'));
    fd.append('precio_max',        valor('precio-max'));
    fd.append('disponibilidad',    valor('disponibilidad'));
    fd.append('genero',            marcados('genero')[0] || '');
    fd.append('modalidad',         marcados('modalidad').join(','));
    fd.append('idiomas',           marcados('idiomas').join(','));
    if (form.querySelector('input[name="atiende_ninos"]').checked)   fd.append('atiende_ninos', '1');
    if (form.querySelector('input[name="atiende_adultos"]').checked) fd.append('atiende_adultos', '1');
    fd.append('servicios',   JSON.stringify(marcados('servicios').map(Number)));
    fd.append('ubicaciones', JSON.stringify(ubicacionesDelFormulario()));

    var archivo = document.getElementById('cedula-archivo').files[0];
    if (archivo) fd.append('cedula_archivo', archivo);

    var datos = await pedirJson(API + 'guardar-doctor.php', {
      method: 'POST', body: fd, credentials: 'same-origin'
    });

    boton.disabled = false;

    if (!datos.ok) {
      salirAlGuardar = false;
      if (datos.estado === 401) { window.location.href = 'doctores.html'; return; }
      mensaje.className = 'barra-mensaje error';
      mensaje.textContent = datos.error || 'No pudimos guardar.';
      return;
    }

    if (salirAlGuardar) { window.location.href = 'buscar.html'; return; }

    // A partir de aquí manda el servidor, no el espejo local.
    reglas = datos.reglas;
    if (perfil) {
      perfil.cedula_archivo    = perfil.cedula_archivo || !!archivo;
      perfil.cedula_verificada = !!(datos.vista_paciente && datos.vista_paciente.cedula_verificada);
    }
    if (archivo) {
      document.getElementById('cedula-estado').textContent = 'Documento cargado';
      document.getElementById('cedula-archivo').value = '';
    }

    mensaje.className = 'barra-mensaje exito';
    mensaje.textContent = 'Guardado.';

    var festejo = document.getElementById('festejo');
    if (datos.ganados > 0) {
      festejo.innerHTML = '<span class="festejo">' + icono('i-check-circulo') +
        (datos.subio_nivel
          ? 'Subiste a nivel ' + esc(NIVELES[datos.nivel].texto) + ' · +' + datos.ganados + ' puntos'
          : '+' + datos.ganados + ' puntos de visibilidad') + '</span>';
      festejo.classList.remove('oculto');
    } else {
      festejo.classList.add('oculto');
    }

    pintarEstado();
  });

  // ── Reactividad del medidor y la vista previa ────────────────────────
  form.addEventListener('input', function (ev) {
    if (ev.target.id === 'bio') {
      document.getElementById('bio-cuenta').textContent = String(ev.target.value.length);
    }
    pintarEstado();
  });
  form.addEventListener('change', pintarEstado);

  document.getElementById('btn-salir').addEventListener('click', async function () {
    await pedirJson(API + 'logout-doctor.php', { method: 'POST', credentials: 'same-origin' });
    window.location.href = 'doctores.html';
  });

  iniciar();
})();

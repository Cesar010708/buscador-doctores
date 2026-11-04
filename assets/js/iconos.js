/**
 * Hoja de iconos compartida (RemixIcon dibujado a mano, hereda currentColor).
 * Se inserta de forma síncrona justo donde está la etiqueta <script>, así que
 * los <use> que vienen después ya la encuentran y no hay parpadeo. Sin build ni
 * peticiones extra: un solo archivo para las tres pantallas.
 */
(function () {
  'use strict';

  var SPRITE = '<svg class="oculto" aria-hidden="true"><defs>' +
    s('i-cruz',          '<path d="M12 5v14M5 12h14"/>', 2.2) +
    s('i-lupa',          '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>') +
    s('i-pin',           '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', 1.9) +
    s('i-moneda',        '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M14.5 9.3a2.6 2.6 0 0 0-2.5-1.5c-1.5 0-2.6.9-2.6 2.1 0 2.8 5.2 1.6 5.2 4.4 0 1.2-1.1 2.1-2.6 2.1a2.6 2.6 0 0 1-2.5-1.5"/>', 1.9) +
    s('i-estrella',      '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"/>', 1.8) +
    s('i-medalla',       '<circle cx="12" cy="9" r="5.2"/><path d="M8.6 13.6 7 21l5-2.6L17 21l-1.6-7.4"/>', 1.9) +
    s('i-reloj',         '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>', 1.9) +
    s('i-check',         '<path d="m4.5 12.5 4.6 4.6L19.5 6.8"/>', 2.2) +
    s('i-check-circulo', '<circle cx="12" cy="12" r="8.6"/><path d="m8.3 12.3 2.6 2.6 4.9-5"/>', 1.9) +
    s('i-info',          '<circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5M12 7.9v.1"/>', 1.9) +
    s('i-alerta',        '<path d="M12 4.2 21 20H3z"/><path d="M12 10v4M12 17v.1"/>', 1.9) +
    s('i-persona',       '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0"/>', 1.9) +
    s('i-video',         '<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="m15.5 13 5.5 3V8l-5.5 3z"/>', 1.9) +
    s('i-balanza',       '<path d="M12 4v16M6 20h12M6.5 7.5h11"/><path d="M6.5 7.5 3.5 14h6zM17.5 7.5l-3 6.5h6z"/>', 1.9) +
    s('i-flecha-der',    '<path d="M5 12h13M13 6l6 6-6 6"/>') +
    s('i-flecha-izq',    '<path d="M19 12H6M11 18l-6-6 6-6"/>') +
    s('i-cargando',      '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>', 2.2) +
    s('i-luna',          '<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.6 8.6 0 1 0 10.2 10.2z"/>', 1.9) +
    s('i-vacio',         '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21M8.5 11h5"/>', 1.8) +
    s('i-archivo',       '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V7a.5.5 0 0 0 .5.5H18"/>', 1.8) +
    s('i-subir',         '<path d="M12 16V4M8 8l4-4 4 4"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>', 1.9) +
    s('i-salir',         '<path d="M9.5 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h3.5"/><path d="M15 8.5 18.5 12 15 15.5M18 12H9"/>', 1.9) +
    s('i-ojo',           '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', 1.8) +
    s('i-basura',        '<path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5 7.4 20h9.2l.9-13.5"/>', 1.8) +
    s('i-escudo',        '<path d="M12 3.2 5 6v5.4c0 4.3 2.9 7.7 7 9.4 4.1-1.7 7-5.1 7-9.4V6z"/><path d="m9 11.8 2.2 2.2 4-4.2"/>', 1.8) +
    s('i-rayo',          '<path d="M13.2 3 5.5 13.4h5.6L10.4 21l7.7-10.4h-5.6z"/>', 1.8) +
    s('i-pulso',         '<path d="M3 12h3.5l2-5.5 3.5 11 2.5-6.5 1.5 3h5"/>', 1.9) +
    s('i-nino',          '<circle cx="12" cy="6.5" r="2.8"/><path d="M12 9.3v6M12 15.3 8.8 21M12 15.3 15.2 21M8 11.5h8"/>', 1.9) +
    s('i-portapapeles',  '<path d="M9 4.5H7.2A1.7 1.7 0 0 0 5.5 6.2v13.1A1.7 1.7 0 0 0 7.2 21h9.6a1.7 1.7 0 0 0 1.7-1.7V6.2A1.7 1.7 0 0 0 16.8 4.5H15"/><rect x="9" y="2.8" width="6" height="3.4" rx="1.2"/><path d="m9.4 13 2 2 3.4-3.6"/>', 1.8) +
    s('i-calendario',    '<rect x="3.5" y="5.5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/>', 1.8) +
    s('i-globos',        '<path d="M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h6.6a2.7 2.7 0 0 1 2.7 2.7v3a2.7 2.7 0 0 1-2.7 2.7H9l-3.5 2.6v-2.6a2.7 2.7 0 0 1-2-2.7z"/><path d="M18 9.5h.3a2.2 2.2 0 0 1 2.2 2.2v3a2.2 2.2 0 0 1-2.2 2.2v2.3L15 16.7h-2"/>', 1.8) +
    s('i-consultorio',   '<path d="M4 20V8.5l8-5 8 5V20"/><path d="M3 20h18"/><path d="M12 10.5v4M10 12.5h4"/>', 1.8) +
    s('i-hospital',      '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>', 1.8) +
    s('i-ajustes',       '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>', 1.9) +
    s('i-corazon',       '<path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5-7.5 9.6-7.5 9.6z"/>', 1.8) +
    s('i-lapiz',         '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14.5 5.5 4 4"/>', 1.9) +
    s('i-mira',          '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', 1.9) +
    s('i-grafica',       '<path d="M4 20h16"/><path d="M7 20v-6M12 20V7M17 20v-9"/>', 2) +
    s('i-telefono',      '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', 2) +
    '</defs></svg>';

  function s(id, cuerpo, grosor) {
    return '<symbol id="' + id + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (grosor || 2) + '" stroke-linecap="round" stroke-linejoin="round">' + cuerpo + '</symbol>';
  }

  // El sprite también se expone: dentro de un Shadow DOM, <use href="#i-…"> solo
  // resuelve símbolos del mismo árbol, así que el que monta el widget lo inserta
  // allí. En ese caso pide data-insertar="no": en la página anfitriona no existe
  // .oculto y el sprite caería al DOM claro como una caja vacía visible.
  window.BDIconos = SPRITE;

  var script = document.currentScript;
  if (script && script.getAttribute('data-insertar') !== 'no') {
    script.insertAdjacentHTML('afterend', SPRITE);
  }
})();

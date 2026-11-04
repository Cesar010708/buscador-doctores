/* ==========================================================================
   Avatares generados para los perfiles.
   --------------------------------------------------------------------------
   A propósito NO usamos fotos de personas: los perfiles de este prototipo son
   ficticios, y ponerle a un médico inventado la cara de alguien real es hacer
   pasar a esa persona por quien no es. Cuando haya médicos de verdad, cada uno
   sube su foto y esto queda como respaldo para quien no la tenga.

   El avatar es determinista: el mismo id siempre da el mismo color, así que el
   perfil se reconoce de una búsqueda a otra. Los cuatro tonos salen de la misma
   rampa azul validada de la hoja de estilo.
   ========================================================================== */
(function (global) {
  'use strict';

  // Cuatro pasos de la rampa de marca. Aquí el color es identidad decorativa,
  // no codifica ningún dato: por eso puede variar entre perfiles sin engañar.
  var TONOS = [
    { fondo: '#01587A', texto: '#ffffff' },
    { fondo: '#3D8CA8', texto: '#ffffff' },
    { fondo: '#5CB3C1', texto: '#06222c' },
    { fondo: '#7BB6CC', texto: '#06222c' }
  ];

  var TITULOS = ['dr', 'dra', 'lic', 'mtro', 'mtra', 'dr.', 'dra.', 'lic.'];

  /** Iniciales reales: se salta el título para no acabar con "DD" en todos. */
  function iniciales(nombre) {
    var partes = String(nombre || '')
      .trim()
      .split(/\s+/)
      .filter(function (p) { return TITULOS.indexOf(p.toLowerCase().replace('.', '')) === -1; });

    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
    return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
  }

  function tono(id) {
    var n = Math.abs(parseInt(id, 10) || 0);
    return TONOS[n % TONOS.length];
  }

  /**
   * SVG en línea, sin peticiones ni dependencias. `tamano` en píxeles.
   * El degradado suave es del mismo tono, no una segunda familia de color.
   */
  function avatarSVG(nombre, id, tamano) {
    var t = tono(id);
    var px = tamano || 44;
    var grad = 'g' + String(id).replace(/\W/g, '');

    return '<svg class="avatar" width="' + px + '" height="' + px + '" viewBox="0 0 44 44" ' +
      'role="img" aria-label="Avatar de ' + String(nombre || '').replace(/"/g, '') + '">' +
      '<defs><linearGradient id="' + grad + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="' + t.fondo + '"/>' +
        '<stop offset="100%" stop-color="' + t.fondo + '" stop-opacity=".78"/>' +
      '</linearGradient></defs>' +
      '<rect width="44" height="44" rx="13" fill="url(#' + grad + ')"/>' +
      '<text x="22" y="22" text-anchor="middle" dominant-baseline="central" ' +
        'font-family="BDPoppins, system-ui, sans-serif" font-size="16.5" font-weight="600" ' +
        'fill="' + t.texto + '">' + iniciales(nombre) + '</text>' +
      '</svg>';
  }

  global.BDAvatar = { svg: avatarSVG, iniciales: iniciales };
})(window);

/**
 * Tema claro / oscuro / del sistema.
 * El modo oscuro tiene sus propios valores en app.css (no es una inversión
 * automática), así que aquí solo se marca la preferencia en el <html>.
 */
(function () {
  'use strict';

  var CLAVE = 'bd-tema';
  var raiz  = document.documentElement;

  function leer() {
    try { return localStorage.getItem(CLAVE) || 'sistema'; }
    catch (e) { return 'sistema'; }
  }

  function aplicar(valor) {
    if (valor === 'claro' || valor === 'oscuro') {
      raiz.setAttribute('data-theme', valor === 'oscuro' ? 'dark' : 'light');
    } else {
      raiz.removeAttribute('data-theme');
    }
  }

  aplicar(leer());

  document.addEventListener('DOMContentLoaded', function () {
    var boton = document.getElementById('btn-tema');
    if (!boton) return;

    var orden = ['sistema', 'claro', 'oscuro'];
    var rotulo = { sistema: 'Tema: el del sistema', claro: 'Tema: claro', oscuro: 'Tema: oscuro' };

    function pintar() {
      boton.setAttribute('title', rotulo[leer()]);
      boton.setAttribute('aria-label', rotulo[leer()]);
    }
    pintar();

    boton.addEventListener('click', function () {
      var siguiente = orden[(orden.indexOf(leer()) + 1) % orden.length];
      try { localStorage.setItem(CLAVE, siguiente); } catch (e) { /* modo privado */ }
      aplicar(siguiente);
      pintar();
    });
  });
})();

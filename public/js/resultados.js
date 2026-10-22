/**
 * resultados.js
 * Muestra los resultados de la compilación en el modal:
 *  - Resumen: éxito o cantidad de errores por tipo
 *  - Errores: tabla con tipo, fila, columna, sentencia errónea y descripción
 *  - Análisis léxico: expresión léxica (tokens por línea) y tabla de tokens
 *  - Árbol sintáctico: diagrama interactivo
 *  - Tabla de símbolos
 *
 * @author Nathaly
 */

import { dibujarArbol, LEYENDA } from './arbol.js';

const $ = (id) => document.getElementById(id);

const CLASE_TIPO = { 'Léxico': 'lexico', 'Sintáctico': 'sintactico', 'Semántico': 'semantico' };

/**
 * Convierte caracteres especiales a entidades HTML.
 * El código del usuario puede contener < > " etc., y así nunca se
 * interpreta como HTML al insertarlo en la página.
 */
export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// ── Control del modal ─────────────────────────────────────

export function inicializarModal() {
  document.querySelectorAll('.pestana').forEach((pestana) =>
    pestana.addEventListener('click', () => activarPestana(pestana.dataset.panel))
  );
  $('cerrarModal').addEventListener('click', cerrarModal);
  // Clic fuera del contenido cierra el modal
  $('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModal();
  });
}

export function cerrarModal() {
  $('modal').classList.add('oculto');
}

function activarPestana(idPanel) {
  document.querySelectorAll('.pestana').forEach((p) =>
    p.classList.toggle('activa', p.dataset.panel === idPanel)
  );
  document.querySelectorAll('.panel').forEach((p) =>
    p.classList.toggle('activo', p.id === idPanel)
  );
}

/**
 * Llena todas las secciones del modal y lo muestra.
 * @param {object} datos      Respuesta de /api/compile
 * @param {Function} irALinea Callback (fila, columna) para saltar al editor
 */
export function mostrarResultados(datos, irALinea) {
  renderizarResumen(datos);
  renderizarErrores(datos.errores, irALinea);
  renderizarTokens(datos.tokens);
  renderizarArbol(datos.arbol);
  renderizarSimbolos(datos.tablaSimbolos);
  activarPestana('panelErrores');
  $('modal').classList.remove('oculto');
}

// ── Secciones ─────────────────────────────────────────────

function renderizarResumen(datos) {
  const conteo = { 'Léxico': 0, 'Sintáctico': 0, 'Semántico': 0 };
  datos.errores.forEach((e) => conteo[e.tipo]++);

  $('resumen').innerHTML = datos.exito
    ? `<h2>Resultado de la compilación <span class="insignia insignia-exito">EXITOSA</span></h2>
       <p>No se encontraron errores · ${datos.tokens.length} tokens · ${datos.tablaSimbolos.length} símbolos</p>`
    : `<h2>Resultado de la compilación <span class="insignia insignia-error">CON ERRORES</span></h2>
       <p>Se encontraron <strong>${datos.totalErrores}</strong> error(es):
          ${conteo['Léxico']} léxico(s) · ${conteo['Sintáctico']} sintáctico(s) · ${conteo['Semántico']} semántico(s)</p>`;

  const contador = $('contErrores');
  contador.textContent = datos.totalErrores;
  contador.classList.toggle('oculto', datos.exito);
}

function renderizarErrores(errores, irALinea) {
  const panel = $('panelErrores');

  if (errores.length === 0) {
    panel.innerHTML = `
      <div class="vacio">
        <strong>Compilación exitosa</strong>
        El código cumple con las reglas léxicas, sintácticas y semánticas de Mini-C.
      </div>`;
    return;
  }

  panel.innerHTML = `
    <p class="ayuda">Hacé clic en un error para ir a esa línea en el editor.</p>
    <table class="tabla">
      <thead>
        <tr><th>#</th><th>Tipo</th><th>Fila</th><th>Col</th><th>Sentencia errónea</th><th>Descripción</th></tr>
      </thead>
      <tbody>
        ${errores.map((e, i) => `
          <tr class="fila-clic" data-fila="${e.fila}" data-columna="${e.columna}">
            <td>${i + 1}</td>
            <td><span class="insignia insignia-${CLASE_TIPO[e.tipo]}">${e.tipo}</span></td>
            <td>${e.fila}</td>
            <td>${e.columna}</td>
            <td><code>${escapar(e.sentencia)}</code></td>
            <td>${escapar(e.descripcion)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  panel.querySelectorAll('.fila-clic').forEach((fila) =>
    fila.addEventListener('click', () =>
      irALinea(Number(fila.dataset.fila), Number(fila.dataset.columna))
    )
  );
}

function renderizarTokens(tokens) {
  // Agrupar tokens por línea para la expresión léxica
  const porLinea = new Map();
  tokens.forEach((t) => {
    if (!porLinea.has(t.fila)) porLinea.set(t.fila, []);
    porLinea.get(t.fila).push(t);
  });

  // Conteo por tipo de token
  const conteo = {};
  tokens.forEach((t) => (conteo[t.tipo] = (conteo[t.tipo] || 0) + 1));

  $('panelTokens').innerHTML = `
    <h3 class="subtitulo">Expresión léxica generada</h3>
    <div class="expresion-lexica">
      ${[...porLinea].map(([fila, lista]) => `
        <div class="linea-tokens">
          <span class="num-linea">${fila}</span>
          ${lista.map((t) => `<span class="tok tok-${t.tipo.toLowerCase()}">&lt;${t.tipo}, ${escapar(t.lexema)}&gt;</span>`).join('')}
        </div>`).join('') || '<span class="num-linea">Sin tokens</span>'}
    </div>

    <h3 class="subtitulo">Resumen (${tokens.length} tokens)</h3>
    <div class="chips">
      ${Object.entries(conteo).map(([tipo, n]) => `<span class="chip tok-${tipo.toLowerCase()}">${tipo}: ${n}</span>`).join('')}
    </div>

    <h3 class="subtitulo">Tabla de tokens</h3>
    <table class="tabla">
      <thead><tr><th>#</th><th>Lexema</th><th>Token</th><th>Fila</th><th>Columna</th></tr></thead>
      <tbody>
        ${tokens.map((t, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><code>${escapar(t.lexema)}</code></td>
            <td class="tok-${t.tipo.toLowerCase()}">${t.tipo}</td>
            <td>${t.fila}</td>
            <td>${t.columna}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderizarArbol(arbol) {
  const panel = $('panelArbol');

  panel.innerHTML = `
    <div class="arbol-herramientas">
      <button class="btn btn-chico" data-accion="alejar" title="Alejar">−</button>
      <button class="btn btn-chico" data-accion="acercar" title="Acercar">+</button>
      <button class="btn btn-chico" data-accion="expandir">Expandir todo</button>
      <button class="btn btn-chico" data-accion="colapsar">Colapsar todo</button>
      <span class="arbol-ayuda">Clic en un nodo para colapsarlo o expandirlo · pasá el mouse para ver su fila</span>
    </div>
    <div class="leyenda">
      ${LEYENDA.map(([clase, texto]) => `<span class="nodo nodo-${clase}">${texto}</span>`).join('')}
    </div>
    <div class="arbol-contenedor"><div class="arbol-lienzo" id="arbolLienzo"></div></div>`;

  const lienzo = $('arbolLienzo');
  dibujarArbol(arbol, lienzo);

  let zoom = 1;
  panel.querySelector('.arbol-herramientas').addEventListener('click', (e) => {
    const accion = e.target.dataset.accion;
    if (accion === 'acercar') zoom = Math.min(zoom + 0.1, 2);
    if (accion === 'alejar') zoom = Math.max(zoom - 0.1, 0.3);
    if (accion === 'expandir') {
      lienzo.querySelectorAll('li.colapsado').forEach((li) => li.classList.remove('colapsado'));
    }
    if (accion === 'colapsar') {
      // Colapsa todo menos la raíz, para que se sigan viendo las funciones
      lienzo.querySelectorAll('li li').forEach((li) => {
        if (li.querySelector(':scope > ul')) li.classList.add('colapsado');
      });
    }
    lienzo.style.zoom = zoom;
  });
}

function renderizarSimbolos(simbolos) {
  const panel = $('panelSimbolos');

  if (simbolos.length === 0) {
    panel.innerHTML = '<div class="vacio">No se declararon símbolos.</div>';
    return;
  }

  panel.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Nombre</th><th>Categoría</th><th>Tipo</th><th>Ámbito</th><th>Fila</th></tr></thead>
      <tbody>
        ${simbolos.map((s) => `
          <tr>
            <td><code>${escapar(s.nombre)}</code></td>
            <td>${escapar(s.categoria)}</td>
            <td>${escapar(s.tipo)}</td>
            <td>${escapar(s.ambito)}</td>
            <td>${s.fila}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
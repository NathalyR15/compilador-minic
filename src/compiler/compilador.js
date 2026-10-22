/**
 * compilador.js
 * Orquestador del compilador Mini-C.
 * Ejecuta las fases en orden y unifica sus resultados:
 *   1. Análisis léxico     (lexer.js)
 *   2. Análisis sintáctico (parser.js)
 *   3. Análisis semántico  (semantic.js) → Paso 5
 *
 * @author Nathaly
 */

const { analizarLexico } = require('./lexer');
const { analizarSintaxis, arbolATexto } = require('./parser');

/**
 * Compila un programa en Mini-C.
 * @param {string} codigo Código fuente
 */
function compilar(codigo) {
  const lineas = codigo.split(/\r?\n/);

  // Fase 1: léxico
  const lexico = analizarLexico(codigo);

  // Fase 2: sintáctico (se ejecuta aunque haya errores léxicos,
  // para reportar la mayor cantidad de errores posible)
  const sintactico = analizarSintaxis(lexico.tokens);

  // Unificar errores: agregar la sentencia (texto de la línea) y ordenar por posición
  const errores = [...lexico.errores, ...sintactico.errores]
    .map((e) => ({
      ...e,
      sentencia: (lineas[e.fila - 1] || '').trim() || e.sentencia
    }))
    .sort((a, b) => a.fila - b.fila || a.columna - b.columna);

  return {
    exito: errores.length === 0,
    totalErrores: errores.length,
    errores,
    tokens: lexico.tokens.filter((t) => t.tipo !== 'EOF'),
    arbol: sintactico.arbol,
    arbolTexto: arbolATexto(sintactico.arbol)
  };
}

module.exports = { compilar };
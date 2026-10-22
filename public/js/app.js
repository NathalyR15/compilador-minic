/**
 * app.js
 * Lógica del frontend: envía el código del editor al servidor
 * y muestra el resultado de la compilación.
 * (Versión temporal en texto; la interfaz final se hace en el Paso 6)
 *
 * @author Nathaly
 */

const editor = document.getElementById('editor');
const btnCompilar = document.getElementById('btnCompilar');
const salida = document.getElementById('salida');

btnCompilar.addEventListener('click', async () => {
  try {
    const respuesta = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: editor.value })
    });

    const datos = await respuesta.json();

    if (datos.error) {
      salida.textContent = datos.error;
      return;
    }

    let texto = datos.exito
      ? 'Compilación exitosa\n'
      : `Compilación con ${datos.totalErrores} error(es)\n`;

    // Tabla de errores
    datos.errores.forEach((e) => {
      texto += `\n[${e.tipo}] Fila ${e.fila}, Col ${e.columna}: ${e.descripcion}\n    → ${e.sentencia}\n`;
    });

    // Tabla de símbolos
    texto += '\n══════ TABLA DE SÍMBOLOS ══════\n';
    texto += 'Nombre'.padEnd(14) + 'Categoría'.padEnd(26) + 'Tipo'.padEnd(8) + 'Ámbito'.padEnd(28) + 'Fila\n';
    texto += datos.tablaSimbolos
      .map((s) =>
        s.nombre.padEnd(14) + s.categoria.padEnd(26) + String(s.tipo).padEnd(8) + s.ambito.padEnd(28) + s.fila
      )
      .join('\n') + '\n';

    // Árbol sintáctico
    texto += '\n══════ ÁRBOL SINTÁCTICO ══════\n' + datos.arbolTexto + '\n';

    // Tokens
    texto += `\n══════ TOKENS (${datos.tokens.length}) ══════\n`;
    texto += datos.tokens
      .map((t) => `${String(t.fila).padStart(3)}:${String(t.columna).padEnd(4)} ${t.tipo.padEnd(18)} ${t.lexema}`)
      .join('\n');

    salida.textContent = texto;
  } catch (error) {
    salida.textContent = 'Error al conectar con el servidor: ' + error.message;
  }
});
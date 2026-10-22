/**
 * app.js
 * Punto de entrada del frontend del Compilador Mini-C.
 *  - Inicializa el editor de código (CodeMirror) con números de línea.
 *  - Maneja las acciones de archivo: nuevo, abrir, guardar y ejemplos.
 *  - Envía el código al servidor para compilarlo y muestra los resultados.
 *
 * @author Nathaly
 */

import { abrirArchivo, guardarArchivo, tieneExtensionValida } from './archivos.js';
import { inicializarModal, mostrarResultados, cerrarModal } from './resultados.js';

const CODIGO_INICIAL = `// Bienvenida al Compilador Mini-C
// Escribí tu código aquí o abrí un archivo .mc

int main() {
  int x = 5;
  printf("El valor de x es: ", x);
  return 0;
}
`;

const $ = (id) => document.getElementById(id);

/** Estado del documento abierto en el editor */
const documento = {
  nombre: 'sin_titulo.mc',
  handle: null,     // referencia al archivo en disco (si el navegador lo permite)
  guardado: true
};

// ═══════════ Editor ═══════════

const editor = CodeMirror.fromTextArea($('editor'), {
  mode: 'text/x-csrc',      // resaltado de sintaxis estilo C
  theme: 'dracula',
  lineNumbers: true,
  matchBrackets: true,
  autoCloseBrackets: true,
  indentUnit: 2,
  tabSize: 2,
  extraKeys: {
    'Ctrl-S': () => guardar(false),
    'Shift-Ctrl-S': () => guardar(true),
    'Ctrl-O': () => abrir(),
    'Ctrl-Enter': () => compilar()
  }
});

editor.setValue(CODIGO_INICIAL);
editor.clearHistory();

editor.on('change', () => {
  documento.guardado = false;
  actualizarEncabezado();
});

editor.on('cursorActivity', () => {
  const cursor = editor.getCursor();
  $('posicionCursor').textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
});

// ═══════════ Marcas de error en el editor ═══════════

let marcasError = [];

function limpiarMarcas() {
  marcasError.forEach((linea) => editor.removeLineClass(linea, 'background', 'linea-error'));
  marcasError = [];
}

function marcarErrores(errores) {
  limpiarMarcas();
  const lineas = new Set(errores.map((e) => e.fila - 1));
  lineas.forEach((linea) => {
    if (linea >= 0 && linea < editor.lineCount()) {
      marcasError.push(editor.addLineClass(linea, 'background', 'linea-error'));
    }
  });
}

// ═══════════ Utilidades de interfaz ═══════════

function actualizarEncabezado() {
  $('nombreArchivo').textContent = documento.nombre;
  $('indicadorCambios').classList.toggle('oculto', documento.guardado);
  document.title = `${documento.guardado ? '' : '● '}${documento.nombre} · Compilador Mini-C`;
}

function mostrarEstado(mensaje, tipo = '') {
  const estado = $('estado');
  estado.textContent = mensaje;
  estado.className = tipo ? `estado-${tipo}` : '';
}

function confirmarDescarte() {
  return documento.guardado || confirm('Hay cambios sin guardar. ¿Deseás descartarlos?');
}

/** Carga un contenido en el editor como documento nuevo */
function cargarDocumento(nombre, contenido, handle = null) {
  editor.setValue(contenido);
  editor.clearHistory();
  limpiarMarcas();
  documento.nombre = nombre;
  documento.handle = handle;
  documento.guardado = true;
  actualizarEncabezado();
  editor.focus();
}

// ═══════════ Acciones de archivo ═══════════

function nuevo() {
  if (!confirmarDescarte()) return;
  cargarDocumento('sin_titulo.mc', '');
  mostrarEstado('Nuevo archivo creado');
}

async function abrir() {
  if (!confirmarDescarte()) return;

  const archivo = await abrirArchivo($('inputArchivo'));
  if (!archivo) return;

  if (!tieneExtensionValida(archivo.nombre)) {
    mostrarEstado(`"${archivo.nombre}" no es un archivo .mc`, 'error');
    return;
  }

  cargarDocumento(archivo.nombre, archivo.contenido, archivo.handle);
  mostrarEstado(`Archivo "${archivo.nombre}" abierto`, 'exito');
}

async function guardar(guardarComo = false) {
  const resultado = await guardarArchivo(documento.nombre, editor.getValue(), documento.handle, guardarComo);
  if (!resultado) return;

  documento.nombre = resultado.nombre;
  documento.handle = resultado.handle;
  documento.guardado = true;
  actualizarEncabezado();
  mostrarEstado(`Archivo "${resultado.nombre}" guardado`, 'exito');
}

async function cargarEjemplo(nombre) {
  if (!nombre || !confirmarDescarte()) return;

  try {
    const respuesta = await fetch(`/ejemplos/${encodeURIComponent(nombre)}`);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    cargarDocumento(nombre, await respuesta.text());
    mostrarEstado(`Ejemplo "${nombre}" cargado`);
  } catch (error) {
    mostrarEstado('No se pudo cargar el ejemplo: ' + error.message, 'error');
  }
}

// ═══════════ Compilación ═══════════

async function compilar() {
  const boton = $('btnCompilar');
  boton.disabled = true;
  $('textoCompilar').textContent = 'COMPILANDO…';

  try {
    const respuesta = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: editor.getValue() })
    });

    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || `HTTP ${respuesta.status}`);

    marcarErrores(datos.errores);
    mostrarResultados(datos, irALinea);
    mostrarEstado(
      datos.exito ? 'Compilación exitosa' : `Compilación con ${datos.totalErrores} error(es)`,
      datos.exito ? 'exito' : 'error'
    );
  } catch (error) {
    mostrarEstado('Error al compilar: ' + error.message, 'error');
  } finally {
    boton.disabled = false;
    $('textoCompilar').textContent = 'COMPILAR';
  }
}

/** Cierra el modal y lleva el cursor a la línea del error */
function irALinea(fila, columna) {
  cerrarModal();
  editor.focus();
  editor.setCursor({ line: fila - 1, ch: Math.max(columna - 1, 0) });
  editor.scrollIntoView(null, 120);
}

// ═══════════ Eventos ═══════════

$('btnNuevo').addEventListener('click', nuevo);
$('btnAbrir').addEventListener('click', abrir);
$('btnGuardar').addEventListener('click', () => guardar(false));
$('btnGuardarComo').addEventListener('click', () => guardar(true));
$('btnCompilar').addEventListener('click', compilar);

$('selectEjemplos').addEventListener('change', (e) => {
  cargarEjemplo(e.target.value);
  e.target.value = '';
});

// Atajos de teclado cuando el foco no está en el editor
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return;
  const tecla = e.key.toLowerCase();
  if (tecla === 's') { e.preventDefault(); guardar(e.shiftKey); }
  else if (tecla === 'o') { e.preventDefault(); abrir(); }
  else if (e.key === 'Enter') { e.preventDefault(); compilar(); }
});

// Avisar antes de cerrar la pestaña si hay cambios sin guardar
window.addEventListener('beforeunload', (e) => {
  if (!documento.guardado) {
    e.preventDefault();
    e.returnValue = '';
  }
});

inicializarModal();
actualizarEncabezado();
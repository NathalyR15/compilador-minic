/**
 * archivos.js
 * Manejo de archivos del lenguaje Mini-C (.mc): abrir y guardar.
 *
 * Usa la File System Access API cuando el navegador la soporta (Chrome/Edge),
 * lo que permite GUARDAR SOBRE EL MISMO ARCHIVO que se abrió.
 * Si no está disponible, usa el método clásico: <input type="file"> para
 * abrir y una descarga para guardar.
 *
 * @author Nathaly
 */

const EXTENSION = '.mc';

const soportaAccesoArchivos = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

const OPCIONES_SELECTOR = {
  types: [{ description: 'Programas Mini-C', accept: { 'text/plain': [EXTENSION] } }]
};

/** Verifica que el archivo tenga la extensión del lenguaje */
export function tieneExtensionValida(nombre) {
  return nombre.toLowerCase().endsWith(EXTENSION);
}

/**
 * Abre un archivo .mc.
 * @param {HTMLInputElement} input  Input de respaldo
 * @returns {Promise<{nombre, contenido, handle} | null>}  null si se canceló
 */
export async function abrirArchivo(input) {
  if (soportaAccesoArchivos) {
    try {
      const [handle] = await window.showOpenFilePicker({ ...OPCIONES_SELECTOR, multiple: false });
      const archivo = await handle.getFile();
      return { nombre: archivo.name, contenido: await archivo.text(), handle };
    } catch (error) {
      if (error.name === 'AbortError') return null; // el usuario canceló
      // Cualquier otro error (navegador embebido, permisos): se usa el método clásico
    }
  }
  return abrirConInput(input);
}

/** Método clásico: <input type="file"> oculto */
function abrirConInput(input) {
  return new Promise((resolve) => {
    input.value = '';
    input.onchange = async () => {
      const archivo = input.files[0];
      if (!archivo) return resolve(null);
      resolve({ nombre: archivo.name, contenido: await archivo.text(), handle: null });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Guarda el contenido.
 *  - Si hay handle (archivo abierto) y no es "guardar como": sobrescribe ese archivo.
 *  - Si no: pide al usuario dónde guardarlo, o lo descarga.
 * @returns {Promise<{nombre, handle} | null>}  null si se canceló
 */
export async function guardarArchivo(nombre, contenido, handle, guardarComo = false) {
  if (!tieneExtensionValida(nombre)) nombre += EXTENSION;

  if (soportaAccesoArchivos) {
    try {
      let destino = guardarComo ? null : handle;
      if (!destino) {
        destino = await window.showSaveFilePicker({ ...OPCIONES_SELECTOR, suggestedName: nombre });
      }
      const escritor = await destino.createWritable();
      await escritor.write(contenido);
      await escritor.close();
      return { nombre: destino.name, handle: destino };
    } catch (error) {
      if (error.name === 'AbortError') return null;
      // Si falla, se usa la descarga como respaldo
    }
  }

  descargar(nombre, contenido);
  return { nombre, handle: null };
}

/** Descarga el contenido como archivo de texto */
function descargar(nombre, contenido) {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
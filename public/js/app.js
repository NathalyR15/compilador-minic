/**
 * app.js
 * Lógica del frontend: envía el código del editor al servidor
 * y muestra la respuesta.
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
    salida.textContent = JSON.stringify(datos, null, 2);
  } catch (error) {
    salida.textContent = 'Error al conectar con el servidor: ' + error.message;
  }
});
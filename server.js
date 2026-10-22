/**
 * server.js
 * Servidor principal del Compilador Mini-C.
 * - Sirve el frontend (carpeta /public).
 * - Expone la API /api/compile que recibe código fuente y devuelve
 *   el resultado de la compilación (tokens, árbol y errores).
 *
 * @author Nathaly
 */

const express = require('express');
const path = require('path');
const { analizarLexico } = require('./src/compiler/lexer');

const app = express();
const PORT = 3000;

// Permite recibir JSON en el body de las peticiones (límite de 1 MB)
app.use(express.json({ limit: '1mb' }));

// Sirve los archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/compile
 * Body esperado: { "codigo": "int x = 5;" }
 * Fase actual: solo análisis léxico.
 * En los siguientes pasos se agregan el parser y el análisis semántico.
 */
app.post('/api/compile', (req, res) => {
  const { codigo } = req.body;

  if (typeof codigo !== 'string') {
    return res.status(400).json({ error: 'Se esperaba el campo "codigo" como texto.' });
  }

  // Fase 1: análisis léxico
  const { tokens, errores } = analizarLexico(codigo);

  res.json({
    exito: errores.length === 0,
    totalErrores: errores.length,
    errores,
    tokens
  });
});

app.listen(PORT, () => {
  console.log(`Compilador Mini-C corriendo en http://localhost:${PORT}`);
});
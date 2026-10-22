/**
 * lexer.js
 * Analizador Léxico del lenguaje Mini-C.
 *
 * Recorre el código fuente carácter por carácter y lo agrupa en tokens
 * según la definición léxica (docs/especificacion-minic.md, sección 1).
 * También detecta y registra errores léxicos sin detenerse, para poder
 * reportar todos los errores en una sola compilación.
 *
 * @author Nathaly
 */

// ─────────────────────────────────────────────────────────────
// Tablas del lenguaje
// ─────────────────────────────────────────────────────────────

/** Palabras reservadas y el tipo de token que generan */
const PALABRAS_RESERVADAS = {
  int: 'TIPO',
  float: 'TIPO',
  char: 'TIPO',
  void: 'TIPO',
  if: 'PALABRA_RESERVADA',
  else: 'PALABRA_RESERVADA',
  while: 'PALABRA_RESERVADA',
  for: 'PALABRA_RESERVADA',
  return: 'PALABRA_RESERVADA',
  printf: 'PALABRA_RESERVADA'
};

/** Operadores de dos caracteres (se revisan ANTES que los de uno) */
const OPERADORES_DOBLES = {
  '<=': 'OP_RELACIONAL',
  '>=': 'OP_RELACIONAL',
  '==': 'OP_RELACIONAL',
  '!=': 'OP_RELACIONAL',
  '&&': 'OP_LOGICO',
  '||': 'OP_LOGICO',
  '++': 'OP_INCREMENTO',
  '--': 'OP_INCREMENTO'
};

/** Operadores y delimitadores de un carácter */
const SIMBOLOS_SIMPLES = {
  '+': 'OP_ARITMETICO',
  '-': 'OP_ARITMETICO',
  '*': 'OP_ARITMETICO',
  '/': 'OP_ARITMETICO',
  '%': 'OP_ARITMETICO',
  '<': 'OP_RELACIONAL',
  '>': 'OP_RELACIONAL',
  '=': 'OP_ASIGNACION',
  '!': 'OP_LOGICO',
  '(': 'DELIMITADOR',
  ')': 'DELIMITADOR',
  '{': 'DELIMITADOR',
  '}': 'DELIMITADOR',
  ';': 'DELIMITADOR',
  ',': 'DELIMITADOR'
};

// ─────────────────────────────────────────────────────────────
// Funciones auxiliares de clasificación de caracteres
// ─────────────────────────────────────────────────────────────

const esLetra = (c) => c !== undefined && /[a-zA-Z_]/.test(c);
const esDigito = (c) => c !== undefined && /[0-9]/.test(c);
const esAlfanumerico = (c) => esLetra(c) || esDigito(c);
const esEspacio = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\n';

// ─────────────────────────────────────────────────────────────
// Clase Token
// ─────────────────────────────────────────────────────────────

class Token {
  /**
   * @param {string} tipo     Categoría del token (TIPO, IDENTIFICADOR, ...)
   * @param {string} lexema   Texto exacto encontrado en el código
   * @param {number} fila     Línea donde inicia (empieza en 1)
   * @param {number} columna  Columna donde inicia (empieza en 1)
   */
  constructor(tipo, lexema, fila, columna) {
    this.tipo = tipo;
    this.lexema = lexema;
    this.fila = fila;
    this.columna = columna;
  }
}

// ─────────────────────────────────────────────────────────────
// Clase Lexer
// ─────────────────────────────────────────────────────────────

class Lexer {
  /**
   * @param {string} codigo Código fuente en Mini-C
   */
  constructor(codigo) {
    this.codigo = codigo;
    this.pos = 0;       // índice del carácter actual
    this.fila = 1;      // línea actual
    this.columna = 1;   // columna actual
    this.tokens = [];
    this.errores = [];
  }

  // ── Navegación por el código ──────────────────────────────

  /** Carácter actual (undefined si ya se terminó el código) */
  actual() {
    return this.codigo[this.pos];
  }

  /** Mira n caracteres adelante sin avanzar (lookahead) */
  siguiente(n = 1) {
    return this.codigo[this.pos + n];
  }

  finDeArchivo() {
    return this.pos >= this.codigo.length;
  }

  /** Consume el carácter actual y actualiza fila/columna */
  avanzar() {
    const c = this.codigo[this.pos];
    this.pos++;
    if (c === '\n') {
      this.fila++;
      this.columna = 1;
    } else {
      this.columna++;
    }
    return c;
  }

  // ── Registro de resultados ────────────────────────────────

  agregarToken(tipo, lexema, fila, columna) {
    this.tokens.push(new Token(tipo, lexema, fila, columna));
  }

  agregarError(descripcion, lexema, fila, columna) {
    this.errores.push({
      tipo: 'Léxico',
      fila,
      columna,
      sentencia: lexema,
      descripcion
    });
  }

  // ── Ciclo principal ───────────────────────────────────────

  /**
   * Analiza todo el código y devuelve los tokens y errores encontrados.
   * @returns {{ tokens: Token[], errores: object[] }}
   */
  analizar() {
    while (!this.finDeArchivo()) {
      const c = this.actual();

      if (esEspacio(c)) {
        this.avanzar();
      } else if (c === '/' && this.siguiente() === '/') {
        this.saltarComentarioLinea();
      } else if (c === '/' && this.siguiente() === '*') {
        this.saltarComentarioBloque();
      } else if (esLetra(c)) {
        this.leerIdentificador();
      } else if (esDigito(c)) {
        this.leerNumero();
      } else if (c === '"') {
        this.leerCadena();
      } else if (c === "'") {
        this.leerCaracter();
      } else if (!this.leerSimbolo()) {
        // Ninguna regla reconoció el carácter
        const fila = this.fila;
        const columna = this.columna;
        this.avanzar();
        this.agregarError(`Carácter no reconocido '${c}'`, c, fila, columna);
      }
    }

    // Token especial que marca el final del código (lo usa el parser)
    this.agregarToken('EOF', 'EOF', this.fila, this.columna);

    return { tokens: this.tokens, errores: this.errores };
  }

  // ── Reglas léxicas ────────────────────────────────────────

  /** Comentario de línea: // ... hasta el salto de línea */
  saltarComentarioLinea() {
    while (!this.finDeArchivo() && this.actual() !== '\n') {
      this.avanzar();
    }
  }

  /** Comentario de bloque: / * ... * / (puede ocupar varias líneas) */
  saltarComentarioBloque() {
    const fila = this.fila;
    const columna = this.columna;
    this.avanzar(); // '/'
    this.avanzar(); // '*'

    while (!this.finDeArchivo()) {
      if (this.actual() === '*' && this.siguiente() === '/') {
        this.avanzar();
        this.avanzar();
        return;
      }
      this.avanzar();
    }

    this.agregarError('Comentario de bloque sin cerrar', '/*', fila, columna);
  }

  /** Identificador o palabra reservada: [a-zA-Z_][a-zA-Z0-9_]* */
  leerIdentificador() {
    const fila = this.fila;
    const columna = this.columna;
    let lexema = '';

    while (esAlfanumerico(this.actual())) {
      lexema += this.avanzar();
    }

    // Si está en la tabla es palabra reservada; si no, es identificador
    const tipo = PALABRAS_RESERVADAS[lexema] || 'IDENTIFICADOR';
    this.agregarToken(tipo, lexema, fila, columna);
  }

  /** Número entero [0-9]+ o real [0-9]+\.[0-9]+ */
  leerNumero() {
    const fila = this.fila;
    const columna = this.columna;
    let lexema = '';
    let esReal = false;

    while (esDigito(this.actual())) {
      lexema += this.avanzar();
    }

    // Parte decimal
    if (this.actual() === '.') {
      lexema += this.avanzar();
      if (!esDigito(this.actual())) {
        this.agregarError(`Número mal formado '${lexema}': falta la parte decimal`, lexema, fila, columna);
        return;
      }
      esReal = true;
      while (esDigito(this.actual())) {
        lexema += this.avanzar();
      }
    }

    // Un número no puede ir pegado a letras (ej. 12abc)
    if (esLetra(this.actual())) {
      while (esAlfanumerico(this.actual())) {
        lexema += this.avanzar();
      }
      this.agregarError(`Número mal formado '${lexema}'`, lexema, fila, columna);
      return;
    }

    this.agregarToken(esReal ? 'NUM_REAL' : 'NUM_ENTERO', lexema, fila, columna);
  }

  /** Cadena: "..." en una sola línea */
  leerCadena() {
    const fila = this.fila;
    const columna = this.columna;
    let lexema = this.avanzar(); // comilla de apertura

    while (!this.finDeArchivo() && this.actual() !== '"' && this.actual() !== '\n') {
      lexema += this.avanzar();
    }

    if (this.actual() === '"') {
      lexema += this.avanzar(); // comilla de cierre
      this.agregarToken('CADENA', lexema, fila, columna);
    } else {
      this.agregarError('Cadena sin cerrar', lexema, fila, columna);
    }
  }

  /** Carácter: 'x' (exactamente un carácter entre comillas simples) */
  leerCaracter() {
    const fila = this.fila;
    const columna = this.columna;
    let lexema = this.avanzar(); // comilla de apertura

    while (!this.finDeArchivo() && this.actual() !== "'" && this.actual() !== '\n') {
      lexema += this.avanzar();
    }

    if (this.actual() !== "'") {
      this.agregarError('Carácter sin cerrar', lexema, fila, columna);
      return;
    }

    lexema += this.avanzar(); // comilla de cierre

    // lexema = 'x' → longitud 3 (comilla + carácter + comilla)
    if (lexema.length !== 3) {
      this.agregarError(`Carácter mal formado ${lexema}: debe contener exactamente un carácter`, lexema, fila, columna);
      return;
    }

    this.agregarToken('CARACTER', lexema, fila, columna);
  }

  /**
   * Operadores y delimitadores.
   * Se prueban primero los de 2 caracteres (principio de la coincidencia
   * más larga): así "<=" se reconoce como un solo token y no como "<" y "=".
   * @returns {boolean} true si reconoció un símbolo
   */
  leerSimbolo() {
    const fila = this.fila;
    const columna = this.columna;
    const dos = this.actual() + (this.siguiente() ?? '');

    if (OPERADORES_DOBLES[dos]) {
      this.avanzar();
      this.avanzar();
      this.agregarToken(OPERADORES_DOBLES[dos], dos, fila, columna);
      return true;
    }

    const uno = this.actual();
    if (SIMBOLOS_SIMPLES[uno]) {
      this.avanzar();
      this.agregarToken(SIMBOLOS_SIMPLES[uno], uno, fila, columna);
      return true;
    }

    return false;
  }
}

/**
 * Función de conveniencia: analiza un código y devuelve tokens y errores.
 * @param {string} codigo
 */
function analizarLexico(codigo) {
  return new Lexer(codigo).analizar();
}

module.exports = { Lexer, Token, analizarLexico };
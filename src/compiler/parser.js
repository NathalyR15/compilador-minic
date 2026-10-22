/**
 * parser.js
 * Analizador Sintáctico del lenguaje Mini-C.
 *
 * Implementa un parser DESCENDENTE RECURSIVO: cada regla de la gramática
 * (docs/especificacion-minic.md, sección 2) tiene su propio método.
 * Recibe la lista de tokens del lexer, verifica que respeten la gramática
 * y construye el Árbol Sintáctico Abstracto (AST).
 *
 * Recuperación de errores:
 *  - Nivel de frase: si falta un ')' o un ';' al final de la línea,
 *    se registra el error y se continúa como si estuviera.
 *  - Modo pánico: en cualquier otro error, se descartan tokens hasta
 *    un punto seguro (';', '{', '}' o el inicio de una sentencia).
 * Así se pueden reportar varios errores en una sola compilación.
 *
 * @author Nathaly
 */

// ─────────────────────────────────────────────────────────────
// Estructuras
// ─────────────────────────────────────────────────────────────

/** Nodo del árbol sintáctico */
class Nodo {
  /**
   * @param {string} tipo    Tipo de nodo (Programa, Funcion, If, OperacionBinaria...)
   * @param {string|null} valor  Dato del nodo (nombre, operador, literal...)
   * @param {object|null} token  Token de donde se toma la fila y columna
   * @param {Nodo[]} hijos       Nodos hijos
   */
  constructor(tipo, valor = null, token = null, hijos = []) {
    this.tipo = tipo;
    this.valor = valor;
    this.fila = token ? token.fila : null;
    this.columna = token ? token.columna : null;
    this.hijos = hijos.filter((h) => h !== null && h !== undefined);
  }

  agregar(hijo) {
    if (hijo) this.hijos.push(hijo);
    return this;
  }
}

/** Error que se lanza cuando la secuencia de tokens no cumple la gramática */
class ErrorSintactico extends Error {
  constructor(mensaje, fila, columna) {
    super(mensaje);
    this.fila = fila;
    this.columna = columna;
  }
}

/** Lexemas con los que puede iniciar una sentencia (puntos de sincronización) */
const INICIO_SENTENCIA = new Set([
  'int', 'float', 'char', 'void', 'if', 'while', 'for', 'return', 'printf'
]);

// ─────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────

class Parser {
  /**
   * @param {object[]} tokens Tokens generados por el lexer (terminan en EOF)
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.errores = [];
  }

  // ── Navegación por los tokens ─────────────────────────────

  actual() {
    return this.tokens[this.pos];
  }

  anterior() {
    return this.tokens[this.pos - 1] || this.tokens[0];
  }

  /** Mira n tokens adelante sin consumir (lookahead) */
  verSiguiente(n = 1) {
    return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)];
  }

  finDeArchivo() {
    return this.actual().tipo === 'EOF';
  }

  /** Consume el token actual y lo devuelve */
  avanzar() {
    const token = this.actual();
    if (!this.finDeArchivo()) this.pos++;
    return token;
  }

  /** ¿El token actual tiene este lexema? */
  es(lexema) {
    const t = this.actual();
    return t.tipo !== 'EOF' && t.lexema === lexema;
  }

  /** ¿El token actual es de este tipo? */
  esTipo(tipo) {
    return this.actual().tipo === tipo;
  }

  /** Si el token actual es alguno de los lexemas, lo consume y lo devuelve */
  coincidir(...lexemas) {
    if (lexemas.some((l) => this.es(l))) return this.avanzar();
    return null;
  }

  // ── Manejo de errores ─────────────────────────────────────

  describir(token) {
    return token.tipo === 'EOF' ? 'el final del archivo' : `'${token.lexema}'`;
  }

  /**
   * Crea un error sintáctico con su ubicación.
   * Si el token actual está en una línea posterior al anterior, el error
   * se reporta al final de la línea anterior (ahí es donde falta algo).
   * @param {boolean} usarActual  Forzar la ubicación del token actual
   */
  error(mensaje, usarActual = false) {
    const act = this.actual();
    const ant = this.anterior();
    if (!usarActual && this.pos > 0 && act.fila > ant.fila) {
      return new ErrorSintactico(mensaje, ant.fila, ant.columna + ant.lexema.length);
    }
    return new ErrorSintactico(mensaje, act.fila, act.columna);
  }

  registrar(err) {
    this.errores.push({
      tipo: 'Sintáctico',
      fila: err.fila,
      columna: err.columna,
      sentencia: '',
      descripcion: err.message
    });
  }

  /**
   * Exige que el token actual sea `lexema` y lo consume.
   * Si no está:
   *  - Recuperación a nivel de frase (se registra y se continúa) para ')' ,
   *    para ';' cuando lo que sigue está en otra línea, y para '}' al final.
   *  - En los demás casos lanza el error (lo atrapa el modo pánico).
   */
  esperar(lexema, contexto = '') {
    if (this.es(lexema)) return this.avanzar();

    const act = this.actual();
    const ant = this.anterior();
    const mensaje = `Se esperaba '${lexema}'${contexto ? ' ' + contexto : ''} pero se encontró ${this.describir(act)}`;

    const insertable =
      lexema === ')' ||
      (lexema === ';' && (act.fila > ant.fila || act.lexema === '}' || act.tipo === 'EOF')) ||
      (lexema === '}' && act.tipo === 'EOF');

    if (insertable) {
      this.registrar(this.error(mensaje));
      return null;
    }
    throw this.error(mensaje);
  }

  /** Exige un token de cierto tipo (TIPO, IDENTIFICADOR...) */
  esperarTipo(tipo, descripcion) {
    if (this.esTipo(tipo)) return this.avanzar();
    throw this.error(`Se esperaba ${descripcion} pero se encontró ${this.describir(this.actual())}`);
  }

  /**
   * Modo pánico dentro de un bloque: descarta tokens hasta un punto seguro.
   * Consume el ';' (fin de la sentencia errónea); se detiene ANTES de
   * '{', '}' o del inicio de una nueva sentencia.
   */
  sincronizar() {
    while (!this.finDeArchivo()) {
      if (this.es(';')) {
        this.avanzar();
        return;
      }
      if (this.es('{') || this.es('}') || INICIO_SENTENCIA.has(this.actual().lexema)) {
        return;
      }
      this.avanzar();
    }
  }

  /** Modo pánico a nivel global: salta hasta el inicio de otra función (TIPO IDENT "(") */
  sincronizarFuncion() {
    while (!this.finDeArchivo()) {
      if (
        this.esTipo('TIPO') &&
        this.verSiguiente(1).tipo === 'IDENTIFICADOR' &&
        this.verSiguiente(2).lexema === '('
      ) {
        return;
      }
      this.avanzar();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Reglas de la gramática
  // ─────────────────────────────────────────────────────────

  /** programa → { funcion } EOF */
  programa() {
    const nodo = new Nodo('Programa', null, this.actual());

    while (!this.finDeArchivo()) {
      const inicio = this.pos;
      try {
        nodo.agregar(this.funcion());
      } catch (e) {
        if (!(e instanceof ErrorSintactico)) throw e;
        this.registrar(e);
        this.sincronizarFuncion();
        if (this.pos === inicio) this.avanzar(); // garantiza avanzar
      }
    }
    return nodo;
  }

  /** funcion → tipo IDENTIFICADOR "(" [ parametros ] ")" bloque */
  funcion() {
    const tipo = this.esperarTipo('TIPO', 'el tipo de retorno de una función (int, float, char o void)');
    const nombre = this.esperarTipo('IDENTIFICADOR', 'el nombre de la función');

    const nodo = new Nodo('Funcion', nombre.lexema, nombre);
    nodo.tipoDato = tipo.lexema;

    this.esperar('(', 'después del nombre de la función');
    nodo.agregar(this.parametros());
    this.esperar(')', 'para cerrar la lista de parámetros');
    nodo.agregar(this.bloque());
    return nodo;
  }

  /** parametros → parametro { "," parametro }   ;   parametro → tipo IDENTIFICADOR */
  parametros() {
    const nodo = new Nodo('Parametros', null, this.actual());
    if (this.es(')')) return nodo; // función sin parámetros

    do {
      const tipo = this.esperarTipo('TIPO', 'el tipo del parámetro');
      const nombre = this.esperarTipo('IDENTIFICADOR', 'el nombre del parámetro');
      const param = new Nodo('Parametro', nombre.lexema, nombre);
      param.tipoDato = tipo.lexema;
      nodo.agregar(param);
    } while (this.coincidir(','));

    return nodo;
  }

  /** bloque → "{" { sentencia } "}" */
  bloque() {
    const llave = this.esperar('{', 'para abrir el bloque');
    const nodo = new Nodo('Bloque', null, llave);

    while (!this.es('}') && !this.finDeArchivo()) {
      nodo.agregar(this.sentenciaSegura());
    }

    this.esperar('}', 'para cerrar el bloque');
    return nodo;
  }

  /**
   * Analiza una sentencia y, si hay error, aplica modo pánico.
   * Devuelve el nodo o null si la sentencia tenía errores.
   */
  sentenciaSegura() {
    const inicio = this.pos;
    try {
      return this.sentencia();
    } catch (e) {
      if (!(e instanceof ErrorSintactico)) throw e;
      this.registrar(e);
      this.sincronizar();
      // Si no se avanzó nada, se descarta un token para evitar un ciclo infinito
      if (this.pos === inicio && !this.es('}')) this.avanzar();
      return null;
    }
  }

  /**
   * sentencia → declaracion ";" | asignacion ";" | si | mientras
   *           | para | retorno | imprimir | bloque
   * Con UN solo token de lookahead se decide qué regla aplicar (LL(1)).
   */
  sentencia() {
    const t = this.actual();

    if (t.tipo === 'TIPO') {
      const nodo = this.declaracion();
      this.esperar(';', 'al final de la declaración');
      return nodo;
    }

    if (t.tipo === 'IDENTIFICADOR') {
      const nodo = this.asignacion();
      this.esperar(';', 'al final de la sentencia');
      return nodo;
    }

    switch (t.lexema) {
      case 'if': return this.si();
      case 'while': return this.mientras();
      case 'for': return this.para();
      case 'return': return this.retorno();
      case 'printf': return this.imprimir();
      case '{': return this.bloque();
      case 'else':
        throw this.error("'else' sin un 'if' correspondiente", true);
      default:
        throw this.error(`Sentencia no válida: no se esperaba ${this.describir(t)}`, true);
    }
  }

  /** declaracion → tipo declarador { "," declarador }   ;   declarador → IDENTIFICADOR [ "=" expresion ] */
  declaracion() {
    const tipo = this.esperarTipo('TIPO', 'un tipo de dato');
    const nodo = new Nodo('Declaracion', null, tipo);
    nodo.tipoDato = tipo.lexema;

    do {
      const id = this.esperarTipo('IDENTIFICADOR', 'el nombre de la variable');
      const variable = new Nodo('Variable', id.lexema, id);
      if (this.coincidir('=')) {
        variable.agregar(this.expresion());
      }
      nodo.agregar(variable);
    } while (this.coincidir(','));

    return nodo;
  }

  /** asignacion → IDENTIFICADOR ( "=" expresion | "++" | "--" | "(" [ argumentos ] ")" ) */
  asignacion() {
    const id = this.esperarTipo('IDENTIFICADOR', 'un identificador');
    const identificador = new Nodo('Identificador', id.lexema, id);
    const op = this.actual();

    if (this.coincidir('=')) {
      return new Nodo('Asignacion', '=', op, [identificador, this.expresion()]);
    }

    if (this.coincidir('++', '--')) {
      return new Nodo('Incremento', op.lexema, op, [identificador]);
    }

    if (this.coincidir('(')) {
      const nodo = new Nodo('Llamada', id.lexema, id, this.argumentosOpcionales());
      this.esperar(')', 'para cerrar la llamada a la función');
      return nodo;
    }

    throw this.error(`Se esperaba '=', '++', '--' o '(' después de '${id.lexema}' pero se encontró ${this.describir(op)}`);
  }

  /** si → "if" "(" expresion ")" sentencia [ "else" sentencia ] */
  si() {
    const tok = this.avanzar(); // 'if'
    this.esperar('(', "después de 'if'");
    const condicion = this.expresion();
    this.esperar(')', "para cerrar la condición del 'if'");
    const entonces = this.sentenciaSegura();

    const nodo = new Nodo('If', null, tok, [new Nodo('Condicion', null, tok, [condicion]), entonces]);

    // El else se asocia al if más cercano (resuelve el "dangling else")
    if (this.es('else')) {
      const tokElse = this.avanzar();
      nodo.agregar(new Nodo('Else', null, tokElse, [this.sentenciaSegura()]));
    }
    return nodo;
  }

  /** mientras → "while" "(" expresion ")" sentencia */
  mientras() {
    const tok = this.avanzar(); // 'while'
    this.esperar('(', "después de 'while'");
    const condicion = this.expresion();
    this.esperar(')', "para cerrar la condición del 'while'");
    const cuerpo = this.sentenciaSegura();

    return new Nodo('While', null, tok, [new Nodo('Condicion', null, tok, [condicion]), cuerpo]);
  }

  /** para → "for" "(" [ declaracion | asignacion ] ";" [ expresion ] ";" [ asignacion ] ")" sentencia */
  para() {
    const tok = this.avanzar(); // 'for'
    this.esperar('(', "después de 'for'");

    const inicializacion = new Nodo('Inicializacion', null, tok);
    if (this.esTipo('TIPO')) inicializacion.agregar(this.declaracion());
    else if (this.esTipo('IDENTIFICADOR')) inicializacion.agregar(this.asignacion());
    this.esperar(';', "después de la inicialización del 'for'");

    const condicion = new Nodo('Condicion', null, tok);
    if (!this.es(';')) condicion.agregar(this.expresion());
    this.esperar(';', "después de la condición del 'for'");

    const actualizacion = new Nodo('Actualizacion', null, tok);
    if (!this.es(')')) actualizacion.agregar(this.asignacion());
    this.esperar(')', "para cerrar el encabezado del 'for'");

    const cuerpo = this.sentenciaSegura();
    return new Nodo('For', null, tok, [inicializacion, condicion, actualizacion, cuerpo]);
  }

  /** retorno → "return" [ expresion ] ";" */
  retorno() {
    const tok = this.avanzar(); // 'return'
    const nodo = new Nodo('Return', null, tok);
    if (!this.es(';')) nodo.agregar(this.expresion());
    this.esperar(';', "después de 'return'");
    return nodo;
  }

  /** imprimir → "printf" "(" argumentos ")" ";" */
  imprimir() {
    const tok = this.avanzar(); // 'printf'
    this.esperar('(', "después de 'printf'");
    const nodo = new Nodo('Printf', null, tok, this.argumentos());
    this.esperar(')', "para cerrar 'printf'");
    this.esperar(';', "al final de 'printf'");
    return nodo;
  }

  /** argumentos → expresion { "," expresion } */
  argumentos() {
    const lista = [this.expresion()];
    while (this.coincidir(',')) {
      lista.push(this.expresion());
    }
    return lista;
  }

  argumentosOpcionales() {
    return this.es(')') ? [] : this.argumentos();
  }

  // ── Expresiones (un nivel por cada nivel de precedencia) ──

  /**
   * Patrón común de los niveles binarios:  nivel → siguiente { op siguiente }
   * El ciclo construye el árbol hacia la izquierda, así que los operadores
   * del mismo nivel son asociativos por la izquierda: 10 - 4 - 2 = (10 - 4) - 2
   */
  binaria(siguienteNivel, operadores) {
    let izquierda = siguienteNivel();
    while (operadores.some((op) => this.es(op))) {
      const op = this.avanzar();
      const derecha = siguienteNivel();
      izquierda = new Nodo('OperacionBinaria', op.lexema, op, [izquierda, derecha]);
    }
    return izquierda;
  }

  /** expresion → logico_o */
  expresion() {
    return this.logicoO();
  }

  /** logico_o → logico_y { "||" logico_y } */
  logicoO() {
    return this.binaria(() => this.logicoY(), ['||']);
  }

  /** logico_y → igualdad { "&&" igualdad } */
  logicoY() {
    return this.binaria(() => this.igualdad(), ['&&']);
  }

  /** igualdad → relacional { ( "==" | "!=" ) relacional } */
  igualdad() {
    return this.binaria(() => this.relacional(), ['==', '!=']);
  }

  /** relacional → aditiva { ( "<" | ">" | "<=" | ">=" ) aditiva } */
  relacional() {
    return this.binaria(() => this.aditiva(), ['<', '>', '<=', '>=']);
  }

  /** aditiva → termino { ( "+" | "-" ) termino } */
  aditiva() {
    return this.binaria(() => this.termino(), ['+', '-']);
  }

  /** termino → unario { ( "*" | "/" | "%" ) unario } */
  termino() {
    return this.binaria(() => this.unario(), ['*', '/', '%']);
  }

  /** unario → ( "!" | "-" ) unario | primario */
  unario() {
    if (this.es('!') || this.es('-')) {
      const op = this.avanzar();
      return new Nodo('OperacionUnaria', op.lexema, op, [this.unario()]);
    }
    return this.primario();
  }

  /**
   * primario → NUM_ENTERO | NUM_REAL | CARACTER | CADENA
   *          | IDENTIFICADOR [ "(" [ argumentos ] ")" ]
   *          | "(" expresion ")"
   */
  primario() {
    const t = this.actual();

    switch (t.tipo) {
      case 'NUM_ENTERO':
        this.avanzar();
        return new Nodo('Entero', t.lexema, t);
      case 'NUM_REAL':
        this.avanzar();
        return new Nodo('Real', t.lexema, t);
      case 'CARACTER':
        this.avanzar();
        return new Nodo('Caracter', t.lexema, t);
      case 'CADENA':
        this.avanzar();
        return new Nodo('Cadena', t.lexema, t);
      case 'IDENTIFICADOR': {
        this.avanzar();
        if (this.coincidir('(')) {
          const nodo = new Nodo('Llamada', t.lexema, t, this.argumentosOpcionales());
          this.esperar(')', 'para cerrar la llamada a la función');
          return nodo;
        }
        return new Nodo('Identificador', t.lexema, t);
      }
    }

    if (this.coincidir('(')) {
      const expr = this.expresion();
      this.esperar(')', 'para cerrar la expresión entre paréntesis');
      return expr;
    }

    throw this.error(`Se esperaba una expresión pero se encontró ${this.describir(t)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Utilidades para mostrar el árbol
// ─────────────────────────────────────────────────────────────

/** Agrega a cada nodo una etiqueta legible, ej. "Funcion (int): main" */
function asignarEtiquetas(nodo) {
  let etiqueta = nodo.tipo;
  if (nodo.tipoDato) etiqueta += ` (${nodo.tipoDato})`;
  if (nodo.valor !== null) etiqueta += `: ${nodo.valor}`;
  nodo.etiqueta = etiqueta;
  nodo.hijos.forEach(asignarEtiquetas);
}

/** Convierte el árbol a texto con ramas (├── └──) */
function arbolATexto(nodo, prefijo = '', esUltimo = true, esRaiz = true) {
  const linea = esRaiz ? nodo.etiqueta : prefijo + (esUltimo ? '└── ' : '├── ') + nodo.etiqueta;
  const prefijoHijos = esRaiz ? '' : prefijo + (esUltimo ? '    ' : '│   ');
  const hijos = nodo.hijos.map((h, i) =>
    arbolATexto(h, prefijoHijos, i === nodo.hijos.length - 1, false)
  );
  return [linea, ...hijos].join('\n');
}

/**
 * Función principal del módulo.
 * @param {object[]} tokens
 * @returns {{ arbol: Nodo, errores: object[] }}
 */
function analizarSintaxis(tokens) {
  const parser = new Parser(tokens);
  const arbol = parser.programa();
  asignarEtiquetas(arbol);
  return { arbol, errores: parser.errores };
}

module.exports = { Parser, Nodo, analizarSintaxis, arbolATexto };
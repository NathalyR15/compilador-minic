/**
 * semantic.js
 * Analizador Semántico del lenguaje Mini-C.
 *
 * Recorre el Árbol Sintáctico (AST) generado por el parser y verifica las
 * reglas semánticas S1–S9 (docs/especificacion-minic.md, sección 3):
 *   S1 variable declarada antes de usarse
 *   S2 sin redeclaraciones en el mismo ámbito
 *   S3 compatibilidad de tipos (asignaciones, argumentos, return)
 *   S4 el operador % solo con enteros
 *   S5 funciones existentes y con el número correcto de argumentos
 *   S6 sin funciones redefinidas
 *   S7 return coherente con el tipo de la función
 *   S8 debe existir main
 *   S9 sin variables ni parámetros de tipo void
 *
 * Usa una TABLA DE SÍMBOLOS con una PILA DE ÁMBITOS: cada función y cada
 * bloque { } abre un ámbito nuevo que se elimina al cerrarse.
 *
 * El tipo de cada expresión se calcula de abajo hacia arriba (de las hojas
 * a la raíz). Si una subexpresión ya tuvo error, su tipo es null y no se
 * reportan errores en cascada.
 *
 * @author Nathaly
 */

const NUMERICOS = new Set(['int', 'float', 'char']);
const OP_ARITMETICOS = new Set(['+', '-', '*', '/']);

class AnalizadorSemantico {
  constructor() {
    this.errores = [];
    this.ambitos = [];             // pila: { nombre, simbolos: Map }
    this.funciones = new Map();    // nombre → { tipo, parametros: [tipos] }
    this.tablaSimbolos = [];       // registro de todo lo declarado (para mostrarlo)
    this.funcionActual = null;     // función que se está analizando
  }

  // ─────────────────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────────────────

  error(descripcion, nodo) {
    this.errores.push({
      tipo: 'Semántico',
      fila: nodo?.fila ?? 1,
      columna: nodo?.columna ?? 1,
      sentencia: '',
      descripcion
    });
  }

  /** Texto legible de un tipo para los mensajes */
  describirTipo(tipo) {
    if (tipo === 'cadena') return 'una cadena de texto';
    if (tipo === 'void') return 'el resultado de una función void';
    return `un valor ${tipo}`;
  }

  /**
   * ¿Se puede guardar un valor de tipo `origen` en un destino de tipo `destino`?
   *  - Mismo tipo: sí
   *  - int/char → float: sí (promoción, no se pierde información)
   *  - int ↔ char: sí (como en C, un char es un número pequeño)
   *  - float → int/char: NO (se perdería la parte decimal)
   *  - cadena o void → cualquier variable: NO
   */
  esCompatible(destino, origen) {
    if (destino === origen) return true;
    if (destino === 'float' && (origen === 'int' || origen === 'char')) return true;
    if ((destino === 'int' && origen === 'char') || (destino === 'char' && origen === 'int')) return true;
    return false;
  }

  /** S3: verifica una asignación o inicialización */
  verificarAsignacion(destino, origen, nodo, nombre) {
    if (origen === null || destino === 'void') return; // ya se reportó un error antes
    if (!this.esCompatible(destino, origen)) {
      const detalle = origen === 'float' ? ' (se perdería la parte decimal)' : '';
      this.error(
        `Tipos incompatibles: no se puede asignar ${this.describirTipo(origen)} a '${nombre}' de tipo ${destino}${detalle}`,
        nodo
      );
    }
  }

  /** S1: error de identificador no declarado */
  errorNoDeclarada(nodo) {
    if (this.funciones.has(nodo.valor)) {
      this.error(`'${nodo.valor}' es una función; para usarla se debe llamar con paréntesis`, nodo);
    } else {
      this.error(`La variable '${nodo.valor}' no ha sido declarada`, nodo);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Tabla de símbolos y ámbitos
  // ─────────────────────────────────────────────────────────

  abrirAmbito(nombre) {
    this.ambitos.push({ nombre, simbolos: new Map() });
  }

  cerrarAmbito() {
    this.ambitos.pop();
  }

  ambitoActual() {
    return this.ambitos[this.ambitos.length - 1];
  }

  /** Nombre del ámbito actual, ej. "main › bloque (L12)" */
  nombreAmbito() {
    const nombres = this.ambitos.slice(1).map((a) => a.nombre);
    return nombres.length ? nombres.join(' › ') : 'global';
  }

  /** Declara una variable o parámetro en el ámbito actual (verifica S2) */
  declararVariable(nombre, tipo, nodo, categoria = 'variable') {
    const ambito = this.ambitoActual();

    if (ambito.simbolos.has(nombre)) {
      this.error(`'${nombre}' ya fue declarada en este ámbito`, nodo); // S2
      return;
    }

    ambito.simbolos.set(nombre, { tipo, fila: nodo.fila });
    this.tablaSimbolos.push({
      nombre,
      categoria,
      tipo,
      ambito: this.nombreAmbito(),
      fila: nodo.fila
    });
  }

  /** Busca una variable desde el ámbito más interno hacia afuera */
  buscarVariable(nombre) {
    for (let i = this.ambitos.length - 1; i >= 0; i--) {
      const simbolo = this.ambitos[i].simbolos.get(nombre);
      if (simbolo) return simbolo;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // Programa y funciones
  // ─────────────────────────────────────────────────────────

  analizarPrograma(arbol) {
    this.abrirAmbito('global');
    arbol.hijos.forEach((funcion) => this.analizarFuncion(funcion));

    if (!this.funciones.has('main')) {
      this.error("El programa debe tener una función 'main'", { fila: 1, columna: 1 }); // S8
    }
    this.cerrarAmbito();
  }

  analizarFuncion(nodo) {
    const nombre = nodo.valor;
    const [nodoParametros, cuerpo] = nodo.hijos;
    const parametros = nodoParametros ? nodoParametros.hijos : [];
    const tiposParametros = parametros.map((p) => p.tipoDato);

    // S6: función redefinida. Se registra ANTES de analizar el cuerpo
    // para permitir recursión (ej. factorial que se llama a sí misma)
    if (this.funciones.has(nombre)) {
      this.error(`La función '${nombre}' ya fue definida`, nodo);
    } else {
      this.funciones.set(nombre, { tipo: nodo.tipoDato, parametros: tiposParametros });
      this.tablaSimbolos.push({
        nombre,
        categoria: `función (${tiposParametros.join(', ')})`,
        tipo: nodo.tipoDato,
        ambito: 'global',
        fila: nodo.fila
      });
    }

    this.funcionActual = { nombre, tipo: nodo.tipoDato, tieneReturn: false };

    // Los parámetros y las variables del cuerpo comparten el mismo ámbito
    this.abrirAmbito(nombre);
    parametros.forEach((p) => {
      if (p.tipoDato === 'void') {
        this.error(`El parámetro '${p.valor}' no puede ser de tipo void`, p); // S9
      }
      this.declararVariable(p.valor, p.tipoDato, p, 'parámetro');
    });
    if (cuerpo) cuerpo.hijos.forEach((s) => this.analizarSentencia(s));
    this.cerrarAmbito();

    // S7: una función no-void debe tener al menos un return
    if (nodo.tipoDato !== 'void' && !this.funcionActual.tieneReturn) {
      this.error(`La función '${nombre}' debe retornar un valor de tipo ${nodo.tipoDato}`, nodo);
    }
    this.funcionActual = null;
  }

  // ─────────────────────────────────────────────────────────
  // Sentencias
  // ─────────────────────────────────────────────────────────

  analizarSentencia(nodo) {
    if (!nodo) return;

    switch (nodo.tipo) {
      case 'Declaracion': return this.analizarDeclaracion(nodo);
      case 'Asignacion': return this.analizarAsignacion(nodo);
      case 'Incremento': return this.analizarIncremento(nodo);
      case 'Llamada': this.tipoExpresion(nodo); return;
      case 'If': return this.analizarIf(nodo);
      case 'While': return this.analizarWhile(nodo);
      case 'For': return this.analizarFor(nodo);
      case 'Return': return this.analizarReturn(nodo);
      case 'Printf': return this.analizarPrintf(nodo);
      case 'Bloque': return this.analizarBloque(nodo);
    }
  }

  analizarBloque(nodo) {
    this.abrirAmbito(`bloque (L${nodo.fila})`);
    nodo.hijos.forEach((s) => this.analizarSentencia(s));
    this.cerrarAmbito();
  }

  analizarDeclaracion(nodo) {
    const tipo = nodo.tipoDato;

    if (tipo === 'void') {
      this.error('No se pueden declarar variables de tipo void', nodo); // S9
    }

    nodo.hijos.forEach((variable) => {
      const inicializacion = variable.hijos[0];
      if (inicializacion) {
        // Primero se analiza el valor y DESPUÉS se declara la variable:
        // así "int x = x;" detecta que x aún no existe
        const tipoValor = this.tipoExpresion(inicializacion);
        this.verificarAsignacion(tipo, tipoValor, variable, variable.valor);
      }
      this.declararVariable(variable.valor, tipo, variable);
    });
  }

  analizarAsignacion(nodo) {
    const [id, expresion] = nodo.hijos;
    const variable = this.buscarVariable(id.valor);
    const tipoValor = this.tipoExpresion(expresion);

    if (!variable) {
      this.errorNoDeclarada(id); // S1
      return;
    }
    this.verificarAsignacion(variable.tipo, tipoValor, id, id.valor); // S3
  }

  analizarIncremento(nodo) {
    const id = nodo.hijos[0];
    if (!this.buscarVariable(id.valor)) {
      this.errorNoDeclarada(id); // S1
    }
  }

  /** La condición de if/while/for debe ser numérica (en C, 0 = falso y lo demás = verdadero) */
  analizarCondicion(nodoCondicion, estructura) {
    const expresion = nodoCondicion?.hijos[0];
    if (!expresion) return;

    const tipo = this.tipoExpresion(expresion);
    if (tipo !== null && !NUMERICOS.has(tipo)) {
      this.error(`La condición del '${estructura}' debe ser numérica, no ${this.describirTipo(tipo)}`, expresion);
    }
  }

  analizarIf(nodo) {
    const [condicion, ...resto] = nodo.hijos;
    this.analizarCondicion(condicion, 'if');

    resto.forEach((hijo) => {
      if (hijo.tipo === 'Else') hijo.hijos.forEach((s) => this.analizarSentencia(s));
      else this.analizarSentencia(hijo);
    });
  }

  analizarWhile(nodo) {
    const [condicion, cuerpo] = nodo.hijos;
    this.analizarCondicion(condicion, 'while');
    this.analizarSentencia(cuerpo);
  }

  analizarFor(nodo) {
    // El for tiene su propio ámbito: una variable declarada en la
    // inicialización (for (int i = 0; ...)) solo existe dentro del for
    this.abrirAmbito(`for (L${nodo.fila})`);

    const [inicializacion, condicion, actualizacion, cuerpo] = nodo.hijos;
    inicializacion.hijos.forEach((s) => this.analizarSentencia(s));
    this.analizarCondicion(condicion, 'for');
    actualizacion.hijos.forEach((s) => this.analizarSentencia(s));
    this.analizarSentencia(cuerpo);

    this.cerrarAmbito();
  }

  /** S7: el return debe ser coherente con el tipo de la función */
  analizarReturn(nodo) {
    const funcion = this.funcionActual;
    if (!funcion) return;

    funcion.tieneReturn = true;
    const expresion = nodo.hijos[0];

    if (funcion.tipo === 'void') {
      if (expresion) this.error(`La función void '${funcion.nombre}' no puede retornar un valor`, nodo);
      return;
    }

    if (!expresion) {
      this.error(`La función '${funcion.nombre}' debe retornar un valor de tipo ${funcion.tipo}`, nodo);
      return;
    }

    const tipo = this.tipoExpresion(expresion);
    if (tipo !== null && !this.esCompatible(funcion.tipo, tipo)) {
      this.error(
        `La función '${funcion.nombre}' debe retornar ${funcion.tipo} pero se retorna ${this.describirTipo(tipo)}`,
        nodo
      );
    }
  }

  analizarPrintf(nodo) {
    nodo.hijos.forEach((argumento) => {
      if (this.tipoExpresion(argumento) === 'void') {
        this.error('No se puede imprimir el resultado de una función void', argumento);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // Expresiones: calculan y devuelven su tipo (o null si hubo error)
  // ─────────────────────────────────────────────────────────

  tipoExpresion(nodo) {
    if (!nodo) return null;

    switch (nodo.tipo) {
      case 'Entero': return 'int';
      case 'Real': return 'float';
      case 'Caracter': return 'char';
      case 'Cadena': return 'cadena';

      case 'Identificador': {
        const variable = this.buscarVariable(nodo.valor);
        if (!variable) {
          this.errorNoDeclarada(nodo); // S1
          return null;
        }
        return variable.tipo === 'void' ? null : variable.tipo;
      }

      case 'Llamada': return this.tipoLlamada(nodo);
      case 'OperacionUnaria': return this.tipoUnaria(nodo);
      case 'OperacionBinaria': return this.tipoBinaria(nodo);
      default: return null;
    }
  }

  /** S5: la función debe existir y recibir los argumentos correctos */
  tipoLlamada(nodo) {
    const funcion = this.funciones.get(nodo.valor);
    const tiposArgumentos = nodo.hijos.map((a) => this.tipoExpresion(a));

    if (!funcion) {
      this.error(`La función '${nodo.valor}' no ha sido declarada`, nodo);
      return null;
    }

    if (tiposArgumentos.length !== funcion.parametros.length) {
      this.error(
        `La función '${nodo.valor}' espera ${funcion.parametros.length} argumento(s) pero recibió ${tiposArgumentos.length}`,
        nodo
      );
    } else {
      tiposArgumentos.forEach((tipo, i) => {
        if (tipo !== null && !this.esCompatible(funcion.parametros[i], tipo)) {
          this.error(
            `Argumento ${i + 1} de '${nodo.valor}': se esperaba ${funcion.parametros[i]} pero se recibió ${this.describirTipo(tipo)}`,
            nodo.hijos[i]
          );
        }
      });
    }
    return funcion.tipo;
  }

  tipoUnaria(nodo) {
    const operador = nodo.valor;
    const tipo = this.tipoExpresion(nodo.hijos[0]);
    if (tipo === null) return null;

    if (!NUMERICOS.has(tipo)) {
      this.error(`El operador '${operador}' no se puede aplicar a ${this.describirTipo(tipo)}`, nodo);
      return null;
    }
    if (operador === '!') return 'int';
    return tipo === 'char' ? 'int' : tipo;
  }

  tipoBinaria(nodo) {
    const operador = nodo.valor;
    const izquierda = this.tipoExpresion(nodo.hijos[0]);
    const derecha = this.tipoExpresion(nodo.hijos[1]);
    if (izquierda === null || derecha === null) return null; // evita errores en cascada

    for (const tipo of [izquierda, derecha]) {
      if (!NUMERICOS.has(tipo)) {
        this.error(`El operador '${operador}' no se puede aplicar a ${this.describirTipo(tipo)}`, nodo);
        return null;
      }
    }

    // S4: el módulo solo con enteros
    if (operador === '%') {
      if (izquierda === 'float' || derecha === 'float') {
        this.error("El operador '%' solo acepta operandos enteros", nodo);
        return null;
      }
      return 'int';
    }

    // Aritméticos: si alguno es float, el resultado es float
    if (OP_ARITMETICOS.has(operador)) {
      return izquierda === 'float' || derecha === 'float' ? 'float' : 'int';
    }

    // Relacionales y lógicos producen 0 o 1 (int), como en C
    return 'int';
  }
}

/**
 * Función principal del módulo.
 * @param {object} arbol AST generado por el parser
 * @returns {{ errores: object[], tablaSimbolos: object[] }}
 */
function analizarSemantica(arbol) {
  const analizador = new AnalizadorSemantico();
  analizador.analizarPrograma(arbol);
  return { errores: analizador.errores, tablaSimbolos: analizador.tablaSimbolos };
}

module.exports = { AnalizadorSemantico, analizarSemantica };
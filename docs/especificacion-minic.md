# Especificación del lenguaje Mini-C

Mini-C es un subconjunto simplificado del lenguaje C (Kernighan & Ritchie, 1972),
diseñado con fines académicos. Conserva la sintaxis de C pero elimina punteros,
arreglos, structs y el preprocesador, para que su gramática sea analizable con un
parser descendente recursivo.

Extensión de archivo: `.mc`

---

## 1. Definición léxica

El analizador léxico lee el código carácter por carácter y lo agrupa en **tokens**.

### 1.1 Palabras reservadas
| Lexema | Token |
|---|---|
| `int` `float` `char` `void` | TIPO |
| `if` `else` `while` `for` `return` | PALABRA_RESERVADA |
| `printf` | PALABRA_RESERVADA |

### 1.2 Categorías de tokens (expresiones regulares)
| Token | Expresión regular | Ejemplos |
|---|---|---|
| IDENTIFICADOR | `[a-zA-Z_][a-zA-Z0-9_]*` | `x`, `suma_total`, `_aux1` |
| NUM_ENTERO | `[0-9]+` | `0`, `42` |
| NUM_REAL | `[0-9]+\.[0-9]+` | `3.14`, `0.5` |
| CARACTER | `'[^'\n]'` | `'a'`, `'Z'` |
| CADENA | `"[^"\n]*"` | `"Hola mundo"` |
| OP_ARITMETICO | `+  -  *  /  %` | |
| OP_RELACIONAL | `<  >  <=  >=  ==  !=` | |
| OP_LOGICO | `&&  \|\|  !` | |
| OP_ASIGNACION | `=` | |
| OP_INCREMENTO | `++  --` | |
| DELIMITADOR | `(  )  {  }  ;  ,` | |

### 1.3 Elementos ignorados
- Espacios, tabulaciones y saltos de línea (sí se usan para contar filas y columnas).
- Comentarios de línea: `// ...`
- Comentarios de bloque: `/* ... */`

### 1.4 Errores léxicos
| Error | Ejemplo |
|---|---|
| Carácter no reconocido | `int x = 5 @ 3;` |
| Cadena sin cerrar | `printf("hola);` |
| Carácter mal formado | `'ab'` o `''` |
| Número mal formado | `3.` o `12abc` |
| Comentario de bloque sin cerrar | `/* comentario` |

---

## 2. Definición sintáctica (gramática)

Notación **EBNF**:
- `{ X }` = cero o más repeticiones
- `[ X ]` = opcional
- `|` = alternativa
- Los terminales van entre comillas.

```ebnf
programa        → { funcion } EOF

funcion         → tipo IDENTIFICADOR "(" [ parametros ] ")" bloque
parametros      → parametro { "," parametro }
parametro       → tipo IDENTIFICADOR
tipo            → "int" | "float" | "char" | "void"

bloque          → "{" { sentencia } "}"

sentencia       → declaracion ";"
                | asignacion ";"
                | si
                | mientras
                | para
                | retorno
                | imprimir
                | bloque

declaracion     → tipo declarador { "," declarador }
declarador      → IDENTIFICADOR [ "=" expresion ]

asignacion      → IDENTIFICADOR ( "=" expresion
                                | "++"
                                | "--"
                                | "(" [ argumentos ] ")" )

si              → "if" "(" expresion ")" sentencia [ "else" sentencia ]
mientras        → "while" "(" expresion ")" sentencia
para            → "for" "(" [ declaracion | asignacion ] ";"
                            [ expresion ] ";"
                            [ asignacion ] ")" sentencia
retorno         → "return" [ expresion ] ";"
imprimir        → "printf" "(" argumentos ")" ";"
argumentos      → expresion { "," expresion }

expresion       → logico_o
logico_o        → logico_y   { "||" logico_y }
logico_y        → igualdad   { "&&" igualdad }
igualdad        → relacional { ( "==" | "!=" ) relacional }
relacional      → aditiva    { ( "<" | ">" | "<=" | ">=" ) aditiva }
aditiva         → termino    { ( "+" | "-" ) termino }
termino         → unario     { ( "*" | "/" | "%" ) unario }
unario          → ( "!" | "-" ) unario | primario
primario        → NUM_ENTERO | NUM_REAL | CARACTER | CADENA
                | IDENTIFICADOR [ "(" [ argumentos ] ")" ]
                | "(" expresion ")"
```

### 2.1 Decisiones de diseño de la gramática
1. **Sin recursión por la izquierda.** Una regla como `aditiva → aditiva "+" termino`
   haría que un parser descendente se llame a sí mismo infinitamente. Por eso se
   reescribe con repetición: `aditiva → termino { "+" termino }`.
2. **La precedencia está codificada en niveles.** Cada nivel de la gramática es un
   nivel de precedencia, de menor a mayor: `||` → `&&` → `== !=` → `< > <= >=`
   → `+ -` → `* / %` → unarios → primarios. Por eso `2 + 3 * 4` se agrupa como
   `2 + (3 * 4)`.
3. **Asociatividad por la izquierda.** El ciclo `{ ... }` agrupa `10 - 4 - 2`
   como `(10 - 4) - 2`, igual que en C.
4. **El `else` ambiguo** (*dangling else*) se resuelve asociando cada `else` con
   el `if` más cercano, igual que en C.
5. **Gramática LL(1) en casi todos los puntos.** Con mirar un solo token se sabe
   qué regla aplicar: si empieza con TIPO es declaración, con IDENTIFICADOR es
   asignación o llamada, con `if` es condicional, etc.

### 2.2 Errores sintácticos (ejemplos)
| Error | Ejemplo |
|---|---|
| Falta `;` | `int x = 5` |
| Paréntesis o llave sin cerrar | `if (x > 3 {` |
| Expresión incompleta | `x = 5 + ;` |
| Token inesperado | `int = 5;` |

**Recuperación de errores:**
- *Nivel de frase:* si falta un `)`, o un `;` al final de una línea, el parser
  registra el error y continúa como si el símbolo estuviera presente.
- *Modo pánico:* en cualquier otro error, el parser descarta tokens hasta un
  punto seguro (`;`, `{`, `}` o una palabra que inicia sentencia) y continúa.
Esto permite reportar **varios errores** en una sola compilación.

---

## 3. Definición semántica

Reglas que el código debe cumplir aunque esté bien escrito sintácticamente:

| # | Regla | Ejemplo de error |
|---|---|---|
| S1 | Toda variable debe declararse antes de usarse | `y = 5;` sin `int y;` |
| S2 | No se puede redeclarar una variable en el mismo ámbito | `int x; int x;` |
| S3 | Compatibilidad de tipos en asignación: `int → float` sí, `float → int` no | `int a = 3.5;` |
| S4 | El operador `%` solo acepta enteros | `5.5 % 2` |
| S5 | Toda función llamada debe existir y recibir el número correcto de argumentos | `suma(1);` si `suma` recibe 2 |
| S6 | No se puede redefinir una función | dos funciones `suma` |
| S7 | Una función `void` no retorna valor; una no-`void` debe retornar una expresión | `void f() { return 5; }` |
| S8 | Debe existir una función `main` | programa sin `main` |
| S9 | No se pueden declarar variables de tipo `void` | `void x;` |

**Ámbitos (scopes):** cada bloque `{ }` crea un ámbito nuevo. Una variable
declarada dentro de un bloque no existe fuera de él. Los parámetros de una función
pertenecen al ámbito de esa función.

---

## 4. Tabla de errores (formato de salida)

| Tipo | Fila | Columna | Sentencia / Lexema | Descripción |
|---|---|---|---|---|
| Léxico / Sintáctico / Semántico | n | n | texto | mensaje |
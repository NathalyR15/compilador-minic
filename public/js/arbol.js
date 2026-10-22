/**
 * arbol.js
 * Dibuja el árbol sintáctico como un diagrama jerárquico.
 *
 * Es una función RECURSIVA, igual que el árbol: cada nodo se convierte en un
 * <li> con su caja, y sus hijos van dentro de un <ul>. Las líneas que unen
 * los nodos se dibujan con CSS (ver styles.css, sección "Árbol sintáctico").
 * Al hacer clic en un nodo con hijos, se colapsa o expande.
 *
 * @author Nathaly
 */

/** Categoría visual (color) de cada tipo de nodo */
const CATEGORIAS = {
  Programa: 'raiz',
  Funcion: 'funcion',
  If: 'control', Else: 'control', While: 'control', For: 'control',
  Declaracion: 'declaracion', Variable: 'declaracion', Parametro: 'declaracion',
  Asignacion: 'sentencia', Incremento: 'sentencia', Return: 'sentencia', Printf: 'sentencia',
  Llamada: 'llamada',
  OperacionBinaria: 'operador', OperacionUnaria: 'operador',
  Identificador: 'identificador',
  Entero: 'literal', Real: 'literal', Caracter: 'literal', Cadena: 'literal'
};

/** Leyenda de colores para mostrar sobre el árbol */
export const LEYENDA = [
  ['funcion', 'Función'],
  ['control', 'Control'],
  ['declaracion', 'Declaración'],
  ['sentencia', 'Sentencia'],
  ['operador', 'Operador'],
  ['llamada', 'Llamada'],
  ['identificador', 'Identificador'],
  ['literal', 'Literal'],
  ['estructura', 'Estructura']
];

/** Crea el <li> de un nodo y, recursivamente, el de todos sus hijos */
function crearNodo(nodo) {
  const li = document.createElement('li');

  const caja = document.createElement('span');
  caja.className = `nodo nodo-${CATEGORIAS[nodo.tipo] || 'estructura'}`;
  caja.title = `Fila ${nodo.fila}, Columna ${nodo.columna}`;

  const tipo = document.createElement('span');
  tipo.className = 'nodo-tipo';
  tipo.textContent = nodo.tipo + (nodo.tipoDato ? ` (${nodo.tipoDato})` : '');
  caja.appendChild(tipo);

  if (nodo.valor !== null && nodo.valor !== undefined) {
    const valor = document.createElement('span');
    valor.className = 'nodo-valor';
    valor.textContent = nodo.valor; // textContent: el texto nunca se interpreta como HTML
    caja.appendChild(valor);
  }

  li.appendChild(caja);

  if (nodo.hijos.length > 0) {
    const ul = document.createElement('ul');
    nodo.hijos.forEach((hijo) => ul.appendChild(crearNodo(hijo)));
    li.appendChild(ul);

    caja.classList.add('con-hijos');
    caja.addEventListener('click', () => li.classList.toggle('colapsado'));
  }

  return li;
}

/**
 * Dibuja el árbol completo dentro del contenedor.
 * @param {object} arbol       Nodo raíz (Programa)
 * @param {HTMLElement} contenedor
 */
export function dibujarArbol(arbol, contenedor) {
  contenedor.innerHTML = '';
  const raiz = document.createElement('ul');
  raiz.className = 'arbol';
  raiz.appendChild(crearNodo(arbol));
  contenedor.appendChild(raiz);
}
/* Pruebas de errores semanticos */

int doble(int n) {
  return n * 2;
}

int doble(int m) {        // S6: funcion redefinida
  return m;
}

void saludar() {
  return 5;               // S7: void no retorna valor
}

float promedio(int a, int b) {
  float r = (a + b) / 2;  // S7: falta return
}

int main() {
  int x = 10;
  int x = 20;             // S2: redeclaracion
  void nada;              // S9: variable void
  float f = 7.5;
  int m = f % 2;          // S4: modulo con float
  int r = doble(1, 2);    // S5: numero de argumentos
  y = 3;                  // S1: no declarada
  {
    int x = 5;            // valido: es otro ambito
  }
  printf(resultado(x));   // S5: funcion no declarada
  if ("hola") {           // condicion no numerica
    x = 1;
  }
  return 0;
}
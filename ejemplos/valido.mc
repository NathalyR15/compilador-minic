/* Programa de ejemplo en Mini-C
   Calcula la suma y el factorial */

int suma(int a, int b) {
  return a + b;
}

int factorial(int n) {
  int resultado = 1;
  int i;
  for (i = 1; i <= n; i++) {
    resultado = resultado * i;
  }
  return resultado;
}

int main() {
  int x = 5, y = 10;
  float promedio = 0.0;
  char letra = 'A';

  promedio = (x + y) / 2;

  if (x < y && y != 0) {
    printf("La suma es: ", suma(x, y));
  } else {
    printf("Algo raro paso");
  }

  while (x > 0) {
    x--;   // decremento
  }

  printf("Factorial de 5: ", factorial(5));
  return 0;
}
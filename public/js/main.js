(function () {
  const selectTalla = document.getElementById("talla");
  const inputCantidad = document.getElementById("cantidad");

  if (!selectTalla || !inputCantidad) return;

  function ajustarMaximo() {
    const opcion = selectTalla.selectedOptions[0];
    const stock = opcion ? Number(opcion.dataset.stock) : 0;
    inputCantidad.max = Math.max(stock, 1);
    if (Number(inputCantidad.value) > stock) {
      inputCantidad.value = Math.max(stock, 1);
    }
  }

  selectTalla.addEventListener("change", ajustarMaximo);
  ajustarMaximo();
})();

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

// Menú móvil
(function () {
  const boton = document.querySelector(".nav__toggle");
  const enlaces = document.getElementById("nav-links");
  if (!boton || !enlaces) return;

  boton.addEventListener("click", () => {
    const abierto = enlaces.classList.toggle("is-open");
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  });

  enlaces.querySelectorAll("a").forEach((enlace) => {
    enlace.addEventListener("click", () => {
      enlaces.classList.remove("is-open");
      boton.setAttribute("aria-expanded", "false");
      boton.setAttribute("aria-label", "Abrir menú");
    });
  });
})();

// Mensajes flash: cierre manual y auto-dismiss
(function () {
  document.querySelectorAll(".flash").forEach((flash) => {
    const cerrar = () => flash.remove();
    const boton = flash.querySelector(".flash__cerrar");
    if (boton) boton.addEventListener("click", cerrar);
    setTimeout(cerrar, 6000);
  });
})();

// Selects que envían el formulario al cambiar (evita handlers inline por CSP)
(function () {
  document.querySelectorAll(".js-auto-submit").forEach((select) => {
    select.addEventListener("change", () => select.form.submit());
  });
})();

// Animación de aparición al hacer scroll (progressive enhancement: sin JS,
// los elementos ya son visibles por la regla base de .reveal en el CSS)
(function () {
  const elementos = document.querySelectorAll(".reveal");
  if (!elementos.length || !("IntersectionObserver" in window)) return;

  elementos.forEach((el) => el.classList.add("reveal--pending"));

  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.remove("reveal--pending");
          observador.unobserve(entrada.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  elementos.forEach((el) => observador.observe(el));
})();

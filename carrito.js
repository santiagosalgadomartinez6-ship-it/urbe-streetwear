// Lógica pura del carrito, sin efectos secundarios de servidor (sin db.init(),
// sin app.listen()). Se puede requerir desde tests sin arrancar el servidor.
const db = require("./db");

function contarItemsCarrito(carrito) {
  return carrito.reduce((total, item) => total + item.cantidad, 0);
}

function detalleCarrito(carrito) {
  const items = [];
  let totalCentavos = 0;

  for (const entrada of carrito) {
    const producto = db.obtenerProducto(entrada.productoId);
    if (!producto) continue;
    const variante = db.obtenerVariante(entrada.productoId, entrada.talla);
    const cantidad = Math.min(entrada.cantidad, variante ? variante.stock : 0);
    const subtotalCentavos = producto.precio_centavos * cantidad;
    totalCentavos += subtotalCentavos;
    items.push({
      productoId: producto.id,
      nombre: producto.nombre,
      colorMuestra: producto.color_muestra,
      talla: entrada.talla,
      cantidad,
      cantidadSolicitada: entrada.cantidad,
      stockDisponible: variante ? variante.stock : 0,
      precioUnitarioCentavos: producto.precio_centavos,
      subtotalCentavos,
    });
  }

  return { items, totalCentavos };
}

module.exports = { detalleCarrito, contarItemsCarrito };

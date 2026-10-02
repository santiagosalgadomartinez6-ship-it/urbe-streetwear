const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

// URBE_DB_PATH debe fijarse ANTES de requerir ../db, porque db.js abre la
// conexión al cargarse (module load time), no de forma perezosa.
const dbPath = path.join(os.tmpdir(), `urbe-test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.URBE_DB_PATH = dbPath;

const db = require("../db");
db.init();

test.after(() => {
  db.cerrar();
  try {
    fs.unlinkSync(dbPath);
  } catch (error) {
    // ya no existe o no se pudo borrar: no es crítico para el resultado del test
  }
});

test("obtenerVariante devuelve el stock sembrado por init()", () => {
  const productos = db.obtenerProductos();
  assert.ok(productos.length > 0, "el seed debe crear al menos un producto");

  const producto = productos[0];
  const variantes = db.obtenerVariantes(producto.id);
  assert.ok(variantes.length > 0, "el producto debe tener al menos una variante");

  const variante = db.obtenerVariante(producto.id, variantes[0].talla);
  assert.equal(variante.stock, 8);
});

test("crearPedido descuenta el stock correctamente y devuelve un id", () => {
  const producto = db.obtenerProductos()[0];
  const variante = db.obtenerVariantes(producto.id)[0];
  const stockAntes = variante.stock;

  const pedidoId = db.crearPedido({
    datosCliente: {
      nombre: "Cliente de prueba",
      telefono: "5555555555",
      email: "prueba@example.com",
      direccion: "Calle Falsa 123",
      ciudad: "CDMX",
      codigoPostal: "00000",
      metodoPago: "efectivo",
    },
    items: [
      {
        productoId: producto.id,
        nombreProducto: producto.nombre,
        talla: variante.talla,
        cantidad: 2,
        precioUnitarioCentavos: producto.precio_centavos,
      },
    ],
    totalCentavos: producto.precio_centavos * 2,
  });

  assert.ok(Number.isInteger(pedidoId) && pedidoId > 0);

  const varianteDespues = db.obtenerVariante(producto.id, variante.talla);
  assert.equal(varianteDespues.stock, stockAntes - 2);

  const pedidoGuardado = db.obtenerPedido(pedidoId);
  assert.equal(pedidoGuardado.items.length, 1);
  assert.equal(pedidoGuardado.total_centavos, producto.precio_centavos * 2);
});

test("crearPedido lanza error y deja el stock intacto cuando la cantidad excede el disponible (rollback real)", () => {
  const productos = db.obtenerProductos();
  const productoValido = productos[1];
  const varianteValida = db.obtenerVariantes(productoValido.id)[0];
  const stockValidoAntes = varianteValida.stock;

  const productoInvalido = productos[2];
  const varianteInvalida = db.obtenerVariantes(productoInvalido.id)[0];
  const stockInvalidoAntes = varianteInvalida.stock;

  assert.throws(() => {
    db.crearPedido({
      datosCliente: {
        nombre: "Cliente de prueba",
        telefono: "5555555555",
        email: "prueba@example.com",
        direccion: "Calle Falsa 123",
        ciudad: "CDMX",
        codigoPostal: "00000",
        metodoPago: "efectivo",
      },
      items: [
        {
          // Este item sí tiene stock suficiente...
          productoId: productoValido.id,
          nombreProducto: productoValido.nombre,
          talla: varianteValida.talla,
          cantidad: 1,
          precioUnitarioCentavos: productoValido.precio_centavos,
        },
        {
          // ...pero este pide muchísimo más de lo disponible, así que
          // crearPedido debe fallar completo y no descontar NADA (ni siquiera
          // el primer item, que por sí solo sería válido).
          productoId: productoInvalido.id,
          nombreProducto: productoInvalido.nombre,
          talla: varianteInvalida.talla,
          cantidad: stockInvalidoAntes + 1000,
          precioUnitarioCentavos: productoInvalido.precio_centavos,
        },
      ],
      totalCentavos: productoValido.precio_centavos + productoInvalido.precio_centavos * (stockInvalidoAntes + 1000),
    });
  });

  const varianteValidaDespues = db.obtenerVariante(productoValido.id, varianteValida.talla);
  const varianteInvalidaDespues = db.obtenerVariante(productoInvalido.id, varianteInvalida.talla);
  assert.equal(varianteValidaDespues.stock, stockValidoAntes, "el item válido no debe descontarse si el pedido completo falla");
  assert.equal(varianteInvalidaDespues.stock, stockInvalidoAntes);
});

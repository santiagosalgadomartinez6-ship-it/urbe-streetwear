const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

// URBE_DB_PATH debe fijarse ANTES de requerir ../db (vía ../carrito), porque
// db.js abre la conexión al cargarse.
const dbPath = path.join(os.tmpdir(), `urbe-test-carrito-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.URBE_DB_PATH = dbPath;

const db = require("../db");
db.init();
const { detalleCarrito, contarItemsCarrito } = require("../carrito");

test.after(() => {
  db.cerrar();
  try {
    fs.unlinkSync(dbPath);
  } catch (error) {
    // ya no existe o no se pudo borrar: no es crítico para el resultado del test
  }
});

test("contarItemsCarrito suma las cantidades de todos los items", () => {
  const carrito = [
    { productoId: 1, talla: "M", cantidad: 2 },
    { productoId: 2, talla: "S", cantidad: 3 },
  ];
  assert.equal(contarItemsCarrito(carrito), 5);
});

test("contarItemsCarrito devuelve 0 para un carrito vacío", () => {
  assert.equal(contarItemsCarrito([]), 0);
});

test("detalleCarrito limita la cantidad al stock disponible (Math.min)", () => {
  const producto = db.obtenerProductos()[0];
  const variante = db.obtenerVariantes(producto.id)[0];
  const carrito = [{ productoId: producto.id, talla: variante.talla, cantidad: variante.stock + 50 }];

  const { items } = detalleCarrito(carrito);
  assert.equal(items.length, 1);
  assert.equal(items[0].cantidad, variante.stock);
  assert.equal(items[0].cantidadSolicitada, variante.stock + 50);
});

test("detalleCarrito omite del resultado un producto que ya no existe", () => {
  const idInexistente = 999999;
  const carrito = [{ productoId: idInexistente, talla: "M", cantidad: 1 }];

  const { items, totalCentavos } = detalleCarrito(carrito);
  assert.equal(items.length, 0);
  assert.equal(totalCentavos, 0);
});

test("detalleCarrito calcula totalCentavos sumando precio_centavos * cantidad de cada item", () => {
  const productos = db.obtenerProductos();
  const p1 = productos[0];
  const p2 = productos[1];
  const v1 = db.obtenerVariantes(p1.id)[0];
  const v2 = db.obtenerVariantes(p2.id)[0];

  const carrito = [
    { productoId: p1.id, talla: v1.talla, cantidad: 2 },
    { productoId: p2.id, talla: v2.talla, cantidad: 1 },
  ];

  const { totalCentavos } = detalleCarrito(carrito);
  const esperado = p1.precio_centavos * 2 + p2.precio_centavos * 1;
  assert.equal(totalCentavos, esperado);
});

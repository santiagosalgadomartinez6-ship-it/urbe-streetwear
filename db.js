const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const DB_PATH = process.env.URBE_DB_PATH || path.join(__dirname, "urbe.db");
const db = new DatabaseSync(DB_PATH);

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      categoria TEXT NOT NULL,
      precio_centavos INTEGER NOT NULL,
      color_muestra TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS variantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      talla TEXT NOT NULL,
      stock INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_cliente TEXT NOT NULL,
      telefono TEXT NOT NULL,
      email TEXT NOT NULL,
      direccion TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      codigo_postal TEXT NOT NULL,
      metodo_pago TEXT NOT NULL,
      total_centavos INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      creado_en TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pedido_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      nombre_producto TEXT NOT NULL,
      talla TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_unitario_centavos INTEGER NOT NULL
    );
  `);

  const yaHayProductos = db.prepare("SELECT COUNT(*) AS n FROM productos").get().n > 0;
  if (yaHayProductos) return;

  const tallasRopa = ["S", "M", "L", "XL"];
  const tallasCalzado = ["25", "26", "27", "28", "29"];
  const tallaUnica = ["Única"];

  const productosSemilla = [
    ["Playera Oversize Classic", "Playera de algodón pesado, corte oversize, cuello redondo.", "Playeras", 45000, "#1a1a1a", tallasRopa],
    ["Playera Gráfica Concreto", "Playera con estampado gráfico frontal a gran escala.", "Playeras", 48000, "#ff5f00", tallasRopa],
    ["Hoodie Bloque", "Hoodie de felpa gruesa con bolsillo canguro.", "Hoodies", 95000, "#2b2b2b", tallasRopa],
    ["Hoodie Zip Asfalto", "Hoodie con cierre completo y forro polar interior.", "Hoodies", 115000, "#3d3d3d", tallasRopa],
    ["Gorra Icono", "Gorra estructurada con bordado frontal.", "Gorras", 38000, "#ff5f00", tallaUnica],
    ["Gorra Trucker Rejilla", "Gorra trucker con panel de malla trasero.", "Gorras", 35000, "#1a1a1a", tallaUnica],
    ["Tenis Runner 01", "Tenis urbanos de suela ligera para uso diario.", "Tenis", 185000, "#f5f5f0", tallasCalzado],
    ["Tenis Street 02", "Tenis de perfil alto con detalles en contraste.", "Tenis", 195000, "#ff5f00", tallasCalzado],
  ];

  const insertarProducto = db.prepare(
    "INSERT INTO productos (nombre, descripcion, categoria, precio_centavos, color_muestra) VALUES (?, ?, ?, ?, ?)"
  );
  const insertarVariante = db.prepare(
    "INSERT INTO variantes (producto_id, talla, stock) VALUES (?, ?, ?)"
  );

  for (const [nombre, descripcion, categoria, precio, color, tallas] of productosSemilla) {
    const resultado = insertarProducto.run(nombre, descripcion, categoria, precio, color);
    const productoId = Number(resultado.lastInsertRowid);
    for (const talla of tallas) {
      insertarVariante.run(productoId, talla, 8);
    }
  }
}

function obtenerProductos(categoria) {
  if (categoria) {
    return db.prepare("SELECT * FROM productos WHERE categoria = ? ORDER BY id").all(categoria);
  }
  return db.prepare("SELECT * FROM productos ORDER BY id").all();
}

function obtenerCategorias() {
  return db.prepare("SELECT DISTINCT categoria FROM productos ORDER BY categoria").all().map((r) => r.categoria);
}

function obtenerProducto(id) {
  return db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
}

function obtenerVariantes(productoId) {
  return db.prepare("SELECT * FROM variantes WHERE producto_id = ? ORDER BY id").all(productoId);
}

function obtenerVariante(productoId, talla) {
  return db.prepare("SELECT * FROM variantes WHERE producto_id = ? AND talla = ?").get(productoId, talla);
}

function crearPedido({ datosCliente, items, totalCentavos }) {
  db.exec("BEGIN");
  try {
    for (const item of items) {
      const variante = obtenerVariante(item.productoId, item.talla);
      if (!variante || variante.stock < item.cantidad) {
        throw new Error(`Sin stock suficiente para ${item.nombreProducto} (talla ${item.talla})`);
      }
    }

    const insertarPedido = db.prepare(`
      INSERT INTO pedidos (nombre_cliente, telefono, email, direccion, ciudad, codigo_postal, metodo_pago, total_centavos, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const resultadoPedido = insertarPedido.run(
      datosCliente.nombre,
      datosCliente.telefono,
      datosCliente.email,
      datosCliente.direccion,
      datosCliente.ciudad,
      datosCliente.codigoPostal,
      datosCliente.metodoPago,
      totalCentavos,
      new Date().toISOString()
    );
    const pedidoId = Number(resultadoPedido.lastInsertRowid);

    const insertarItem = db.prepare(`
      INSERT INTO pedido_items (pedido_id, producto_id, nombre_producto, talla, cantidad, precio_unitario_centavos)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const descontarStock = db.prepare(
      "UPDATE variantes SET stock = stock - ? WHERE producto_id = ? AND talla = ?"
    );

    for (const item of items) {
      insertarItem.run(pedidoId, item.productoId, item.nombreProducto, item.talla, item.cantidad, item.precioUnitarioCentavos);
      descontarStock.run(item.cantidad, item.productoId, item.talla);
    }

    db.exec("COMMIT");
    return pedidoId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function obtenerPedido(id) {
  const pedido = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
  if (!pedido) return null;
  const items = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ?").all(id);
  return { ...pedido, items };
}

function obtenerPedidos() {
  return db.prepare("SELECT * FROM pedidos ORDER BY creado_en DESC").all();
}

// Trae una página de pedidos con sus items en un solo query adicional (batch por
// IN (...)), en vez de un SELECT por pedido (evita el N+1 de obtenerPedidos().map(p => obtenerPedido(p.id))).
function obtenerPedidosPagina(pagina, porPagina) {
  const offset = (Math.max(1, pagina) - 1) * porPagina;
  const pedidos = db
    .prepare("SELECT * FROM pedidos ORDER BY creado_en DESC LIMIT ? OFFSET ?")
    .all(porPagina, offset);
  if (pedidos.length === 0) return [];

  const ids = pedidos.map((p) => p.id);
  const marcadores = ids.map(() => "?").join(",");
  const items = db
    .prepare(`SELECT * FROM pedido_items WHERE pedido_id IN (${marcadores})`)
    .all(...ids);

  const itemsPorPedido = new Map();
  for (const item of items) {
    if (!itemsPorPedido.has(item.pedido_id)) itemsPorPedido.set(item.pedido_id, []);
    itemsPorPedido.get(item.pedido_id).push(item);
  }

  return pedidos.map((p) => ({ ...p, items: itemsPorPedido.get(p.id) || [] }));
}

function contarPedidos() {
  return db.prepare("SELECT COUNT(*) AS n FROM pedidos").get().n;
}

// Total de ventas histórico (todos los pedidos no cancelados), independiente de
// la página que se esté mostrando.
function obtenerTotalVentasCentavos() {
  const fila = db
    .prepare("SELECT SUM(total_centavos) AS total FROM pedidos WHERE estado != 'cancelado'")
    .get();
  return fila.total || 0;
}

function actualizarEstadoPedido(id, estado) {
  db.prepare("UPDATE pedidos SET estado = ? WHERE id = ?").run(estado, id);
}

// Trae todos los productos con sus variantes en un solo query adicional (batch
// por IN (...)), en vez de un SELECT por producto.
function obtenerProductosConVariantes() {
  const productos = db.prepare("SELECT * FROM productos ORDER BY id").all();
  if (productos.length === 0) return [];

  const ids = productos.map((p) => p.id);
  const marcadores = ids.map(() => "?").join(",");
  const variantes = db
    .prepare(`SELECT * FROM variantes WHERE producto_id IN (${marcadores}) ORDER BY id`)
    .all(...ids);

  const variantesPorProducto = new Map();
  for (const v of variantes) {
    if (!variantesPorProducto.has(v.producto_id)) variantesPorProducto.set(v.producto_id, []);
    variantesPorProducto.get(v.producto_id).push(v);
  }

  return productos.map((p) => ({ ...p, variantes: variantesPorProducto.get(p.id) || [] }));
}

// Cierra la conexión. No se usa en producción (el proceso vive mientras corre
// el servidor), pero los tests la necesitan para poder borrar el archivo
// temporal de la BD al terminar (en Windows no se puede eliminar un archivo
// con un handle abierto).
function cerrar() {
  db.close();
}

module.exports = {
  init,
  cerrar,
  obtenerProductos,
  obtenerCategorias,
  obtenerProducto,
  obtenerProductosConVariantes,
  obtenerVariantes,
  obtenerVariante,
  crearPedido,
  obtenerPedido,
  obtenerPedidos,
  obtenerPedidosPagina,
  contarPedidos,
  obtenerTotalVentasCentavos,
  actualizarEstadoPedido,
};

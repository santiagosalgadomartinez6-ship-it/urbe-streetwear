const path = require("node:path");
const express = require("express");
const session = require("express-session");
const db = require("./db");

db.init();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.URBE_ADMIN_PASSWORD || "urbe2026";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.URBE_SECRET_KEY || "dev-secret-cambiar-en-produccion",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

app.use((req, res, next) => {
  if (!req.session.carrito) req.session.carrito = [];
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.formatoPrecio = formatoPrecio;
  res.locals.totalCarrito = contarItemsCarrito(req.session.carrito);
  next();
});

function formatoPrecio(centavos) {
  return (centavos / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function contarItemsCarrito(carrito) {
  return carrito.reduce((total, item) => total + item.cantidad, 0);
}

function flash(req, tipo, mensaje) {
  req.session.flash = { tipo, mensaje };
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

function requiereAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect("/admin/login");
  next();
}

// Catálogo
app.get("/", (req, res) => {
  const categoria = req.query.categoria || null;
  const productos = db.obtenerProductos(categoria);
  const categorias = db.obtenerCategorias();
  res.render("index", { productos, categorias, categoriaActiva: categoria });
});

app.get("/producto/:id", (req, res) => {
  const producto = db.obtenerProducto(req.params.id);
  if (!producto) return res.redirect("/");
  const variantes = db.obtenerVariantes(producto.id);
  res.render("producto", { producto, variantes });
});

// Carrito
app.post("/carrito/agregar", (req, res) => {
  const productoId = Number(req.body.producto_id);
  const talla = req.body.talla;
  const cantidad = Math.max(1, Number(req.body.cantidad) || 1);

  const variante = db.obtenerVariante(productoId, talla);
  if (!variante || variante.stock < 1) {
    flash(req, "error", "Esa talla ya no tiene stock disponible.");
    return res.redirect(`/producto/${productoId}`);
  }

  const carrito = req.session.carrito;
  const existente = carrito.find((i) => i.productoId === productoId && i.talla === talla);
  if (existente) {
    existente.cantidad = Math.min(existente.cantidad + cantidad, variante.stock);
  } else {
    carrito.push({ productoId, talla, cantidad: Math.min(cantidad, variante.stock) });
  }

  flash(req, "ok", "Producto agregado al carrito.");
  res.redirect("/carrito");
});

app.get("/carrito", (req, res) => {
  const { items, totalCentavos } = detalleCarrito(req.session.carrito);
  res.render("carrito", { items, totalCentavos });
});

app.post("/carrito/actualizar", (req, res) => {
  const productoId = Number(req.body.producto_id);
  const talla = req.body.talla;
  const cantidad = Math.max(1, Number(req.body.cantidad) || 1);

  const item = req.session.carrito.find((i) => i.productoId === productoId && i.talla === talla);
  if (item) {
    const variante = db.obtenerVariante(productoId, talla);
    item.cantidad = Math.min(cantidad, variante ? variante.stock : cantidad);
  }
  res.redirect("/carrito");
});

app.post("/carrito/eliminar", (req, res) => {
  const productoId = Number(req.body.producto_id);
  const talla = req.body.talla;
  req.session.carrito = req.session.carrito.filter(
    (i) => !(i.productoId === productoId && i.talla === talla)
  );
  res.redirect("/carrito");
});

// Checkout
app.get("/checkout", (req, res) => {
  const { items, totalCentavos } = detalleCarrito(req.session.carrito);
  if (items.length === 0) return res.redirect("/carrito");
  res.render("checkout", { items, totalCentavos });
});

app.post("/checkout", (req, res) => {
  const { items, totalCentavos } = detalleCarrito(req.session.carrito);
  if (items.length === 0) return res.redirect("/carrito");

  const { nombre, telefono, email, direccion, ciudad, codigo_postal, metodo_pago } = req.body;
  if (!nombre || !telefono || !email || !direccion || !ciudad || !codigo_postal || !metodo_pago) {
    flash(req, "error", "Completa todos los campos para continuar.");
    return res.redirect("/checkout");
  }

  try {
    const pedidoId = db.crearPedido({
      datosCliente: {
        nombre,
        telefono,
        email,
        direccion,
        ciudad,
        codigoPostal: codigo_postal,
        metodoPago: metodo_pago,
      },
      items: items.map((i) => ({
        productoId: i.productoId,
        nombreProducto: i.nombre,
        talla: i.talla,
        cantidad: i.cantidad,
        precioUnitarioCentavos: i.precioUnitarioCentavos,
      })),
      totalCentavos,
    });

    req.session.carrito = [];
    res.redirect(`/confirmacion/${pedidoId}`);
  } catch (error) {
    flash(req, "error", "Uno de los productos ya no tiene stock suficiente. Revisa tu carrito.");
    res.redirect("/carrito");
  }
});

app.get("/confirmacion/:id", (req, res) => {
  const pedido = db.obtenerPedido(req.params.id);
  if (!pedido) return res.redirect("/");
  res.render("confirmacion", { pedido });
});

// Admin
app.get("/admin/login", (req, res) => {
  res.render("admin_login");
});

app.post("/admin/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.redirect("/admin");
  }
  flash(req, "error", "Contraseña incorrecta.");
  res.redirect("/admin/login");
});

app.get("/admin/logout", (req, res) => {
  req.session.admin = false;
  res.redirect("/admin/login");
});

app.get("/admin", requiereAdmin, (req, res) => {
  const pedidos = db.obtenerPedidos().map((p) => db.obtenerPedido(p.id));
  const totalVentasCentavos = pedidos
    .filter((p) => p.estado !== "cancelado")
    .reduce((total, p) => total + p.total_centavos, 0);
  res.render("admin_dashboard", { pedidos, totalVentasCentavos });
});

app.get("/admin/productos", requiereAdmin, (req, res) => {
  const productos = db.obtenerProductos().map((p) => ({
    ...p,
    variantes: db.obtenerVariantes(p.id),
  }));
  res.render("admin_productos", { productos });
});

app.post("/admin/pedidos/:id/estado", requiereAdmin, (req, res) => {
  db.actualizarEstadoPedido(req.params.id, req.body.estado);
  flash(req, "ok", "Estado del pedido actualizado.");
  res.redirect("/admin");
});

app.listen(PORT, () => {
  console.log(`Urbe corriendo en http://127.0.0.1:${PORT}`);
});

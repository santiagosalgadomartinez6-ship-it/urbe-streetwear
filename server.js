const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { detalleCarrito, contarItemsCarrito } = require("./carrito");

db.init();

const app = express();
const PORT = process.env.PORT || 3000;
// La contraseña del panel solo viene de una variable de entorno: el repositorio es
// público, así que nunca va escrita aquí ni en render.yaml. Sin ella el panel no abre.
const ADMIN_PASSWORD = process.env.URBE_PANEL_PASSWORD || "";
const EN_PRODUCCION = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' en estilos: las muestras de color de producto usan
        // style="background-color: ...", generado server-side desde la BD (no
        // entrada de usuario). scriptSrc se mantiene estricto sin excepciones.
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
      },
    },
  })
);
app.use(compression());
app.use(morgan(EN_PRODUCCION ? "combined" : "dev"));
app.use(express.static(path.join(__dirname, "public"), { maxAge: EN_PRODUCCION ? "1d" : 0 }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: "urbe.sid",
    secret: process.env.URBE_SECRET_KEY || "dev-secret-cambiar-en-produccion",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      sameSite: "lax",
      secure: EN_PRODUCCION,
    },
  })
);

const limitadorLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
});

app.use((req, res, next) => {
  if (!req.session.carrito) req.session.carrito = [];
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.formatoPrecio = formatoPrecio;
  res.locals.totalCarrito = contarItemsCarrito(req.session.carrito);
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.urlCanonica = `${req.protocol}://${req.get("host")}${req.path}`;
  next();
});

function verificarCsrf(req, res, next) {
  const token = req.body._csrf;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render("error", {
      titulo: "Solicitud inválida — URBE",
      codigo: 403,
      mensaje: "Tu sesión expiró o la solicitud no es válida. Vuelve a intentarlo.",
    });
  }
  next();
}

app.use((req, res, next) => {
  if (req.method === "POST") return verificarCsrf(req, res, next);
  next();
});

function contrasenaValida(recibida) {
  // Solo texto: con express.urlencoded({ extended: true }) el campo puede llegar como
  // objeto o arreglo (password[toString]=x), y String() sobre eso truena.
  if (!ADMIN_PASSWORD || typeof recibida !== "string") return false;
  const esperada = Buffer.from(ADMIN_PASSWORD);
  const entrante = Buffer.from(recibida);
  if (esperada.length !== entrante.length) {
    crypto.timingSafeEqual(esperada, esperada);
    return false;
  }
  return crypto.timingSafeEqual(esperada, entrante);
}

function formatoPrecio(centavos) {
  return (centavos / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function flash(req, tipo, mensaje) {
  req.session.flash = { tipo, mensaje };
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    flash(req, "error", "Ingresa un correo electrónico válido.");
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
    // Los folios son consecutivos: la confirmación solo la ve quien hizo el pedido
    req.session.misPedidos = [...(req.session.misPedidos || []).slice(-19), pedidoId];
    res.redirect(`/confirmacion/${pedidoId}`);
  } catch (error) {
    flash(req, "error", "Uno de los productos ya no tiene stock suficiente. Revisa tu carrito.");
    res.redirect("/carrito");
  }
});

app.get("/confirmacion/:id", (req, res) => {
  const pedido = db.obtenerPedido(req.params.id);
  if (!pedido || !(req.session.misPedidos || []).includes(pedido.id)) return res.redirect("/");
  res.render("confirmacion", { pedido });
});

// Admin
app.get("/admin/login", (req, res) => {
  res.render("admin_login");
});

app.post("/admin/login", limitadorLogin, (req, res) => {
  if (!ADMIN_PASSWORD) {
    flash(req, "error", "El panel está desactivado: falta configurar su contraseña en el servidor.");
    return res.redirect("/admin/login");
  }
  if (contrasenaValida(req.body.password)) {
    req.session.admin = true;
    return res.redirect("/admin");
  }
  flash(req, "error", "Contraseña incorrecta.");
  res.redirect("/admin/login");
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("urbe.sid");
    res.redirect("/admin/login");
  });
});

app.get("/admin", requiereAdmin, (req, res) => {
  const porPagina = 20;
  const totalPedidos = db.contarPedidos();
  const totalPaginas = Math.max(1, Math.ceil(totalPedidos / porPagina));
  const pagina = Math.min(Math.max(1, Number(req.query.pagina) || 1), totalPaginas);
  const pedidos = db.obtenerPedidosPagina(pagina, porPagina);
  const totalVentasCentavos = db.obtenerTotalVentasCentavos();
  res.render("admin_dashboard", { pedidos, totalVentasCentavos, totalPedidos, pagina, totalPaginas });
});

app.get("/admin/productos", requiereAdmin, (req, res) => {
  const productos = db.obtenerProductosConVariantes();
  res.render("admin_productos", { productos });
});

app.post("/admin/pedidos/:id/estado", requiereAdmin, (req, res) => {
  db.actualizarEstadoPedido(req.params.id, req.body.estado);
  flash(req, "ok", "Estado del pedido actualizado.");
  res.redirect("/admin");
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /carrito",
      "Disallow: /checkout",
      "Disallow: /confirmacion",
      `Sitemap: ${req.protocol}://${req.get("host")}/sitemap.xml`,
      "",
    ].join("\n")
  );
});

app.get("/sitemap.xml", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const productos = db.obtenerProductos();
  const urls = [`${base}/`, ...productos.map((p) => `${base}/producto/${p.id}`)];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    "\n</urlset>";
  res.type("application/xml").send(xml);
});

app.use((req, res) => {
  res.status(404).render("error", {
    titulo: "Página no encontrada — URBE",
    codigo: 404,
    mensaje: "No encontramos lo que buscabas. Vuelve al catálogo.",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  // Si el error pasó antes de preparar las variables de la vista (por ejemplo, un formulario
  // demasiado grande), la página de error las necesita igual
  res.locals.flash ??= null;
  res.locals.totalCarrito ??= 0;
  res.locals.csrfToken ??= "";
  res.locals.urlCanonica ??= "";
  res.locals.formatoPrecio ??= formatoPrecio;
  const codigo = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(codigo).render("error", {
    titulo: codigo === 500 ? "Error del servidor — URBE" : "Solicitud no válida — URBE",
    codigo,
    mensaje: codigo === 500
      ? "Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento."
      : "No pudimos procesar lo que enviaste. Revisa tus datos e inténtalo de nuevo.",
  });
});

app.listen(PORT, () => {
  console.log(`Urbe corriendo en http://127.0.0.1:${PORT}`);
});

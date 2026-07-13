# URBE — Tienda en línea (streetwear)

Proyecto de portafolio (pieza freelance de demostración). **URBE es una marca ficticia** creada para mostrar un e-commerce completo: catálogo, carrito, checkout con control de inventario y panel de administración de pedidos.

Tercera pieza del portafolio, después de [`penumbra`](../penumbra) (sitio estático con animaciones) y [`vertice`](../vertice) (sistema de reservaciones en Python/Flask). Aquí el stack es **Node.js + Express**, para mostrar versatilidad de backend.

## Qué incluye

- Catálogo de productos con filtro por categoría, leído de SQLite
- Ficha de producto con selección de talla y control de stock por variante
- Carrito de compras persistente por sesión (agregar, actualizar cantidad, eliminar)
- Checkout con validación de stock en tiempo real y creación de pedido (transacción atómica: si algo falla, no se descuenta inventario)
- Panel de administración con login: ver pedidos (con detalle de productos), cambiar estado (pendiente/enviado/entregado/cancelado), y ver inventario por talla
- Base de datos SQLite usando el módulo nativo `node:sqlite` de Node — **sin dependencias nativas que compilar**

## Cómo correrlo

```
npm install
npm start
```

Abre `http://127.0.0.1:3000/`.

El panel de administración está en `http://127.0.0.1:3000/admin/login`.
Contraseña de prueba: `urbe2026` (definida en `server.js`, cámbiala con la variable de entorno `URBE_ADMIN_PASSWORD` antes de usar esto con un cliente real).

## Estructura del proyecto

```
urbe/
├── server.js            (rutas Express)
├── db.js                (acceso a SQLite vía node:sqlite, lógica de stock y pedidos)
├── package.json
├── urbe.db               (se genera sola al arrancar)
├── views/                (EJS)
│   ├── partials/         (head, header, footer)
│   ├── index.ejs, producto.ejs
│   ├── carrito.ejs, checkout.ejs, confirmacion.ejs
│   └── admin_login.ejs, admin_dashboard.ejs, admin_productos.ejs
└── public/
    ├── css/style.css
    └── js/main.js
```

## Cómo adaptarlo a un cliente real

- Los productos y tallas semilla están en `db.js`, función `init()` — cámbialos por el catálogo real.
- Los datos de contacto están hardcodeados en `views/partials/footer.ejs`.
- Para producción: mover `URBE_SECRET_KEY` y `URBE_ADMIN_PASSWORD` a variables de entorno reales, usar un store de sesión persistente (no la MemoryStore por defecto de `express-session`), y agregar una pasarela de pago real (Stripe/Mercado Pago) en vez del selector de método de pago de demo.

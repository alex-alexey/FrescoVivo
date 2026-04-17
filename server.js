require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Importar configuración de base de datos
const connectDB = require('./config/database');

// Importar servicios
const emailService = require('./services/emailService');

// Importar rutas
const authRoutes = require('./routes/auth');
const superadminRoutes = require('./routes/superadmin');
const storeRoutes = require('./routes/store');
const cameraRoutes = require('./routes/cameras');
const invoicesRoutes = require('./routes/invoices');
const { auth, canAccessVendor, isAdmin } = require('./middleware/auth');
const { tenantMiddleware } = require('./middleware/tenantMiddleware');

const app = express();
const server = http.createServer(app);

// Orígenes permitidos estáticos: siempre localhost + lista en .env
const STATIC_ALLOWED = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
);

async function isOriginAllowed(origin) {
  if (!origin) return true; // peticiones sin origin (server-to-server)

  try {
    const url = new URL(origin);
    const host = url.hostname;

    // Siempre permitir localhost / 127.0.0.1
    if (host === 'localhost' || host === '127.0.0.1') return true;

    // Comprobar lista estática
    if (STATIC_ALLOWED.has(origin)) return true;

    // Comprobar si el dominio está registrado como cliente activo en BD
    const Client = require('./models/Client');
    const client = await Client.findOne({ domain: host }).select('status').lean();
    return !!client;
  } catch {
    return false;
  }
}

const io = socketIO(server, {
  cors: {
    origin: async (origin, callback) => {
      try {
        const allowed = await isOriginAllowed(origin);
        if (allowed) {
          callback(null, true);
        } else {
          console.warn('🚫 CORS Socket.IO bloqueado:', origin);
          callback(new Error('Origin no permitido'));
        }
      } catch (err) {
        callback(err);
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Conectar a MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error('❌ SESSION_SECRET no definido. Configura esta variable en .env');
  process.exit(1);
}

// Sesión única con MongoDB store
const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: 'pescadolive',
    collectionName: 'sessions',
    touchAfter: 24 * 3600,
    ttl: 7 * 24 * 60 * 60,
    autoRemove: 'native'
  }),
  name: 'frescos.sid',
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  },
  proxy: process.env.NODE_ENV === 'production'
});

app.use(sessionMiddleware);

app.use(express.static('public'));

// Estado por tenant (reemplaza las variables globales)
const tenantStates = new Map();

function getTenantState(domain) {
  if (!tenantStates.has(domain)) {
    tenantStates.set(domain, {
      vendorSocket: null,
      kioskSockets: [],
      isVendorLive: false,
      vendorLiveState: { isLive: false, startedAt: null, userId: null },
      inStoreQueue: [],
      onlineQueue: [],
      activeClient: null,
      nextStoreNumber: 1,
      orders: []
    });
  }
  return tenantStates.get(domain);
}

// Dominio de un socket (guardado al conectar)
const socketDomains = new Map();

// Aplicar middleware de multi-tenant (antes de las rutas)
// Esto identifica al cliente por dominio y carga su base de datos
app.use(tenantMiddleware);

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de Super Admin
app.use('/api/superadmin', superadminRoutes);

// Rutas de configuración de tienda (requiere tenant middleware)
app.use('/api/store', storeRoutes);

// Rutas de cámaras (requiere tenant middleware)
app.use('/api', cameraRoutes);

// Rutas de Facturas (requiere tenant middleware)
app.use('/api/invoices', invoicesRoutes);

// Rutas HTTP
app.get('/', (req, res) => {
  const host = req.get('host') || req.hostname || '';
  const domain = host.split(':')[0];
  const tenantSlug = req.query.tenant;

  // Si viene ?tenant=slug desde un dominio de hosting, mostrar la tienda del cliente
  if (tenantSlug) {
    return res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
  }

  const isPlatformHost =
    domain === 'localhost' ||
    domain === '127.0.0.1' ||
    domain.startsWith('admin.') ||
    domain.endsWith('.onrender.com') ||
    domain.endsWith('.herokuapp.com') ||
    domain.endsWith('.vercel.app') ||
    domain.endsWith('.netlify.app');

  if (isPlatformHost) {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
  } else {
    // Si es un dominio de cliente personalizado, mostrar su tienda
    res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
  }
});

// Ruta directa a la tienda de un cliente por slug
app.get('/tienda', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
});

// Ruta de login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Activación de cuenta (propietario establece su contraseña inicial)
app.get('/activate-account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'activate-account.html'));
});

// Ruta del panel de Super Admin (solo accesible desde admin.* o localhost)
app.get('/superadmin', (req, res) => {
  if (!req.session || !req.session.userId || !req.session.isSuperAdmin) {
    return res.redirect('/superadmin-login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

// Proteger la ruta del vendor con autenticación
app.get('/vendor', auth, canAccessVendor, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vendor.html'));
});

// Proteger el panel de administración (solo admin)
app.get('/admin-panel', auth, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
});

// Proteger la ruta de administración de usuarios (solo admin)
app.get('/admin/users', auth, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-users.html'));
});

app.get('/kiosk', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kiosk-new.html'));
});

app.get('/mobile-ticket', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile-ticket.html'));
});

// API para obtener el estado del live (público - sin autenticación requerida)
app.get('/api/live-status', (req, res) => {
  const host = req.get('host') || req.hostname;
  const domain = host.split(':')[0];
  const state = getTenantState(domain);
  res.json({
    success: true,
    isLive: state.vendorLiveState.isLive,
    startedAt: state.vendorLiveState.startedAt
  });
});

app.get('/api/orders', auth, canAccessVendor, (req, res) => {
  const host = req.get('host') || req.hostname;
  const domain = host.split(':')[0];
  res.json(getTenantState(domain).orders);
});

app.post('/api/orders', auth, canAccessVendor, (req, res) => {
  const { clientId, clientName, items, total, shippingAddress } = req.body;

  if (!clientId || !clientName || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'clientId, clientName e items son requeridos' });
  }
  if (typeof total !== 'number' || total < 0) {
    return res.status(400).json({ success: false, message: 'total debe ser un número positivo' });
  }

  const host = req.get('host') || req.hostname;
  const domain = host.split(':')[0];
  const state = getTenantState(domain);

  const order = {
    id: uuidv4(),
    clientId: String(clientId).trim().slice(0, 128),
    clientName: String(clientName).trim().slice(0, 256),
    items,
    total,
    shippingAddress: shippingAddress ? String(shippingAddress).trim().slice(0, 512) : '',
    timestamp: new Date(),
    status: 'pending'
  };
  state.orders.push(order);
  res.json(order);
});

// Gestión de conexiones Socket.IO
io.on('connection', (socket) => {
  // Extraer dominio del handshake para aislar estado por tenant
  const origin = socket.handshake.headers.origin || '';
  let domain = 'localhost';
  try { domain = new URL(origin).hostname || 'localhost'; } catch {}
  socket.tenantDomain = domain;
  socketDomains.set(socket.id, domain);

  const st = () => getTenantState(socket.tenantDomain);
  console.log('Nueva conexión:', socket.id, '| tenant:', domain);

  // Vendedor se conecta
  socket.on('vendor-connect', () => {
    const s = st();
    s.vendorSocket = socket.id;
    if (s.vendorLiveState.isLive) s.isVendorLive = true;
    socket.emit('vendor-connected', {
      inStoreQueue: s.inStoreQueue,
      onlineQueue: s.onlineQueue,
      activeClient: s.activeClient,
      isLive: s.vendorLiveState.isLive,
      nextStoreNumber: s.nextStoreNumber,
      lastTicketNumber: s.nextStoreNumber - 1
    });
    console.log('✅ Vendedor conectado:', socket.id, '| tenant:', domain);
  });

  // Kiosk se conecta
  socket.on('kiosk-connect', () => {
    const s = st();
    if (!s.kioskSockets.includes(socket.id)) s.kioskSockets.push(socket.id);
    socket.emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
    if (s.activeClient?.type === 'in-store') socket.emit('client-accepted', s.activeClient);
    console.log('🖥️ Kiosk conectado:', socket.id, '| tenant:', domain);
  });

  socket.on('test-event', (data) => {
    console.log('🧪 TEST:', data, '| socket:', socket.id);
  });

  // Vendedor inicia live
  socket.on('vendor-go-live', () => {
    const s = st();
    if (socket.id !== s.vendorSocket) {
      socket.emit('vendor-go-live-response', { success: false, error: 'No estás registrado como vendedor' });
      return;
    }
    s.isVendorLive = true;
    s.vendorLiveState = { isLive: true, startedAt: new Date(), userId: socket.handshake.session?.userId || null };
    socket.emit('vendor-go-live-response', { success: true });
    // Emitir solo a sockets del mismo tenant
    io.sockets.sockets.forEach((sock) => {
      if (socketDomains.get(sock.id) === domain) sock.emit('vendor-status-changed', { isLive: true });
    });
  });

  // Vendedor detiene live
  socket.on('vendor-stop-live', () => {
    const s = st();
    if (socket.id !== s.vendorSocket) {
      socket.emit('vendor-stop-live-response', { success: false, error: 'No estás registrado como vendedor' });
      return;
    }
    s.isVendorLive = false;
    s.vendorLiveState = { isLive: false, startedAt: null, userId: null };
    socket.emit('vendor-stop-live-response', { success: true });
    io.sockets.sockets.forEach((sock) => {
      if (socketDomains.get(sock.id) === domain) sock.emit('vendor-status-changed', { isLive: false });
    });
  });

  // Stream público
  socket.on('request-public-stream', () => {
    const s = st();
    if (!s.isVendorLive || !s.vendorSocket) { socket.emit('public-stream-unavailable'); return; }
    io.to(s.vendorSocket).emit('new-public-viewer', { viewerId: socket.id });
  });

  socket.on('public-stream-offer', (data) => {
    if (socket.id !== st().vendorSocket) return;
    io.to(data.to).emit('public-stream-offer', { offer: data.offer, from: socket.id });
  });

  socket.on('public-stream-answer', (data) => {
    const s = st();
    if (s.vendorSocket) io.to(s.vendorSocket).emit('public-stream-answer', { answer: data.answer, from: socket.id });
  });

  socket.on('public-stream-ice-candidate', (data) => {
    const s = st();
    const target = data.to === 'vendor' ? s.vendorSocket : data.to;
    if (target) io.to(target).emit('public-stream-ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  // Generar número presencial
  socket.on('generate-store-number', () => {
    const s = st();
    if (socket.id !== s.vendorSocket && !s.kioskSockets.includes(socket.id)) return;
    const storeClient = {
      id: `store-${s.nextStoreNumber}`,
      number: s.nextStoreNumber,
      type: 'in-store',
      joinedAt: new Date(),
      name: `Cliente en Tienda #${s.nextStoreNumber}`
    };
    s.inStoreQueue.push(storeClient);
    s.nextStoreNumber++;
    socket.emit('store-number-generated', { ...storeClient, position: s.inStoreQueue.length });
    if (s.vendorSocket) io.to(s.vendorSocket).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
    s.kioskSockets.forEach(id => io.to(id).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue }));
    console.log('🏪 Número presencial generado:', storeClient.number, '| tenant:', domain);
  });

  // Resetear contador
  socket.on('reset-ticket-counter', () => {
    const s = st();
    if (socket.id !== s.vendorSocket) return;
    s.nextStoreNumber = 1;
    s.inStoreQueue = [];
    s.onlineQueue.forEach(c => io.to(c.id).emit('queue-reset', { message: 'El sistema ha sido reiniciado.' }));
    s.onlineQueue = [];
    s.activeClient = null;
    socket.emit('counter-reset', { nextNumber: 1, message: 'Contador reseteado exitosamente' });
    socket.emit('queues-updated', { inStoreQueue: [], onlineQueue: [] });
    s.kioskSockets.forEach(id => io.to(id).emit('queues-updated', { inStoreQueue: [], onlineQueue: [] }));
    console.log('🔄 Contador reseteado | tenant:', domain);
  });

  // Cliente online se une a cola
  socket.on('client-join-online', (data) => {
    const s = st();
    if (!s.isVendorLive) { socket.emit('vendor-not-live'); return; }
    const onlineClient = {
      id: socket.id,
      name: data.name || 'Cliente Online',
      type: 'online',
      phone: data.phone || '',
      joinedAt: new Date(),
      position: s.onlineQueue.length + 1,
      ticketNumber: s.nextStoreNumber
    };
    s.onlineQueue.push(onlineClient);
    s.nextStoreNumber++;
    socket.emit('queue-position', {
      position: onlineClient.position,
      ticketNumber: onlineClient.ticketNumber,
      onlineQueueLength: s.onlineQueue.length,
      inStoreQueueLength: s.inStoreQueue.length,
      totalWaiting: s.inStoreQueue.length + s.onlineQueue.length,
      type: 'online'
    });
    if (s.vendorSocket) {
      io.to(s.vendorSocket).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
      io.to(s.vendorSocket).emit('new-online-client', { name: onlineClient.name, position: onlineClient.position, ticketNumber: onlineClient.ticketNumber });
    }
    console.log('🌐 Cliente online en cola | tenant:', domain);
  });

  socket.on('check-vendor-status', () => {
    socket.emit('vendor-status-changed', { isLive: st().isVendorLive });
  });

  socket.on('client-join', () => {
    socket.emit('please-use-client-join-online');
  });

  // Aceptar siguiente cliente
  socket.on('accept-next-client', () => {
    const s = st();
    if (socket.id !== s.vendorSocket) return;
    let nextClient = null, queueType = null;
    if (s.inStoreQueue.length > 0) { nextClient = s.inStoreQueue.shift(); queueType = 'in-store'; }
    else if (s.onlineQueue.length > 0) { nextClient = s.onlineQueue.shift(); queueType = 'online'; }
    if (!nextClient) { socket.emit('no-clients'); return; }
    if (s.activeClient?.type === 'online') io.to(s.activeClient.id).emit('call-ended');
    s.activeClient = nextClient;
    if (queueType === 'online') io.to(nextClient.id).emit('call-accepted');
    socket.emit('client-accepted', { ...s.activeClient, queueType });
    s.onlineQueue.forEach((c, i) => {
      c.position = i + 1;
      io.to(c.id).emit('queue-position', { position: c.position, ticketNumber: c.ticketNumber, onlineQueueLength: s.onlineQueue.length, inStoreQueueLength: s.inStoreQueue.length, totalWaiting: s.inStoreQueue.length + s.onlineQueue.length, type: 'online' });
    });
    io.to(s.vendorSocket).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
  });

  // Aceptar cliente presencial específico
  socket.on('accept-store-client', (data) => {
    const s = st();
    if (socket.id !== s.vendorSocket) return;
    const idx = s.inStoreQueue.findIndex(c => c.id === data.clientId);
    if (idx === -1) { socket.emit('client-not-found'); return; }
    if (s.activeClient?.type === 'online') io.to(s.activeClient.id).emit('call-ended');
    s.activeClient = s.inStoreQueue.splice(idx, 1)[0];
    socket.emit('client-accepted', { ...s.activeClient, queueType: 'in-store' });
    io.to(s.vendorSocket).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
  });

  // Aceptar cliente online específico
  socket.on('accept-online-client', (data) => {
    const s = st();
    if (socket.id !== s.vendorSocket) return;
    const idx = s.onlineQueue.findIndex(c => c.id === data.clientId);
    if (idx === -1) { socket.emit('client-not-found'); return; }
    if (s.activeClient?.type === 'online') io.to(s.activeClient.id).emit('call-ended');
    s.activeClient = s.onlineQueue.splice(idx, 1)[0];
    io.to(s.activeClient.id).emit('call-accepted');
    socket.emit('client-accepted', { ...s.activeClient, queueType: 'online' });
    s.onlineQueue.forEach((c, i) => {
      c.position = i + 1;
      io.to(c.id).emit('queue-position', { position: c.position, ticketNumber: c.ticketNumber, onlineQueueLength: s.onlineQueue.length, inStoreQueueLength: s.inStoreQueue.length, totalWaiting: s.inStoreQueue.length + s.onlineQueue.length, type: 'online' });
    });
    io.to(s.vendorSocket).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
  });

  socket.on('end-call', () => {
    const s = st();
    if (socket.id !== s.vendorSocket) return;
    if (s.activeClient) {
      io.to(s.activeClient.id).emit('call-ended');
      s.activeClient = null;
      socket.emit('call-ended-confirm');
    }
  });

  socket.on('client-leave-call', () => {
    const s = st();
    if (s.activeClient?.id === socket.id) {
      if (s.vendorSocket) io.to(s.vendorSocket).emit('client-disconnected');
      s.activeClient = null;
    }
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => { io.to(data.to).emit('webrtc-offer', { from: socket.id, offer: data.offer }); });
  socket.on('webrtc-answer', (data) => { io.to(data.to).emit('webrtc-answer', { from: socket.id, answer: data.answer }); });
  socket.on('webrtc-ice-candidate', (data) => { io.to(data.to).emit('webrtc-ice-candidate', { from: socket.id, candidate: data.candidate }); });

  // Crear pedido
  socket.on('create-order', (orderData) => {
    const s = st();
    const order = { id: uuidv4(), ...orderData, timestamp: new Date(), status: 'pending' };
    s.orders.push(order);
    socket.emit('order-created', order);
    if (s.vendorSocket) io.to(s.vendorSocket).emit('order-created', order);
  });

  // Desconexión: limpiar solo el estado del tenant correcto
  socket.on('disconnect', () => {
    const s = st();
    const d = socketDomains.get(socket.id);
    socketDomains.delete(socket.id);
    console.log('Desconexión:', socket.id, '| tenant:', d);

    // Kiosk
    const kioskIdx = s.kioskSockets.indexOf(socket.id);
    if (kioskIdx !== -1) s.kioskSockets.splice(kioskIdx, 1);

    // Vendedor
    if (socket.id === s.vendorSocket) {
      s.vendorSocket = null;
      s.isVendorLive = false;
      s.vendorLiveState = { isLive: false, startedAt: null, userId: null };
      io.sockets.sockets.forEach((sock) => {
        if (socketDomains.get(sock.id) === domain) sock.emit('vendor-status-changed', { isLive: false });
      });
      s.onlineQueue.forEach(c => io.to(c.id).emit('vendor-disconnected'));
      if (s.activeClient?.type === 'online') io.to(s.activeClient.id).emit('vendor-disconnected');
    }

    // Cliente online en cola
    const onlineIdx = s.onlineQueue.findIndex(c => c.id === socket.id);
    if (onlineIdx !== -1) {
      s.onlineQueue.splice(onlineIdx, 1);
      s.onlineQueue.forEach((c, i) => {
        c.position = i + 1;
        io.to(c.id).emit('queue-position', { position: c.position, onlineQueueLength: s.onlineQueue.length, inStoreQueueLength: s.inStoreQueue.length, totalWaiting: s.inStoreQueue.length + s.onlineQueue.length, type: 'online' });
      });
      if (s.vendorSocket) io.to(s.vendorSocket).emit('queues-updated', { inStoreQueue: s.inStoreQueue, onlineQueue: s.onlineQueue });
    }

    // Cliente activo
    if (s.activeClient?.id === socket.id) {
      s.activeClient = null;
      if (s.vendorSocket) io.to(s.vendorSocket).emit('client-disconnected');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel de vendedor: http://localhost:${PORT}/vendor`);
  console.log(`Panel de cliente: http://localhost:${PORT}/`);
  
  // Inicializar servicio de email
  await emailService.initialize();
});

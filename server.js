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
const { auth, canAccessVendor, isAdmin } = require('./middleware/auth');
const { tenantMiddleware } = require('./middleware/tenantMiddleware');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Conectar a MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Opciones comunes de cookie
const cookieOptions = {
  maxAge: 1000 * 60 * 60 * 24 * 7,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/'
};

const sessionStoreOptions = {
  mongoUrl: process.env.MONGO_URI,
  dbName: 'pescadolive',
  touchAfter: 24 * 3600,
  ttl: 7 * 24 * 60 * 60,
  autoRemove: 'native'
};

// Sesión SUPERADMIN — cookie separada, colección separada
const superadminSession = session({
  secret: process.env.SESSION_SECRET || 'secret_key_default',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ ...sessionStoreOptions, collectionName: 'sessions_superadmin' }),
  name: 'frescos.admin.sid',
  cookie: cookieOptions,
  proxy: process.env.NODE_ENV === 'production'
});

// Sesión CLIENTE — cookie separada, colección separada
const clientSession = session({
  secret: process.env.SESSION_SECRET || 'secret_key_default',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ ...sessionStoreOptions, collectionName: 'sessions_client' }),
  name: 'frescos.client.sid',
  cookie: cookieOptions,
  proxy: process.env.NODE_ENV === 'production'
});

// Middleware que aplica la sesión correcta según la ruta
app.use((req, res, next) => {
  const path = req.path;
  // Rutas exclusivas del superadmin usan la sesión de superadmin
  const isSuperadminRoute = path.startsWith('/api/superadmin') ||
                            path === '/api/auth/superadmin-login' ||
                            path === '/superadmin' ||
                            path.startsWith('/superadmin/');
  if (isSuperadminRoute) {
    return superadminSession(req, res, next);
  }
  // Todo lo demás (clientes, tienda, login de clientes) usa sesión de cliente
  return clientSession(req, res, next);
});

app.use(express.static('public'));

// Estado global de la aplicación (por tenant)
// En un entorno multi-tenant, este estado debería estar en la base de datos del cliente
// Por ahora, lo mantenemos en memoria con un Map por dominio
const tenantStates = new Map();

function getTenantState(domain) {
  if (!tenantStates.has(domain)) {
    tenantStates.set(domain, {
      vendorSocket: null,
      kioskSockets: [],
      isVendorLive: false,
      vendorLiveState: {
        isLive: false,
        startedAt: null,
        userId: null
      },
      inStoreQueue: [],
      onlineQueue: [],
      activeClient: null,
      nextStoreNumber: 1,
      orders: []
    });
  }
  return tenantStates.get(domain);
}

// Para compatibilidad con código existente (se usará para localhost/admin)
let vendorSocket = null;
let kioskSockets = [];
let isVendorLive = false;
let vendorLiveState = { isLive: false, startedAt: null, userId: null };
let inStoreQueue = [];
let onlineQueue = [];
let activeClient = null;
let nextStoreNumber = 1;
let orders = [];

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

// Rutas HTTP
app.get('/', (req, res) => {
  const host = req.get('host');
  const tenantSlug = req.query.tenant;

  // Si viene ?tenant=slug desde un dominio de hosting, mostrar la tienda del cliente
  if (tenantSlug) {
    return res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
  }

  // Si es localhost o dominio de hosting, mostrar landing de la solución
  if (host.includes('localhost') || 
      host.includes('127.0.0.1') ||
      host.includes('.onrender.com') ||
      host.includes('.herokuapp.com') ||
      host.includes('.vercel.app') ||
      host.includes('.netlify.app')) {
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

// Ruta del panel de Super Admin (solo accesible desde admin.* o localhost)
app.get('/superadmin', superadminSession, (req, res) => {
  if (!req.session || !req.session.userId || !req.session.isSuperAdmin) {
    return res.redirect('/superadmin-login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

// Proteger la ruta del vendor con autenticación
app.get('/vendor', auth, canAccessVendor, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vendor.html'));
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

// API para obtener el estado del live
app.get('/api/live-status', auth, (req, res) => {
  res.json({
    success: true,
    isLive: vendorLiveState.isLive,
    startedAt: vendorLiveState.startedAt
  });
});

app.get('/api/orders', (req, res) => {
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const order = {
    id: uuidv4(),
    clientId: req.body.clientId,
    clientName: req.body.clientName,
    items: req.body.items,
    total: req.body.total,
    shippingAddress: req.body.shippingAddress,
    timestamp: new Date(),
    status: 'pending'
  };
  orders.push(order);
  res.json(order);
});

// Gestión de conexiones Socket.IO
io.on('connection', (socket) => {
  console.log('Nueva conexión:', socket.id);

  // Vendedor se conecta
  socket.on('vendor-connect', () => {
    console.log('🔵 >>> VENDOR-CONNECT RECIBIDO desde:', socket.id);
    vendorSocket = socket.id;
    console.log('🔵 >>> vendorSocket ACTUALIZADO a:', vendorSocket);
    
    // Si había un live activo, restaurarlo
    if (vendorLiveState.isLive) {
      isVendorLive = true;
      console.log('🔴 Restaurando estado LIVE para el vendedor reconectado');
    }
    
    socket.emit('vendor-connected', {
      inStoreQueue: inStoreQueue,
      onlineQueue: onlineQueue,
      activeClient: activeClient,
      isLive: vendorLiveState.isLive,  // Enviar estado persistente
      nextStoreNumber: nextStoreNumber,
      lastTicketNumber: nextStoreNumber - 1  // Último turno emitido
    });
    console.log('✅ Vendedor conectado y confirmado:', socket.id);
    console.log('📊 Estado live enviado:', vendorLiveState.isLive);
  });

  // 🖥️ KIOSK: Terminal de autoservicio se conecta
  socket.on('kiosk-connect', () => {
    console.log('🖥️ Kiosk conectado:', socket.id);
    // Agregar a la lista de kiosks
    if (!kioskSockets.includes(socket.id)) {
      kioskSockets.push(socket.id);
    }
    // Enviar estado actual de las colas
    socket.emit('queues-updated', {
      inStoreQueue: inStoreQueue,
      onlineQueue: onlineQueue
    });
    // Si hay un cliente siendo atendido, notificar
    if (activeClient && activeClient.type === 'in-store') {
      socket.emit('client-accepted', activeClient);
    }
  });
  
  // TEST: Evento de prueba
  socket.on('test-event', (data) => {
    console.log('🧪 TEST: Evento de prueba recibido:', data);
    console.log('🧪 TEST: Socket ID del remitente:', socket.id);
  });

  // Vendedor inicia transmisión
  socket.on('vendor-go-live', () => {
    console.log('>>> vendor-go-live recibido de socket:', socket.id);
    console.log('>>> vendorSocket actual:', vendorSocket);
    console.log('>>> ¿Son iguales?:', socket.id === vendorSocket);
    
    if (socket.id !== vendorSocket) {
      console.log('>>> RECHAZADO: No es el vendedor');
      return;
    }
    
    isVendorLive = true;
    
    // Guardar estado persistente
    vendorLiveState = {
      isLive: true,
      startedAt: new Date(),
      userId: socket.handshake.session?.userId || null
    };
    
    console.log('>>> isVendorLive ahora es:', isVendorLive);
    console.log('>>> Estado guardado:', vendorLiveState);
    console.log('>>> Emitiendo vendor-status-changed a TODOS los clientes');
    io.emit('vendor-status-changed', { isLive: true });
    console.log('>>> Evento emitido exitosamente');
  });

  // Vendedor detiene transmisión
  socket.on('vendor-stop-live', () => {
    if (socket.id !== vendorSocket) return;
    isVendorLive = false;
    
    // Actualizar estado persistente
    vendorLiveState = {
      isLive: false,
      startedAt: null,
      userId: null
    };
    
    console.log('Vendedor fuera de línea - emitiendo a todos los clientes');
    console.log('>>> Estado guardado:', vendorLiveState);
    io.emit('vendor-status-changed', { isLive: false });
  });

  // 📹 PUBLIC STREAM: Visitante solicita ver las cámaras públicas
  socket.on('request-public-stream', () => {
    console.log('📹 Solicitud de stream público de:', socket.id);
    console.log('📹 isVendorLive:', isVendorLive);
    console.log('📹 vendorSocket:', vendorSocket);
    
    if (!isVendorLive || !vendorSocket) {
      console.log('❌ Vendedor no está en vivo o no está conectado');
      socket.emit('public-stream-unavailable');
      return;
    }
    
    console.log('✅ Notificando al vendedor sobre nuevo espectador');
    // Notificar al vendedor que hay un nuevo espectador
    io.to(vendorSocket).emit('new-public-viewer', {
      viewerId: socket.id
    });
    
    console.log('✅ Notificando al vendedor sobre nuevo espectador');
  });

  // 📹 VENDOR → PUBLIC: Ofrecer stream a espectador público
  socket.on('public-stream-offer', (data) => {
    if (socket.id !== vendorSocket) return;
    
    console.log('📤 Reenviando offer público a:', data.to);
    io.to(data.to).emit('public-stream-offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  // 📹 PUBLIC → VENDOR: Respuesta del espectador
  socket.on('public-stream-answer', (data) => {
    console.log('📤 Reenviando answer público al vendedor');
    io.to(vendorSocket).emit('public-stream-answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  // 📹 ICE Candidates para stream público
  socket.on('public-stream-ice-candidate', (data) => {
    const target = data.to === 'vendor' ? vendorSocket : data.to;
    if (target) {
      io.to(target).emit('public-stream-ice-candidate', {
        candidate: data.candidate,
        from: socket.id
      });
    }
  });

  // 🏪 VENDEDOR/KIOSK: Genera número para cliente PRESENCIAL en tienda
  socket.on('generate-store-number', () => {
    // Permitir solo desde vendedor o kiosks
    if (socket.id !== vendorSocket && !kioskSockets.includes(socket.id)) {
      return;
    }
    
    const storeClient = {
      id: `store-${nextStoreNumber}`,
      number: nextStoreNumber,
      type: 'in-store',
      joinedAt: new Date(),
      name: `Cliente en Tienda #${nextStoreNumber}`
    };
    
    inStoreQueue.push(storeClient);
    const position = inStoreQueue.length;
    nextStoreNumber++;
    
    // Enviar número al solicitante (vendedor o kiosk)
    socket.emit('store-number-generated', {
      ...storeClient,
      position: position
    });
    
    // Actualizar colas al vendedor si está conectado
    if (vendorSocket) {
      io.to(vendorSocket).emit('queues-updated', {
        inStoreQueue: inStoreQueue,
        onlineQueue: onlineQueue
      });
    }
    
    // Actualizar todos los kiosks
    kioskSockets.forEach(kioskId => {
      io.to(kioskId).emit('queues-updated', {
        inStoreQueue: inStoreQueue,
        onlineQueue: onlineQueue
      });
    });
    
    console.log('🏪 Número presencial generado:', storeClient.number);
  });

  // 🔄 VENDEDOR: Resetear contador de turnos
  socket.on('reset-ticket-counter', () => {
    // Solo permitir desde el vendedor
    if (socket.id !== vendorSocket) {
      return;
    }
    
    // Resetear el contador
    nextStoreNumber = 1;
    
    // Limpiar las colas
    inStoreQueue = [];
    onlineQueue = [];
    activeClient = null;
    
    console.log('🔄 Contador de turnos reseteado a 1');
    
    // Notificar al vendedor
    socket.emit('counter-reset', {
      nextNumber: nextStoreNumber,
      message: 'Contador reseteado exitosamente'
    });
    
    // Actualizar colas al vendedor
    socket.emit('queues-updated', {
      inStoreQueue: inStoreQueue,
      onlineQueue: onlineQueue
    });
    
    // Actualizar todos los kiosks
    kioskSockets.forEach(kioskId => {
      io.to(kioskId).emit('queues-updated', {
        inStoreQueue: inStoreQueue,
        onlineQueue: onlineQueue
      });
    });
    
    // Notificar a todos los clientes online que fueron desconectados
    onlineQueue.forEach(client => {
      io.to(client.id).emit('queue-reset', {
        message: 'El sistema ha sido reiniciado. Por favor, vuelve a unirte.'
      });
    });
  });

  // 🌐 CLIENTE ONLINE: Se une a la cola de videollamada
  socket.on('client-join-online', (data) => {
    // Solo permitir unirse si el vendedor está en vivo
    if (!isVendorLive) {
      socket.emit('vendor-not-live');
      return;
    }
    
    // Asignar número de turno único (compartido entre presencial y online)
    const onlineClient = {
      id: socket.id,
      name: data.name || 'Cliente Online',
      type: 'online',
      phone: data.phone || '',
      joinedAt: new Date(),
      position: onlineQueue.length + 1,
      ticketNumber: nextStoreNumber  // Número de turno único
    };
    
    onlineQueue.push(onlineClient);
    nextStoreNumber++;  // Incrementar para el siguiente turno (presencial u online)
    
    // Notificar al cliente su posición en la cola ONLINE y su número de turno
    socket.emit('queue-position', {
      position: onlineClient.position,
      ticketNumber: onlineClient.ticketNumber,
      onlineQueueLength: onlineQueue.length,
      inStoreQueueLength: inStoreQueue.length,
      totalWaiting: inStoreQueue.length + onlineQueue.length,
      type: 'online'
    });
    
    // Notificar al vendedor sobre el nuevo cliente online
    if (vendorSocket) {
      io.to(vendorSocket).emit('queues-updated', {
        inStoreQueue: inStoreQueue,
        onlineQueue: onlineQueue
      });
      io.to(vendorSocket).emit('new-online-client', {
        name: onlineClient.name,
        position: onlineClient.position,
        ticketNumber: onlineClient.ticketNumber
      });
    }
    
    console.log('🌐 Cliente ONLINE en cola:', onlineClient.name, '- Posición:', onlineClient.position, '- Turno #', onlineClient.ticketNumber);
  });

  // Cliente solicita estado del vendedor
  socket.on('check-vendor-status', () => {
    console.log('Cliente solicita estado del vendedor:', isVendorLive);
    socket.emit('vendor-status-changed', { isLive: isVendorLive });
  });

  // ⚠️ DEPRECATED: Mantenido por compatibilidad
  // Cliente se conecta y entra en la cola (OLD VERSION)
  socket.on('client-join', (data) => {
    // Redirigir al nuevo sistema
    socket.emit('please-use-client-join-online');
    console.warn('⚠️ Cliente usando evento antiguo "client-join". Debería usar "client-join-online".');
  });

  // 🎯 VENDEDOR: Acepta SIGUIENTE cliente (prioridad: tienda > online)
  socket.on('accept-next-client', () => {
    if (socket.id !== vendorSocket) return;
    
    let nextClient = null;
    let queueType = null;
    
    // PRIORIDAD 1: Clientes presenciales primero
    if (inStoreQueue.length > 0) {
      nextClient = inStoreQueue.shift();
      queueType = 'in-store';
      console.log('🏪 Atendiendo cliente PRESENCIAL:', nextClient.number);
    }
    // PRIORIDAD 2: Si no hay presenciales, atender online
    else if (onlineQueue.length > 0) {
      nextClient = onlineQueue.shift();
      queueType = 'online';
      console.log('🌐 Atendiendo cliente ONLINE:', nextClient.name);
    }
    
    // Si no hay nadie en ninguna cola
    if (!nextClient) {
      socket.emit('no-clients');
      return;
    }
    
    // Terminar conexión actual si existe
    if (activeClient) {
      if (activeClient.type === 'online') {
        io.to(activeClient.id).emit('call-ended');
      }
    }
    
    activeClient = nextClient;
    
    // Si es cliente ONLINE, establecer videollamada
    if (queueType === 'online') {
      io.to(nextClient.id).emit('call-accepted');
    }
    
    // Notificar al vendedor qué tipo de cliente está atendiendo
    socket.emit('client-accepted', {
      ...activeClient,
      queueType: queueType
    });
    
    // Actualizar posiciones en cola ONLINE
    onlineQueue.forEach((client, index) => {
      client.position = index + 1;
      io.to(client.id).emit('queue-position', {
        position: client.position,
        ticketNumber: client.ticketNumber,  // Incluir número de turno
        onlineQueueLength: onlineQueue.length,
        inStoreQueueLength: inStoreQueue.length,
        totalWaiting: inStoreQueue.length + onlineQueue.length,
        type: 'online'
      });
    });
    
    // Actualizar ambas colas al vendedor
    io.to(vendorSocket).emit('queues-updated', {
      inStoreQueue: inStoreQueue,
      onlineQueue: onlineQueue
    });
    
    console.log('Cliente aceptado. Tipo:', queueType, '| Quedan:', inStoreQueue.length, 'presenciales +', onlineQueue.length, 'online');
  });

  // 🏪 VENDEDOR: Acepta específicamente un cliente PRESENCIAL
  socket.on('accept-store-client', (data) => {
    if (socket.id !== vendorSocket) return;
    
    const clientIndex = inStoreQueue.findIndex(c => c.id === data.clientId);
    if (clientIndex === -1) {
      socket.emit('client-not-found');
      return;
    }
    
    // Terminar conexión actual si existe
    if (activeClient && activeClient.type === 'online') {
      io.to(activeClient.id).emit('call-ended');
    }
    
    activeClient = inStoreQueue.splice(clientIndex, 1)[0];
    
    socket.emit('client-accepted', {
      ...activeClient,
      queueType: 'in-store'
    });
    
    io.to(vendorSocket).emit('queues-updated', {
      inStoreQueue: inStoreQueue,
      onlineQueue: onlineQueue
    });
    
    console.log('🏪 Cliente presencial aceptado manualmente:', activeClient.number);
  });

  // 🌐 VENDEDOR: Acepta específicamente un cliente ONLINE
  socket.on('accept-online-client', (data) => {
    if (socket.id !== vendorSocket) return;
    
    const clientIndex = onlineQueue.findIndex(c => c.id === data.clientId);
    if (clientIndex === -1) {
      socket.emit('client-not-found');
      return;
    }
    
    // Terminar conexión actual si existe
    if (activeClient) {
      if (activeClient.type === 'online') {
        io.to(activeClient.id).emit('call-ended');
      }
    }
    
    activeClient = onlineQueue.splice(clientIndex, 1)[0];
    
    io.to(activeClient.id).emit('call-accepted');
    
    socket.emit('client-accepted', {
      ...activeClient,
      queueType: 'online'
    });
    
    // Actualizar posiciones
    onlineQueue.forEach((client, index) => {
      client.position = index + 1;
      io.to(client.id).emit('queue-position', {
        position: client.position,
        ticketNumber: client.ticketNumber,  // Incluir número de turno
        onlineQueueLength: onlineQueue.length,
        inStoreQueueLength: inStoreQueue.length,
        totalWaiting: inStoreQueue.length + onlineQueue.length,
        type: 'online'
      });
    });
    
    io.to(vendorSocket).emit('queues-updated', {
      inStoreQueue: inStoreQueue,
      onlineQueue: onlineQueue
    });
    
    console.log('🌐 Cliente online aceptado manualmente:', activeClient.name);
  });

  // Vendedor rechaza/termina llamada actual
  socket.on('end-call', () => {
    if (socket.id !== vendorSocket) return;
    
    if (activeClient) {
      io.to(activeClient.id).emit('call-ended');
      activeClient = null;
      socket.emit('call-ended-confirm');
    }
  });

  // Cliente termina la llamada
  socket.on('client-leave-call', () => {
    console.log('👋 Cliente terminó la llamada:', socket.id);
    
    if (activeClient && activeClient.id === socket.id) {
      // Notificar al vendedor
      if (vendorSocket) {
        io.to(vendorSocket).emit('client-disconnected');
      }
      activeClient = null;
    }
  });

  // Señalización WebRTC
  socket.on('webrtc-offer', (data) => {
    io.to(data.to).emit('webrtc-offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  socket.on('webrtc-answer', (data) => {
    io.to(data.to).emit('webrtc-answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    io.to(data.to).emit('webrtc-ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  // Crear pedido durante la llamada
  socket.on('create-order', (orderData) => {
    const order = {
      id: uuidv4(),
      ...orderData,
      timestamp: new Date(),
      status: 'pending'
    };
    orders.push(order);
    
    socket.emit('order-created', order);
    if (vendorSocket) {
      io.to(vendorSocket).emit('order-created', order);
    }
    
    console.log('Pedido creado:', order.id);
  });

  // Desconexión
  socket.on('disconnect', () => {
    console.log('Desconexión:', socket.id);
    
    // Si es un kiosk
    const kioskIndex = kioskSockets.indexOf(socket.id);
    if (kioskIndex !== -1) {
      kioskSockets.splice(kioskIndex, 1);
      console.log('🖥️ Kiosk desconectado:', socket.id);
    }
    
    // Si es el vendedor
    if (socket.id === vendorSocket) {
      vendorSocket = null;
      isVendorLive = false;
      io.emit('vendor-status-changed', { isLive: false });
      
      // Notificar a todos los clientes ONLINE
      onlineQueue.forEach(client => {
        io.to(client.id).emit('vendor-disconnected');
      });
      
      if (activeClient && activeClient.type === 'online') {
        io.to(activeClient.id).emit('vendor-disconnected');
      }
    }
    
    // Si es un cliente ONLINE en la cola
    const onlineIndex = onlineQueue.findIndex(c => c.id === socket.id);
    if (onlineIndex !== -1) {
      onlineQueue.splice(onlineIndex, 1);
      
      // Actualizar posiciones de clientes online
      onlineQueue.forEach((client, index) => {
        client.position = index + 1;
        io.to(client.id).emit('queue-position', {
          position: client.position,
          onlineQueueLength: onlineQueue.length,
          inStoreQueueLength: inStoreQueue.length,
          totalWaiting: inStoreQueue.length + onlineQueue.length,
          type: 'online'
        });
      });
      
      if (vendorSocket) {
        io.to(vendorSocket).emit('queues-updated', {
          inStoreQueue: inStoreQueue,
          onlineQueue: onlineQueue
        });
      }
    }
    
    // Si es el cliente activo
    if (activeClient && activeClient.id === socket.id) {
      activeClient = null;
      if (vendorSocket) {
        io.to(vendorSocket).emit('client-disconnected');
      }
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

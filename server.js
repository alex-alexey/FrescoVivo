const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static('public'));

// Estado de la aplicación
let vendorSocket = null;
let isVendorLive = false; // Estado de transmisión del vendedor
let clientQueue = []; // Cola de clientes esperando
let activeClient = null; // Cliente actualmente conectado con el vendedor
let orders = []; // Pedidos realizados

// Rutas HTTP
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/vendor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vendor.html'));
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
    vendorSocket = socket.id;
    socket.emit('vendor-connected', {
      queue: clientQueue,
      activeClient: activeClient,
      isLive: isVendorLive
    });
    console.log('Vendedor conectado:', socket.id);
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
    console.log('>>> isVendorLive ahora es:', isVendorLive);
    console.log('>>> Emitiendo vendor-status-changed a TODOS los clientes');
    io.emit('vendor-status-changed', { isLive: true });
    console.log('>>> Evento emitido exitosamente');
  });

  // Vendedor detiene transmisión
  socket.on('vendor-stop-live', () => {
    if (socket.id !== vendorSocket) return;
    isVendorLive = false;
    console.log('Vendedor fuera de línea - emitiendo a todos los clientes');
    io.emit('vendor-status-changed', { isLive: false });
  });

  // Cliente solicita estado del vendedor
  socket.on('check-vendor-status', () => {
    console.log('Cliente solicita estado del vendedor:', isVendorLive);
    socket.emit('vendor-status-changed', { isLive: isVendorLive });
  });

  // Cliente se conecta y entra en la cola
  socket.on('client-join', (data) => {
    // Solo permitir unirse si el vendedor está en vivo
    if (!isVendorLive) {
      socket.emit('vendor-not-live');
      return;
    }
    
    const client = {
      id: socket.id,
      name: data.name || 'Cliente Anónimo',
      joinedAt: new Date(),
      position: clientQueue.length + 1
    };
    
    clientQueue.push(client);
    
    // Notificar al cliente su posición
    socket.emit('queue-position', {
      position: client.position,
      queueLength: clientQueue.length
    });
    
    // Notificar al vendedor sobre el nuevo cliente
    if (vendorSocket) {
      io.to(vendorSocket).emit('queue-updated', clientQueue);
      // Notificación especial de nuevo cliente
      io.to(vendorSocket).emit('new-client-joined', {
        name: client.name,
        position: client.position,
        queueLength: clientQueue.length
      });
    }
    
    console.log('Cliente en cola:', client.name, '- Posición:', client.position);
  });

  // Vendedor acepta al siguiente cliente
  socket.on('accept-next-client', () => {
    if (socket.id !== vendorSocket) return;
    
    if (clientQueue.length === 0) {
      socket.emit('no-clients');
      return;
    }
    
    // Terminar conexión actual si existe
    if (activeClient) {
      io.to(activeClient.id).emit('call-ended');
    }
    
    // Tomar el siguiente cliente de la cola
    activeClient = clientQueue.shift();
    
    // Notificar al cliente que fue aceptado
    io.to(activeClient.id).emit('call-accepted');
    
    // Notificar al vendedor
    socket.emit('client-accepted', activeClient);
    
    // Actualizar posiciones de la cola
    clientQueue.forEach((client, index) => {
      client.position = index + 1;
      io.to(client.id).emit('queue-position', {
        position: client.position,
        queueLength: clientQueue.length
      });
    });
    
    // Actualizar cola del vendedor
    io.to(vendorSocket).emit('queue-updated', clientQueue);
    
    console.log('Cliente aceptado:', activeClient.name);
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
    
    // Si es el vendedor
    if (socket.id === vendorSocket) {
      vendorSocket = null;
      isVendorLive = false;
      io.emit('vendor-status-changed', { isLive: false });
      // Notificar a todos los clientes
      clientQueue.forEach(client => {
        io.to(client.id).emit('vendor-disconnected');
      });
      if (activeClient) {
        io.to(activeClient.id).emit('vendor-disconnected');
      }
    }
    
    // Si es un cliente en la cola
    const queueIndex = clientQueue.findIndex(c => c.id === socket.id);
    if (queueIndex !== -1) {
      clientQueue.splice(queueIndex, 1);
      
      // Actualizar posiciones
      clientQueue.forEach((client, index) => {
        client.position = index + 1;
        io.to(client.id).emit('queue-position', {
          position: client.position,
          queueLength: clientQueue.length
        });
      });
      
      if (vendorSocket) {
        io.to(vendorSocket).emit('queue-updated', clientQueue);
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
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel de vendedor: http://localhost:${PORT}/vendor`);
  console.log(`Panel de cliente: http://localhost:${PORT}/`);
});

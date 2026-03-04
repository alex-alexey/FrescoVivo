# 🏪🌐 Sistema de Doble Cola - FrescosEnVivo

## Concepto

El sistema implementa **dos colas separadas** para gestionar dos tipos de clientes diferentes:

```
┌─────────────────────────────────────────────────────────────┐
│                    SISTEMA DE DOBLE COLA                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│   COLA PRESENCIAL    │         │    COLA ONLINE       │
│   🏪 En Tienda       │         │    🌐 Videollamada   │
├──────────────────────┤         ├──────────────────────┤
│ #1 Cliente Tienda    │         │ Ana García           │
│ #2 Cliente Tienda    │         │ Jordi Puig           │
│ #3 Cliente Tienda    │         │ Marta López          │
└──────────────────────┘         └──────────────────────┘
         │                                 │
         │        PRIORIDAD: 🏪 > 🌐      │
         │                                 │
         └─────────────┬───────────────────┘
                       ▼
              ┌─────────────────┐
              │    VENDEDOR     │
              │    Miguel       │
              └─────────────────┘
```

---

## 🏪 Cola Presencial (In-Store Queue)

### ¿Qué es?
Clientes que están **físicamente en la pescadería** y cogen un número.

### Flujo:
1. Cliente llega a la tienda
2. Miguel presiona un botón en el panel del vendedor
3. Se genera un **número consecutivo** (1, 2, 3...)
4. El cliente espera su turno físicamente en la tienda
5. Miguel lo atiende cuando le toca

### Características:
- ✅ **No necesitan videollamada** (están ahí físicamente)
- ✅ **Tienen PRIORIDAD** sobre clientes online
- ✅ **Números consecutivos**: #1, #2, #3, etc.
- ✅ **No se desconectan** (no dependen de Socket.IO)

### Eventos Socket.IO:

```javascript
// VENDEDOR: Generar número para cliente en tienda
socket.emit('generate-store-number');

// RESPUESTA: Número generado
socket.on('store-number-generated', (client) => {
  console.log('Número:', client.number);
  // Mostrar en pantalla o imprimir ticket
});
```

---

## 🌐 Cola Online (Online Queue)

### ¿Qué es?
Clientes que se conectan desde **internet** para hacer una videollamada.

### Flujo:
1. Cliente abre la web desde casa
2. Introduce su nombre (y opcionalmente WhatsApp)
3. Se une a la cola online
4. Espera su turno viendo su posición en tiempo real
5. Cuando Miguel lo acepta, inicia la videollamada HD con 4 cámaras

### Características:
- ✅ **Videollamada WebRTC** con 4 cámaras
- ✅ **Posición en tiempo real** actualizada automáticamente
- ✅ **Prioridad DESPUÉS** de clientes presenciales
- ✅ **Notificación** cuando el vendedor los acepta

### Eventos Socket.IO:

```javascript
// CLIENTE: Unirse a la cola online
socket.emit('client-join-online', {
  name: 'Ana García',
  phone: '+34 612 345 678' // opcional
});

// RESPUESTA: Posición en cola
socket.on('queue-position', (data) => {
  console.log('Posición online:', data.position);
  console.log('Clientes online:', data.onlineQueueLength);
  console.log('Clientes en tienda:', data.inStoreQueueLength);
  console.log('Total esperando:', data.totalWaiting);
});

// Cuando el vendedor te acepta
socket.on('call-accepted', () => {
  console.log('¡Es tu turno! Iniciando videollamada...');
});
```

---

## ⚖️ Sistema de Prioridades

### Regla Principal:
**Los clientes presenciales SIEMPRE tienen prioridad sobre los online.**

### Lógica de Atención:

```
1. ¿Hay clientes en TIENDA?
   ├─ SÍ → Atender al siguiente de tienda (🏪 PRIORIDAD)
   └─ NO → ¿Hay clientes ONLINE?
            ├─ SÍ → Atender al siguiente online
            └─ NO → Sin clientes, esperar
```

### Ejemplo Práctico:

```
Cola Tienda:  [#1, #2, #3]
Cola Online:  [Ana, Jordi, Marta]

Orden de atención:
1. Cliente #1 (tienda) 🏪
2. Cliente #2 (tienda) 🏪
3. Cliente #3 (tienda) 🏪
4. Ana (online) 🌐
5. Jordi (online) 🌐
6. Marta (online) 🌐
```

### ¿Por qué esta prioridad?

1. **Experiencia del cliente**: Quien se desplaza físicamente merece prioridad
2. **Eficiencia**: Clientes en tienda están esperando ahí, no pueden hacer otra cosa
3. **Flexibilidad online**: Clientes online pueden esperar desde casa mientras hacen otras cosas

---

## 🎛️ Panel del Vendedor

### Vista de Colas:

```
┌────────────────────────────────────────────┐
│         PANEL DE VENDEDOR - MIGUEL         │
├────────────────────────────────────────────┤
│                                            │
│  🏪 COLA PRESENCIAL (Tienda)              │
│  ┌──────────────────────────────────────┐ │
│  │ #1 - Cliente en Tienda               │ │
│  │ #2 - Cliente en Tienda               │ │
│  │ #3 - Cliente en Tienda               │ │
│  └──────────────────────────────────────┘ │
│  [+ Generar Nuevo Número]                 │
│                                            │
│  🌐 COLA ONLINE (Videollamada)            │
│  ┌──────────────────────────────────────┐ │
│  │ Ana García - 10:45h                  │ │
│  │ Jordi Puig - 10:47h                  │ │
│  │ Marta López - 10:50h                 │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  [Aceptar Siguiente] ← Automático         │
│  [Aceptar Cliente Tienda] ← Manual        │
│  [Aceptar Cliente Online] ← Manual        │
│                                            │
└────────────────────────────────────────────┘
```

### Funciones:

1. **Generar Número** (para cliente presencial)
   ```javascript
   socket.emit('generate-store-number');
   ```

2. **Aceptar Siguiente** (automático con prioridad)
   ```javascript
   socket.emit('accept-next-client');
   // Acepta primero tienda, luego online
   ```

3. **Aceptar Cliente Específico de Tienda**
   ```javascript
   socket.emit('accept-store-client', { clientId: 'store-5' });
   ```

4. **Aceptar Cliente Específico Online**
   ```javascript
   socket.emit('accept-online-client', { clientId: 'socket-abc123' });
   ```

---

## 📊 Estado de las Colas

### Estructura de Datos:

```javascript
// Cola Presencial
inStoreQueue = [
  {
    id: 'store-1',
    number: 1,
    type: 'in-store',
    joinedAt: Date,
    name: 'Cliente en Tienda #1'
  },
  {
    id: 'store-2',
    number: 2,
    type: 'in-store',
    joinedAt: Date,
    name: 'Cliente en Tienda #2'
  }
];

// Cola Online
onlineQueue = [
  {
    id: 'socket-xyz789',
    name: 'Ana García',
    type: 'online',
    phone: '+34 612 345 678',
    joinedAt: Date,
    position: 1
  },
  {
    id: 'socket-abc123',
    name: 'Jordi Puig',
    type: 'online',
    phone: '',
    joinedAt: Date,
    position: 2
  }
];

// Cliente actualmente atendido
activeClient = {
  id: 'store-1',
  number: 1,
  type: 'in-store', // o 'online'
  name: 'Cliente en Tienda #1',
  joinedAt: Date
};
```

---

## 🔄 Actualización en Tiempo Real

### Para Clientes Online:

Cada vez que cambia la cola, se actualiza automáticamente:

```javascript
socket.on('queue-position', (data) => {
  // Actualizar UI
  document.getElementById('position').textContent = data.position;
  document.getElementById('online-waiting').textContent = data.onlineQueueLength;
  document.getElementById('store-waiting').textContent = data.inStoreQueueLength;
  document.getElementById('total-waiting').textContent = data.totalWaiting;
});
```

### Para Vendedor:

```javascript
socket.on('queues-updated', (data) => {
  // data.inStoreQueue = Array de clientes en tienda
  // data.onlineQueue = Array de clientes online
  renderQueues(data);
});

socket.on('new-online-client', (data) => {
  // Notificación: Nuevo cliente online
  showNotification(`${data.name} se ha unido a la cola online`);
});
```

---

## 🎯 Casos de Uso

### Caso 1: Día Tranquilo
```
Tienda: []
Online: [Ana, Jordi]

→ Miguel acepta siguiente
→ Ana inicia videollamada ✅
```

### Caso 2: Tienda Llena
```
Tienda: [#1, #2, #3]
Online: [Ana, Jordi]

→ Miguel acepta siguiente
→ Cliente #1 es atendido 🏪
→ Cliente #2 es atendido 🏪
→ Cliente #3 es atendido 🏪
→ Ana inicia videollamada 🌐
```

### Caso 3: Llega Cliente a Tienda Durante Videollamada Online
```
Atendiendo: Ana (online) 🌐
Nueva acción: Cliente llega a tienda

1. Miguel genera número → #1
2. Cliente #1 entra en cola de tienda
3. Miguel termina con Ana
4. Miguel acepta siguiente
5. Cliente #1 tiene prioridad → es atendido 🏪
```

### Caso 4: Selección Manual
```
Tienda: [#1, #2, #3]
Online: [Ana, Jordi, Marta]

Miguel decide atender específicamente a #3:
→ socket.emit('accept-store-client', { clientId: 'store-3' })
→ Cliente #3 es atendido (saltando #1 y #2)
```

---

## 📱 Interfaz de Usuario

### Cliente Online (Web):

```html
<div class="queue-status">
  <h2>Tu Posición en la Cola</h2>
  
  <div class="big-number">
    <span id="position">2</span>
  </div>
  
  <div class="queue-info">
    <p>🌐 Clientes online esperando: <strong id="online-waiting">2</strong></p>
    <p>🏪 Clientes en tienda: <strong id="store-waiting">3</strong></p>
    <p>📊 Total esperando: <strong id="total-waiting">5</strong></p>
  </div>
  
  <div class="priority-notice">
    ⚠️ Los clientes en tienda tienen prioridad.
    Serás atendido después de ellos.
  </div>
  
  <div class="estimated-wait">
    ⏱️ Tiempo estimado: ~8 minutos
  </div>
</div>
```

### Vendedor (Panel de Control):

```html
<div class="vendor-panel">
  <!-- Cola Tienda -->
  <div class="queue-section">
    <h3>🏪 Cola Presencial</h3>
    <button onclick="generateNumber()">+ Generar Número</button>
    <ul id="store-queue">
      <li>#1 - Cliente en Tienda <button>Atender</button></li>
      <li>#2 - Cliente en Tienda <button>Atender</button></li>
    </ul>
  </div>
  
  <!-- Cola Online -->
  <div class="queue-section">
    <h3>🌐 Cola Online</h3>
    <ul id="online-queue">
      <li>Ana García (10:45h) <button>Atender</button></li>
      <li>Jordi Puig (10:47h) <button>Atender</button></li>
    </ul>
  </div>
  
  <!-- Botón principal -->
  <button class="big-button" onclick="acceptNext()">
    Aceptar Siguiente Cliente
    (Prioridad: Tienda → Online)
  </button>
</div>
```

---

## 🔐 Seguridad y Validaciones

### Validaciones Implementadas:

1. **Solo el vendedor** puede generar números
2. **Solo el vendedor** puede aceptar clientes
3. Clientes online **solo pueden unirse si el vendedor está en vivo**
4. No se pueden duplicar clientes en la cola
5. Desconexiones se manejan automáticamente

---

## 📈 Métricas y Analytics

### Datos que se pueden rastrear:

```javascript
// Tiempo promedio de espera
averageWaitTime = {
  inStore: calculateAverage(inStoreQueue),
  online: calculateAverage(onlineQueue)
};

// Clientes atendidos por hora
clientsPerHour = {
  inStore: countServed(inStoreQueue, 'hour'),
  online: countServed(onlineQueue, 'hour')
};

// Tasa de conversión
conversionRate = {
  inStore: (ordersFromStore / totalStoreClients) * 100,
  online: (ordersFromOnline / totalOnlineClients) * 100
};
```

---

## 🚀 Ventajas del Sistema

### Para el Negocio:
- ✅ **No perder clientes presenciales** por atender online
- ✅ **Expandir alcance** con clientes remotos
- ✅ **Mejor gestión** de flujo de clientes
- ✅ **Datos y métricas** de ambos canales

### Para Clientes Presenciales:
- ✅ **Prioridad garantizada**
- ✅ **Sistema de números claro**
- ✅ **No hay sorpresas** (no pierden su turno)

### Para Clientes Online:
- ✅ **Comprar desde casa**
- ✅ **Ver posición en tiempo real**
- ✅ **Flexibilidad** (pueden hacer otras cosas mientras esperan)
- ✅ **Ver el producto** antes de comprar con 4 cámaras HD

---

## 🛠️ Implementación Técnica

### Backend (server.js):
- ✅ Dos arrays separados: `inStoreQueue` y `onlineQueue`
- ✅ Lógica de prioridad en `accept-next-client`
- ✅ Eventos específicos para cada tipo de cola
- ✅ Actualización en tiempo real vía Socket.IO

### Frontend (negocio.html):
- ✅ Modal para unirse a cola online
- ✅ Vista de posición con desglose de ambas colas
- ✅ Notificación cuando es aceptado

### Frontend (vendor.html):
- ✅ Dos secciones de cola diferenciadas
- ✅ Botón para generar números presenciales
- ✅ Botones para aceptar siguiente o específico
- ✅ Indicadores visuales de tipo de cliente

---

## 📞 Próximos Pasos

### Mejoras Sugeridas:

1. **Sistema de Notificaciones**
   - SMS/WhatsApp cuando faltan 2 clientes
   - Notificación push cuando es tu turno

2. **Pantalla en Tienda**
   - Monitor mostrando números actuales
   - "Ahora atendiendo: #5"

3. **Estadísticas Avanzadas**
   - Dashboard con métricas en tiempo real
   - Reportes diarios/semanales

4. **Sistema de Reservas**
   - Reservar turno online con hora específica
   - Evitar esperas largas

5. **Impresora de Tickets**
   - Imprimir número automáticamente
   - Con QR para seguimiento

---

## 🎉 Conclusión

El sistema de doble cola permite a la Pescadería Miguel:

- 🏪 Atender clientes presenciales eficientemente
- 🌐 Expandir su negocio a clientes remotos
- ⚖️ Balancear ambos canales con prioridades claras
- 📊 Recopilar datos valiosos de ambos tipos de clientes

**Todo sin perder la esencia del negocio tradicional, pero aprovechando la tecnología moderna.** 🚀

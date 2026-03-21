# 📹 Sistema de Cámaras Multi-Tenant - FrescosEnVivo

## 🎯 Concepto

Cada cliente tiene sus propias cámaras completamente aisladas de otros clientes.

## 🏗️ Arquitectura

### Por Cliente:
```
Cliente A (demo.localhost)
├── Cámara 1 (Principal) - ID único: cam_clientA_uuid1
├── Cámara 2 (Productos) - ID único: cam_clientA_uuid2
├── Cámara 3 (Entrada)   - ID único: cam_clientA_uuid3
└── Cámara 4 (Caja)      - ID único: cam_clientA_uuid4

Cliente B (demo2.localhost)
├── Cámara 1 (Principal) - ID único: cam_clientB_uuid1
├── Cámara 2 (Productos) - ID único: cam_clientB_uuid2
└── [...]
```

### Identificación:
- **clientId**: Vincula la cámara al cliente
- **cameraId**: Identificador único global para WebRTC
- **position**: Orden de visualización (1-4)

## 📡 Flujo de Conexión de Cámaras

### 1. **Configuración Inicial** (Admin Panel)

```
Cliente accede a: demo.localhost/admin-panel.html
→ Sección "Cámaras"
→ Añadir nueva cámara
  - Nombre: "Cámara principal"
  - Posición: 1
  - Tipo: webcam/ip/rtsp
```

### 2. **Vendedor Inicia Streaming**

```
Vendedor accede a: demo.localhost/vendor.html
→ Click "Iniciar venta"
→ Sistema detecta cámaras configuradas del cliente
→ Solicita permisos de webcam/micrófono
→ Establece conexión WebRTC con señalización por clientId
```

### 3. **Cliente Ve las Cámaras**

```
Cliente final accede a: demo.localhost/tienda.html
→ Sistema carga cámaras activas del cliente (clientId)
→ Muestra solo las cámaras en vivo de ESE negocio
→ WebRTC peer-to-peer con identificación por cameraId
```

## 🔧 APIs Disponibles

### Para Administrador del Negocio:

#### Obtener cámaras
```javascript
GET /api/cameras
Headers: { Cookie: session }
Response: { cameras: [...] }
```

#### Crear cámara
```javascript
POST /api/cameras
Body: {
  name: "Cámara Principal",
  position: 1,
  type: "webcam"
}
```

#### Actualizar cámara
```javascript
PUT /api/cameras/:id
Body: {
  name: "Nueva nombre",
  isActive: true
}
```

#### Configurar streaming
```javascript
PUT /api/cameras/:id/stream-config
Body: {
  resolution: "hd",
  fps: 30,
  bitrate: 2000
}
```

#### Iniciar/Detener streaming
```javascript
POST /api/cameras/:id/start
POST /api/cameras/:id/stop
```

### Para Clientes (Público):

#### Ver cámaras activas
```javascript
GET /api/cameras/active
Response: { cameras: [solo cámaras activas del cliente actual] }
```

#### Ver cámaras en vivo
```javascript
GET /api/cameras/live
Response: { cameras: [solo cámaras streaming del cliente actual] }
```

## 🎨 Configuración Avanzada

### Por Cámara:
```javascript
{
  // Información básica
  name: "Cámara Principal",
  description: "Vista general del mostrador",
  position: 1,
  
  // Streaming
  streamConfig: {
    resolution: "medium", // low/medium/high/hd
    fps: 30,
    bitrate: 1500 // kbps
  },
  
  // Visibilidad
  settings: {
    showInStore: true,      // Mostrar en tienda pública
    showInVendor: true,     // Mostrar en panel vendedor
    autoStart: false,       // Iniciar automáticamente
    enableAudio: true       // Habilitar audio
  },
  
  // Estadísticas
  stats: {
    totalViews: 0,
    totalStreamTime: 0,     // minutos
    currentViewers: 0
  }
}
```

## 🔐 Seguridad

### Aislamiento por Tenant:
1. **Middleware**: `tenantMiddleware` identifica al cliente por dominio
2. **Query Scope**: Todas las queries incluyen `clientId`
3. **Verificación**: No se puede acceder a cámaras de otros clientes

### Control de Acceso:
```javascript
// Solo admin del negocio puede gestionar
router.put('/cameras/:id', auth, isAdmin, ...)

// Público puede ver activas
router.get('/cameras/active', ...)  // Sin auth
```

## 📊 Estadísticas

### Por Cámara:
- **Vistas totales**: Contador de visualizaciones
- **Tiempo streaming**: Minutos totales en vivo
- **Espectadores actuales**: Viewers en tiempo real
- **Última actividad**: Fechas inicio/fin stream

## 🚀 Implementación en el Panel

### Sección de Cámaras (`admin-panel.html`):

```html
<div id="cameras" class="content-section">
  <div class="card">
    <h2>Gestión de Cámaras</h2>
    <button onclick="addCamera()">➕ Añadir cámara</button>
    
    <div id="cameras-list">
      <!-- Lista de cámaras del cliente -->
    </div>
  </div>
</div>
```

### JavaScript:
```javascript
async function loadCameras() {
  const response = await fetch('/api/cameras');
  const data = await response.json();
  
  // Renderizar cámaras del cliente actual
  renderCameras(data.cameras);
}

async function startCamera(cameraId) {
  await fetch(`/api/cameras/${cameraId}/start`, {
    method: 'POST'
  });
}
```

## 🎥 Integración con WebRTC

### Señalización por Canal:
```javascript
// Socket.IO room por cliente
socket.join(`client_${clientId}`);

// Eventos de cámara
socket.on('camera-offer', ({ cameraId, offer }) => {
  // Solo enviar a clientes del mismo tenant
  socket.to(`client_${clientId}`).emit('camera-offer', ...);
});
```

## ⚙️ Configuración por Tipo de Cámara

### Webcam (Por Defecto):
```javascript
{
  type: "webcam",
  // Usa navigator.mediaDevices.getUserMedia()
}
```

### Cámara IP:
```javascript
{
  type: "ip",
  streamConfig: {
    url: "rtsp://192.168.1.100/stream",
    protocol: "rtsp"
  }
}
```

### Cámara USB:
```javascript
{
  type: "usb",
  deviceInfo: {
    deviceId: "abc123...",
    label: "Logitech C920"
  }
}
```

## 📝 Ejemplo de Uso Completo

### 1. Cliente crea su negocio en Super Admin
```
Super Admin → Crear cliente "Pescadería Juan"
→ Dominio: pescaderiajuan.com
→ Se crea clientId: abc123
```

### 2. Admin del negocio configura cámaras
```
pescaderiajuan.com/login.html → Login
→ admin-panel.html → Cámaras
→ Añadir cámara (position: 1, name: "Principal")
→ Se crea: cameraId = cam_abc123_uuid1
```

### 3. Vendedor inicia streaming
```
pescaderiajuan.com/vendor.html
→ Iniciar venta
→ Sistema detecta cámara con clientId=abc123
→ Inicia WebRTC con cameraId=cam_abc123_uuid1
```

### 4. Clientes ven el streaming
```
pescaderiajuan.com/tienda.html
→ Sistema carga cámaras del clientId=abc123
→ Solo ve cámaras de Pescadería Juan
→ NO ve cámaras de otros negocios
```

## 🔄 Estado de las Cámaras

### Estados posibles:
```
INACTIVE → isActive: false (Cámara desactivada)
ACTIVE   → isActive: true, isLive: false (Configurada pero no streaming)
LIVE     → isActive: true, isLive: true (Transmitiendo en vivo)
```

## ✅ Ventajas del Sistema

1. **Aislamiento Total**: Cada cliente solo ve y gestiona sus cámaras
2. **Escalabilidad**: Añadir clientes no afecta a otros
3. **Flexibilidad**: Cada cliente configura a su medida
4. **Estadísticas**: Métricas independientes por negocio
5. **Seguridad**: Imposible acceder a cámaras de otros tenants

---

**Estado**: ✅ Modelo y APIs creados, falta integración en UI del panel

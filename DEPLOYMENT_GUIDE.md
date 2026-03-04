# 🚀 Guía de Despliegue en Render

## 📌 Resumen: Conexión de Cámaras en Producción

### ¿Dónde se conectan las cámaras?

**Las cámaras se conectan SIEMPRE desde el dispositivo físico del vendedor**, no desde el servidor Render.

```
┌─────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA DEL SISTEMA                  │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│   VENDEDOR           │         │   SERVIDOR RENDER    │
│  (Pescadería)        │         │   (Node.js + Socket) │
│                      │         │                      │
│  🎥 4 Cámaras USB   │◄────────►│  Coordina            │
│  💻 PC/Laptop        │  HTTPS  │  conexiones          │
│  🌐 Navegador        │         │  (Signaling)         │
└──────────────────────┘         └──────────────────────┘
         │                                  ▲
         │ WebRTC (P2P)                    │ Socket.IO
         │ Video directo                    │
         ▼                                  │
┌──────────────────────┐                   │
│   CLIENTES           │                   │
│  (Compradores)       │───────────────────┘
│  📱 Móvil/PC         │        HTTPS
│  🌐 Navegador        │
└──────────────────────┘
```

---

## ✅ Checklist de Despliegue

### 1. Preparar el Proyecto

#### A. Variables de Entorno en Render

En el dashboard de Render, configura estas variables:

```bash
NODE_ENV=production
PORT=3000  # Render lo asigna automáticamente, pero bueno definirlo
```

#### B. Asegurar que `package.json` tenga el start script

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

### 2. Configurar HTTPS (Automático en Render ✅)

Render proporciona HTTPS automáticamente con certificados SSL gratuitos.

**Importante:** Los navegadores modernos **requieren HTTPS** para acceder a cámaras y micrófonos.

```javascript
// Esto funcionará automáticamente en Render:
https://tu-app.onrender.com/vendor  ✅ Cámaras permitidas
https://tu-app.onrender.com/        ✅ Cámaras permitidas
```

### 3. Configuración WebRTC para NAT/Firewall

Si el vendedor tiene problemas de conectividad (detrás de firewall corporativo, NAT estricto), necesitarás servidores TURN.

#### Opciones de Servidores TURN Gratuitos:

1. **Twilio** (gratuito para desarrollo)
   - https://www.twilio.com/stun-turn

2. **Metered** (plan gratuito disponible)
   - https://www.metered.ca/tools/openrelay/

3. **Google STUN** (solo STUN, no TURN)
   - `stun:stun.l.google.com:19302`

#### Modificar `server.js` para incluir TURN servers:

```javascript
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuración ICE servers para WebRTC
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Añadir TURN servers si necesario:
    // {
    //   urls: 'turn:tu-turn-server.com:3478',
    //   username: process.env.TURN_USERNAME,
    //   credential: process.env.TURN_CREDENTIAL
    // }
  ]
};

// Enviar configuración ICE a los clientes
io.on('connection', (socket) => {
  socket.emit('ice-servers', iceServers);
  // ... resto del código
});
```

---

## 📋 Pasos para Desplegar en Render

### 1. Crear Repositorio en GitHub

```bash
cd /Users/robertalexandru/Documents/Proyectos/Pescadolive/pescadoLive
git init
git add .
git commit -m "Initial commit - LivePescado"
git remote add origin https://github.com/tu-usuario/pescadoLive.git
git push -u origin main
```

### 2. Crear Web Service en Render

1. Ve a https://render.com y crea una cuenta
2. Click en "New +" → "Web Service"
3. Conecta tu repositorio de GitHub
4. Configura:
   - **Name:** `pescadolive`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (o el que prefieras)

### 3. Configurar Variables de Entorno

En Render Dashboard → Environment:

```
NODE_ENV=production
```

### 4. Desplegar

Render desplegará automáticamente cuando hagas push a GitHub.

Tu app estará en: `https://pescadolive.onrender.com`

---

## 🎥 Uso en Producción

### Para el Vendedor:

1. **En la pescadería**, abre: `https://tu-app.onrender.com/vendor`
2. Conecta las 4 cámaras USB al ordenador
3. Haz clic en "Iniciar Cámaras" → El navegador pedirá permisos
4. Acepta los permisos para las 4 cámaras
5. Selecciona la cámara correcta en cada dropdown
6. Click "Iniciar Transmisión"
7. ¡Listo! Los clientes podrán verte en tiempo real

### Para los Clientes:

1. Abren: `https://tu-app.onrender.com`
2. Se unen a la cola
3. Cuando el vendedor los acepta, ven:
   - Video del vendedor
   - 3 vistas diferentes del producto
   - Pueden hacer pedidos

---

## ⚠️ Problemas Comunes y Soluciones

### 1. "No se puede acceder a las cámaras"

**Causa:** El navegador bloquea el acceso sin HTTPS
**Solución:** Asegúrate de usar `https://` (Render lo proporciona automáticamente)

### 2. "El video se congela o no se ve"

**Causa:** Firewall/NAT bloqueando WebRTC
**Solución:** 
- Configura servidores TURN (ver sección anterior)
- Verifica que el firewall permita tráfico UDP
- Prueba desde otra red

### 3. "Solo funciona en localhost, no en Render"

**Causa:** Socket.IO no está configurado correctamente
**Solución:** Verifica que en `client.js` y `vendor.js` la conexión sea:

```javascript
// ❌ MAL (hardcoded localhost)
const socket = io('http://localhost:3000');

// ✅ BIEN (detecta automáticamente)
const socket = io();
```

### 4. "Las cámaras funcionan pero el cliente no ve nada"

**Causa:** WebRTC peer connection falló
**Solución:**
- Revisa la consola del navegador (F12)
- Verifica que ambos usuarios tengan buena conexión
- Configura TURN servers

---

## 🔍 Debugging en Producción

### Ver logs en Render:
1. Render Dashboard → Tu servicio → "Logs"
2. Los `console.log()` del servidor aparecerán ahí

### Ver logs del navegador:
1. Presiona F12 en el navegador
2. Pestaña "Console"
3. Verifica errores de WebRTC, Socket.IO, etc.

### Comando útil para probar Socket.IO:
```javascript
// En la consola del navegador (F12)
socket.on('connect', () => console.log('✅ Conectado:', socket.id));
socket.on('disconnect', () => console.log('❌ Desconectado'));
```

---

## 📊 Monitoreo de Rendimiento

### Métricas importantes:

- **Latencia del video:** Debe ser < 2 segundos
- **Calidad del video:** Ajustar según ancho de banda
- **Clientes simultáneos:** El plan gratuito de Render tiene límites

### Optimizaciones:

```javascript
// En vendor.js, ajusta la calidad del video según necesidad:
const stream = await navigator.mediaDevices.getUserMedia({
    video: { 
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280 },    // Reducir a 640 si hay lag
        height: { ideal: 720 },    // Reducir a 480 si hay lag
        frameRate: { ideal: 30 }   // Reducir a 15 si hay lag
    },
    audio: true
});
```

---

## 🎯 Requisitos del Vendedor

### Hardware Mínimo:
- ✅ PC/Laptop con Windows, Mac o Linux
- ✅ 4 cámaras USB (o 1 integrada + 3 USB)
- ✅ Conexión a internet estable (mínimo 10 Mbps upload)
- ✅ Navegador moderno (Chrome/Edge recomendado)

### Ubicación:
- ✅ Puede estar en la pescadería física
- ✅ Puede estar en casa (trabajo remoto)
- ✅ Puede estar en cualquier lugar con internet

**NO necesita** estar en el mismo lugar que el servidor (que está en Render).

---

## 🔐 Seguridad

### Recomendaciones:

1. **Limitar acceso al panel del vendedor:**
   ```javascript
   // Añadir autenticación simple en server.js
   app.get('/vendor', (req, res) => {
     // TODO: Implementar autenticación
     res.sendFile(path.join(__dirname, 'public', 'vendor.html'));
   });
   ```

2. **Rate limiting:**
   ```bash
   npm install express-rate-limit
   ```

3. **CORS específico:**
   ```javascript
   const io = socketIO(server, {
     cors: {
       origin: "https://tu-dominio.com",  // En vez de "*"
       methods: ["GET", "POST"]
     }
   });
   ```

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en Render
2. Verifica la consola del navegador (F12)
3. Comprueba que HTTPS esté activo
4. Testea desde diferentes redes

---

## ✨ Próximos Pasos (Opcional)

- [ ] Añadir autenticación para el vendedor
- [ ] Integrar pasarela de pago (Stripe/PayPal)
- [ ] Base de datos para persistir pedidos
- [ ] Sistema de notificaciones
- [ ] App móvil nativa
- [ ] Analytics y métricas


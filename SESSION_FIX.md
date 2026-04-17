# 🔐 Solución al Problema de Sesiones en Producción

## ❌ Problema Original

```
1. Usuario hace login en /superadmin-login.html
2. Login exitoso → Redirige a /superadmin
3. /superadmin intenta verificar sesión → Error: "No autenticado"
```

**Causa:** MemoryStore no persiste sesiones entre reinicios/instancias en Render

## ✅ Solución Implementada

### 1. MongoDB Session Store

**Instalado:** `connect-mongo`

**Configuración:**
```javascript
app.use(session({
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: 'pescadolive',
    collectionName: 'sessions',
    touchAfter: 24 * 3600,
    ttl: 7 * 24 * 60 * 60,
    autoRemove: 'native'
  }),
  cookie: {
    secure: true,           // HTTPS only en producción
    sameSite: 'none',       // Permitir cross-site
    httpOnly: true,         // No accesible desde JS
    maxAge: 7 días
  }
}));
```

### 2. Ventajas

✅ **Persistencia**: Sesiones sobreviven reinicios
✅ **Escalabilidad**: Funciona con múltiples instancias
✅ **Limpieza automática**: MongoDB elimina sesiones expiradas
✅ **Performance**: No consume memoria del servidor

### 3. Cómo Funciona

```
1. Login → MongoDB guarda sesión en colección 'sessions'
2. Usuario navega → express-session lee sesión desde MongoDB
3. MongoDB mantiene sesión hasta que expire (7 días)
4. Auto-limpieza → MongoDB borra sesiones viejas
```

## 🧪 Testing en Producción

### Paso 1: Esperar Deploy (1-2 min)

Render detectará el push y hará re-deploy automático.

### Paso 2: Verificar Logs

Busca en Render logs:

```
✅ MongoDB conectado
✅ Servicio de email inicializado
Servidor corriendo en http://localhost:10000
```

### Paso 3: Probar Login

1. **Acceder a:** `https://pescadolive.onrender.com/superadmin-login.html`

2. **Credenciales:**
   - Usuario: `admin`
   - Contraseña: `admin123`

3. **Observar logs en Render:**
   ```
   🔐 Intento de login Super Admin
   ✅ Login Super Admin exitoso: admin (admin)
   🔑 Sesión creada: { sessionID: '...', userId: '...', role: 'admin' }
   ```

4. **Redirige a:** `/superadmin`

5. **Verifica en logs:**
   ```
   🔐 Auth middleware: { sessionID: '...', userId: '...', hasSession: true }
   ✅ Usuario autenticado: admin
   ```

### Paso 4: Verificar MongoDB

Puedes ver las sesiones en MongoDB Atlas:

```
Database: pescadolive
Collection: sessions

Documento ejemplo:
{
  _id: "session_id_here",
  expires: ISODate("2026-04-01T..."),
  session: {
    cookie: {...},
    userId: "user_id_here",
    username: "admin",
    role: "admin",
    isSuperAdmin: true
  }
}
```

## 🔍 Debugging

### Si sigue sin funcionar:

#### 1. Verificar Variables de Entorno en Render

```
MONGO_URI=mongodb+srv://... ✅
SESSION_SECRET=... ✅
NODE_ENV=production ✅
```

#### 2. Verificar Cookies en Browser

```
Chrome DevTools → Application → Cookies
Buscar: frescosenvivo.sid

Debe tener:
- Secure: ✅
- HttpOnly: ✅
- SameSite: None
- Domain: pescadolive.onrender.com
```

#### 3. Ver Logs de Sesión

```
Render Logs → Buscar:
"🔐 Auth middleware"
"sessionID"
"userId"
```

#### 4. Problemas Comunes

**Cookie no se guarda:**
- Causa: `secure: true` pero accediendo por HTTP
- Solución: Siempre usa HTTPS en producción

**Session undefined:**
- Causa: MONGO_URI incorrecta
- Solución: Verificar variable en Render

**Error "MongoStore":**
- Causa: connect-mongo no instalado
- Solución: `npm install connect-mongo` (ya hecho)

## 📊 Comparación

### Antes (MemoryStore):

```
❌ Sesiones en RAM del servidor
❌ Se pierden al reiniciar
❌ No funciona con múltiples instancias
❌ Consume memoria del servidor
```

### Ahora (MongoStore):

```
✅ Sesiones en MongoDB
✅ Persisten entre reinicios
✅ Funciona con múltiples instancias
✅ No consume RAM del servidor
✅ Limpieza automática
```

## 🚀 Comandos Útiles

### Ver sesiones en MongoDB:

```javascript
// MongoDB Shell
use pescadolive
db.sessions.find().pretty()
db.sessions.countDocuments()
```

### Limpiar sesiones manualmente:

```javascript
db.sessions.deleteMany({})
```

### Verificar sesión específica:

```javascript
db.sessions.findOne({ "session.userId": ObjectId("...") })
```

## 📝 Archivos Modificados

1. ✅ `server.js` - Agregado MongoStore
2. ✅ `routes/auth.js` - Mejorado logging
3. ✅ `middleware/auth.js` - Agregado logging detallado
4. ✅ `package.json` - Agregado connect-mongo

## ⏱️ Próximos Pasos

1. ✅ Deploy automático en Render (1-2 min)
2. ⏳ Probar login en producción
3. ⏳ Verificar que la sesión persiste
4. ⏳ Confirmar acceso a /superadmin

---

**Estado:** ✅ Código subido, esperando deploy de Render
**ETA:** 2-3 minutos
**Acción:** Refresca https://pescadolive.onrender.com y prueba login

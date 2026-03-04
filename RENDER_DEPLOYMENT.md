# 🚀 Guía de Deployment en Render

## 📋 Pasos para deployar FrescosEnVivo en Render

### 1️⃣ Configurar Variables de Entorno

Ve a tu servicio en Render → **Environment** y agrega estas variables:

#### **REQUERIDAS:**

```env
MONGO_URI=mongodb+srv://PRE_DB_LIVESELL:9VetnSpqwThVx7zm@livesell.0rahvvy.mongodb.net/pescadolive?retryWrites=true&w=majority

SESSION_SECRET=genera_uno_unico_aqui_con_32_caracteres_minimo

EMAIL_SERVICE=gmail
EMAIL_USER=alex.gradinar09@gmail.com
EMAIL_PASS=jjbtushguflkdvey
EMAIL_FROM=noreply@frescosenvivo.com

NODE_ENV=production
```

#### **OPCIONAL (pero recomendado):**

```env
PORT=3000
```

### 2️⃣ Generar SESSION_SECRET seguro

Ejecuta este comando en tu terminal local:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado y úsalo como `SESSION_SECRET`.

### 3️⃣ Configuración del Servicio en Render

1. **Build Command:**
   ```bash
   npm install
   ```

2. **Start Command:**
   ```bash
   npm start
   ```

3. **Environment:** `Node`

4. **Branch:** `main`

### 4️⃣ Configurar Dominio Personalizado (Opcional)

1. Ve a **Settings** → **Custom Domains**
2. Agrega tu dominio (ej: `app.frescosenvivo.com`)
3. Configura el DNS según las instrucciones de Render

### 5️⃣ Verificar el Deployment

Después del deploy, verifica:

✅ **Logs del servicio** - No debe haber errores de conexión a MongoDB
✅ **Super Admin Login** - `https://tu-app.onrender.com/superadmin-login.html`
✅ **Credenciales por defecto** - `admin` / `admin123`

### 🔒 Seguridad para Producción

⚠️ **IMPORTANTE:** Cambia estas credenciales inmediatamente en producción:

1. Accede al panel de Super Admin
2. Cambia el usuario y contraseña por defecto
3. Genera un nuevo `SESSION_SECRET` único
4. Considera usar contraseñas de aplicación de Gmail (no la contraseña principal)

### 🐛 Troubleshooting

#### Error: "uri parameter must be a string"
- **Causa:** `MONGO_URI` no está configurado en Environment Variables
- **Solución:** Agrega `MONGO_URI` en la configuración de Render

#### Error: "Connection timeout"
- **Causa:** MongoDB no acepta conexiones desde la IP de Render
- **Solución:** En MongoDB Atlas → Network Access → Permitir acceso desde cualquier IP (0.0.0.0/0)

#### Error: "Cannot find module"
- **Causa:** Dependencias no instaladas correctamente
- **Solución:** Verifica que `npm install` esté en Build Command

#### Emails no se envían
- **Causa:** Credenciales de Gmail incorrectas o App Password no configurado
- **Solución:** 
  1. Ve a https://myaccount.google.com/apppasswords
  2. Genera una nueva App Password
  3. Usa esa contraseña en `EMAIL_PASS` (no tu contraseña de Gmail)

### 📊 Monitoreo

Render proporciona:
- **Logs en tiempo real** - Monitorea errores y warnings
- **Métricas** - CPU, memoria, requests
- **Alertas** - Configura notificaciones para downtime

### 🔄 Actualizar el Deployment

Cada vez que hagas `git push` a la rama `main`, Render automáticamente:
1. Detecta los cambios
2. Ejecuta `npm install`
3. Reinicia el servicio con `npm start`

### 📝 Checklist Post-Deployment

- [ ] Variables de entorno configuradas
- [ ] MongoDB acepta conexiones desde Render
- [ ] Super Admin login funciona
- [ ] Emails de bienvenida se envían correctamente
- [ ] Cambiar credenciales por defecto
- [ ] Configurar dominio personalizado (opcional)
- [ ] Habilitar HTTPS (automático en Render)
- [ ] Configurar backups de MongoDB

### 🌐 URLs del Sistema

Después del deployment, tendrás acceso a:

- **Super Admin:** `https://tu-app.onrender.com/superadmin-login.html`
- **Login Usuarios:** `https://tu-app.onrender.com/login.html`
- **Panel Vendedor:** `https://tu-app.onrender.com/vendor.html`
- **Página Negocio:** `https://tu-app.onrender.com/`
- **Sistema Tickets:** `https://tu-app.onrender.com/tickets.html`

---

**¿Problemas?** Revisa los logs en Render Dashboard → Logs

# 📧 Sistema de Emails - FrescosEnVivo

## Configuración

### 1. Variables de Entorno (.env)

```env
# Servicio de email (opciones: 'gmail', 'smtp', o vacío para Ethereal)
EMAIL_SERVICE=

# Email remitente
EMAIL_FROM=noreply@frescosenvivo.com

# Para Gmail
EMAIL_USER=tu-email@gmail.com
EMAIL_PASS=tu-app-password  # Genera desde: https://myaccount.google.com/apppasswords

# Para SMTP genérico
SMTP_HOST=smtp.tuservidor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-usuario
SMTP_PASS=tu-contraseña
```

### 2. Configurar Gmail (Recomendado para desarrollo)

1. Ve a tu cuenta de Google: https://myaccount.google.com/apppasswords
2. Genera una contraseña de aplicación
3. Configura en `.env`:
   ```env
   EMAIL_SERVICE=gmail
   EMAIL_USER=tu-email@gmail.com
   EMAIL_PASS=la-contraseña-generada
   ```

### 3. Modo de Desarrollo (Ethereal)

Si no configuras ningún servicio, se usará **Ethereal Email** automáticamente:
- Los emails NO se envían realmente
- Se generan URLs de preview en la consola
- Perfecto para testing sin configurar nada

## Uso del Servicio

### Importar el servicio

```javascript
const emailService = require('./services/emailService');
```

### Templates Disponibles

#### 1. Email de Bienvenida

```javascript
await emailService.sendWelcomeEmail(client, password);
```

**Cuándo se envía:**
- Al crear un nuevo cliente desde el Super Admin
- Al reenviar credenciales

**Contenido:**
- Credenciales de acceso
- URL del panel
- Información del plan contratado
- Límites incluidos

#### 2. Recuperación de Contraseña

```javascript
await emailService.sendPasswordResetEmail(user, resetToken, clientDomain);
```

**Cuándo se envía:**
- Usuario solicita recuperar contraseña
- Token expira en 1 hora

**Contenido:**
- Link de recuperación
- Advertencias de seguridad
- Tiempo de expiración

#### 3. Límite Alcanzado

```javascript
await emailService.sendLimitReachedEmail(client, limitType, currentValue, maxValue);
```

**Tipos de límites:**
- `maxDailyTickets` - Tickets diarios
- `maxCameras` - Cámaras simultáneas
- `maxKiosks` - Kioscos
- `maxVendors` - Vendedores
- `storageQuotaMB` - Almacenamiento

**Cuándo se envía:**
- Al alcanzar el 100% del límite
- Opcionalmente al 80% y 90%

#### 4. Suscripción por Vencer

```javascript
await emailService.sendSubscriptionExpiringEmail(client, daysRemaining);
```

**Cuándo se envía:**
- 30 días antes de vencimiento
- 15 días antes
- 7 días antes
- 1 día antes

### Email Genérico

```javascript
await emailService.sendEmail({
    to: 'destino@example.com',
    subject: 'Asunto del email',
    html: '<h1>HTML del email</h1>',
    text: 'Versión texto plano'
});
```

## API Endpoints

### 1. Probar Email

```http
POST /api/superadmin/test-email
Authorization: Super Admin required
Content-Type: application/json

{
  "email": "test@example.com",
  "type": "welcome",  // opcional
  "clientId": "..."   // opcional para email de bienvenida
}
```

### 2. Reenviar Email de Bienvenida

```http
POST /api/superadmin/resend-welcome/:clientId
Authorization: Super Admin required
```

## Personalización de Templates

Los templates están en `/services/emailService.js`. Cada template tiene:

1. **Versión HTML** - Con estilos inline
2. **Versión Texto** - Para clientes que no soportan HTML

### Estructura de un Template

```javascript
async sendMiTemplate(datos) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            /* Estilos inline */
        </style>
    </head>
    <body>
        <!-- Contenido HTML -->
    </body>
    </html>
    `;

    const text = `
    Versión texto plano del email
    `;

    return await this.sendEmail({
        to: datos.email,
        subject: 'Asunto',
        html,
        text
    });
}
```

## Testing

### 1. Con Ethereal (Sin configuración)

```javascript
// No configures EMAIL_SERVICE en .env
// Los emails se "envían" pero solo aparecen en preview URLs
```

**Resultado:**
```
📧 Cuenta de prueba creada: random@ethereal.email
✅ Email enviado: <mensaje-id>
📧 Preview URL: https://ethereal.email/message/XXXX
```

### 2. Con Gmail o SMTP Real

```javascript
// Configura EMAIL_SERVICE=gmail o smtp
// Los emails se envían realmente
```

## Monitoreo

### Ver Logs

Los emails generan logs automáticos:

```
✅ Email enviado: <mensaje-id>
⚠️ No se pudo enviar email: error
❌ Error enviando email: detalles
```

### Verificar Estado

```javascript
// El servicio se inicializa al arrancar el servidor
await emailService.initialize();
// ✅ Servicio de email inicializado correctamente
```

## Buenas Prácticas

1. **No bloquear operaciones**: Los emails se envían de forma asíncrona
2. **Manejar errores**: El envío puede fallar, no debe romper la aplicación
3. **Logs claros**: Siempre loguear éxitos y errores
4. **Testing**: Usa Ethereal en desarrollo
5. **Producción**: Usa Gmail o SMTP profesional

## Próximas Mejoras

- [ ] Cola de emails con Bull/Redis
- [ ] Retry automático en caso de fallo
- [ ] Templates en archivos separados
- [ ] Editor de templates en el panel
- [ ] Historial de emails enviados
- [ ] Estadísticas de apertura/clicks
- [ ] Suscripción/desuscripción de notificaciones

## Troubleshooting

### Error: "Invalid login credentials"

**Gmail:**
- Verifica que uses "App Password", no tu contraseña normal
- Genera uno desde: https://myaccount.google.com/apppasswords

**SMTP:**
- Verifica credenciales
- Verifica puerto (587 o 465)
- Verifica si requiere SSL/TLS

### Error: "Connection timeout"

- Verifica que tu firewall no bloquee el puerto
- Verifica la configuración de red
- Prueba con Ethereal primero

### Los emails no llegan

- Revisa carpeta de spam
- Verifica que el email destino sea válido
- Revisa logs del servidor
- Usa Ethereal para verificar que el template es correcto

## Soporte

Para problemas o sugerencias:
- Revisa los logs del servidor
- Prueba con Ethereal primero
- Verifica configuración de .env

# 🌱 FrescosEnVivo - Sistema Multi-Tenant

Sistema de gestión de colas y streaming en vivo para negocios de productos frescos con arquitectura multi-tenant.

## 🏗️ Arquitectura Multi-Tenant

Cada cliente tiene:
- ✅ Dominio personalizado (ej: `minegocio.com`)
- ✅ Base de datos MongoDB dedicada
- ✅ Configuración y branding personalizado
- ✅ Límites configurables
- ✅ Datos completamente aislados

## 🚀 Instalación

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto:

```env
PORT=3000
MONGO_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/frescosenvivo_master?retryWrites=true&w=majority
SESSION_SECRET=tu_secreto_super_seguro_aqui
NODE_ENV=development
```

### 3. Configurar MongoDB Atlas
1. Ve a [MongoDB Atlas](https://cloud.mongodb.com)
2. En tu clúster, ve a **Network Access**
3. Haz clic en **Add IP Address**
4. Selecciona **Allow Access from Anywhere** (0.0.0.0/0)
5. Guarda los cambios

### 4. Crear Super Admin
```bash
node scripts/createSuperAdmin.js
```

Sigue las instrucciones e ingresa:
- Usuario (ej: `superadmin`)
- Email
- Nombre completo
- Contraseña

### 5. Iniciar Servidor
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 📊 Panel de Super Admin

### Acceso
- **URL**: `http://localhost:3000/superadmin`
- **Producción**: `http://admin.tudominio.com/superadmin`

### Funcionalidades
- 📈 Dashboard con estadísticas generales
- 🏢 Gestión completa de clientes
- ➕ Crear nuevos clientes
- ✏️ Editar clientes existentes
- 🗑️ Eliminar clientes
- 🔍 Búsqueda y filtros avanzados

### Crear un Nuevo Cliente

1. Ve a **Nuevo Cliente** en el menú
2. Completa el formulario:
   - **Información del Negocio**
     - Nombre del negocio (ej: "Pescadería El Marisco")
     - Dominio (ej: "pescaderiajuan.com")
   
   - **Información del Propietario**
     - Nombre completo
     - Email
     - Usuario
     - Contraseña
     - Teléfono (opcional)
   
   - **Plan y Límites**
     - Plan: Básico, Profesional, Empresarial, Personalizado
     - Tickets diarios máximos
     - Número de cámaras permitidas

3. Haz clic en **Crear Cliente**

### ¿Qué sucede al crear un cliente?

1. Se crea un registro en la base de datos master
2. Se genera automáticamente una base de datos MongoDB dedicada
3. Se configuran las colecciones iniciales
4. El cliente puede acceder desde su dominio personalizado

## 🌐 Configuración de Dominios

### Desarrollo Local (sin DNS)

Edita tu archivo `hosts`:

**Windows**: `C:\Windows\System32\drivers\etc\hosts`
**Mac/Linux**: `/etc/hosts`

Añade:
```
127.0.0.1  admin.localhost
127.0.0.1  pescaderiajuan.localhost
127.0.0.1  mariscospepe.localhost
```

Luego accede:
- Super Admin: `http://admin.localhost:3000/superadmin`
- Cliente 1: `http://pescaderiajuan.localhost:3000`
- Cliente 2: `http://mariscospepe.localhost:3000`

### Producción (con DNS)

1. **Dominio Principal**: `tuproducto.com`
   - Apuntar a la IP de tu servidor

2. **Subdomain Wildcard** (*): `*.tuproducto.com`
   - Crear registro DNS tipo A o CNAME
   - Apuntar a la misma IP del servidor

3. **Dominios Personalizados de Clientes**:
   - El cliente debe configurar su dominio
   - Crear registro A apuntando a tu servidor
   - Ejemplo: `minegocio.com` → `TU_IP_SERVIDOR`

## 📦 Estructura de Base de Datos

### Base de Datos Master (`frescosenvivo_master`)
Almacena:
- Clientes registrados
- Configuración de dominios
- Credenciales de acceso a DBs dedicadas
- Usuarios Super Admin

### Bases de Datos de Clientes (`pescado_cliente_xxx`)
Cada cliente tiene su propia DB con:
- Usuarios/Vendedores
- Tickets/Colas
- Pedidos
- Configuración

## 🔐 Seguridad

- ✅ Autenticación por sesiones
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Aislamiento total de datos por cliente
- ✅ Verificación de estado activo/suspendido
- ✅ Middleware de autenticación por rutas

## 📝 Planes Disponibles

| Plan | Tickets/Día | Cámaras | Kiosks | Vendedores | Almacenamiento |
|------|-------------|---------|--------|------------|----------------|
| Básico | 200 | 4 | 2 | 3 | 1 GB |
| Profesional | 500 | 6 | 5 | 10 | 5 GB |
| Empresarial | Ilimitado | 10 | 10 | 25 | 20 GB |
| Personalizado | Custom | Custom | Custom | Custom | Custom |

## 🛠️ Tecnologías

- **Backend**: Node.js, Express
- **Base de Datos**: MongoDB (Multi-DB)
- **Real-time**: Socket.IO
- **Autenticación**: Express-Session, Bcrypt
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Streaming**: WebRTC

## 📞 Soporte

Para soporte técnico o consultas, contacta con el administrador del sistema.

---

**© 2024 LivePescado - Sistema de Gestión Multi-Tenant**

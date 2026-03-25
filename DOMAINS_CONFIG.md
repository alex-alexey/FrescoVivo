# 🌐 Configuración de Dominios - FrescosEnVivo

## 📋 Tipos de Dominios

### 1️⃣ **Dominio Principal (Landing/Super Admin)**

Dominios que muestran la página de presentación de la solución y acceso al Super Admin:

```
✅ localhost:3000
✅ 127.0.0.1:3000
✅ *.onrender.com (pescadolive.onrender.com)
✅ *.herokuapp.com
✅ *.vercel.app
✅ *.netlify.app
✅ admin.* (cualquier subdominio admin)
```

**Comportamiento:**
- Muestra `landing.html` (página de marketing)
- Acceso a `/superadmin-login.html` (panel de gestión de clientes)
- NO requiere configuración en la base de datos

### 2️⃣ **Dominios de Clientes**

Dominios personalizados que cada cliente configura:

```
✅ demo.localhost:3000
✅ demo2.localhost:3000
✅ pescaderiajuan.com
✅ carnesmiguel.es
✅ frutaspepe.com
```

**Comportamiento:**
- Muestra `tienda.html` (tienda del cliente)
- Acceso a `/login.html` (login del negocio)
- Acceso a `/admin-panel.html` (panel del cliente)
- **REQUIERE** configuración en la base de datos

## 🔧 Configuración en Producción

### Opción A: Usar el dominio de Render directamente

**URL:** `https://pescadolive.onrender.com`

**Comportamiento:**
- ✅ Muestra landing de FrescosEnVivo
- ✅ Acceso a Super Admin: `https://pescadolive.onrender.com/superadmin-login.html`
- ✅ NO necesita configuración adicional

### Opción B: Configurar dominio personalizado

Si quieres que `app.frescosenvivo.com` sea tu panel principal:

1. **En Render:**
   - Settings → Custom Domains
   - Add Custom Domain: `app.frescosenvivo.com`
   - Copiar el CNAME que Render te da

2. **En tu DNS:**
   - Crear registro CNAME:
     ```
     app.frescosenvivo.com → [tu-app].onrender.com
     ```

3. **Actualizar código:**
   ```javascript
   // middleware/tenantMiddleware.js
   if (domain === 'app.frescosenvivo.com' || domain.includes('.onrender.com')) {
       req.isSuperAdmin = true;
       return next();
   }
   ```

## 🏪 Configurar Dominios para Clientes

### Paso 1: Crear cliente en Super Admin

```
Super Admin → Clientes → Crear nuevo
- Nombre del negocio: Pescadería Juan
- Dominio: pescaderiajuan.com
- Email del propietario: juan@pescaderia.com
```

### Paso 2: Configurar DNS del cliente

El cliente debe configurar su DNS:

**Opción A: Dominio completo**
```
A record: pescaderiajuan.com → [IP de Render]
```

**Opción B: Subdominio**
```
CNAME: tienda.pescaderiajuan.com → pescadolive.onrender.com
```

### Paso 3: Añadir dominio personalizado en Render

```
Render → Custom Domains → Add
- Domain: pescaderiajuan.com
```

### Paso 4: Probar

```
https://pescaderiajuan.com → Tienda del cliente
https://pescaderiajuan.com/login.html → Login del negocio
```

## 🧪 Dominios de Prueba (Localhost)

### Para desarrollo local:

```bash
# Editar /etc/hosts (Mac/Linux) o C:\Windows\System32\drivers\etc\hosts (Windows)
127.0.0.1   demo.localhost
127.0.0.1   demo2.localhost
127.0.0.1   pescaderia.localhost
```

**Uso:**
```
http://demo.localhost:3000 → Cliente "demo"
http://demo2.localhost:3000 → Cliente "demo2"
```

## 🔀 Flujo Completo

### Super Admin (Tú):
```
1. Accede a: https://pescadolive.onrender.com/superadmin-login.html
2. Login: admin / admin123
3. Gestiona clientes, emails, configuración
```

### Cliente (Negocio):
```
1. Accede a: https://[su-dominio].com/login.html
2. Login con credenciales recibidas por email
3. Configura su tienda desde admin-panel.html
4. Vendedores usan vendor.html para hacer ventas
```

### Clientes Finales:
```
1. Acceden a: https://[dominio-del-negocio].com
2. Ven productos, cámaras en vivo, horarios
3. Toman turno online o compran productos
```

## 📊 Tabla de URLs

| Dominio | Página por Defecto | Tipo | Requiere Config DB |
|---------|-------------------|------|-------------------|
| `localhost:3000` | landing.html | Super Admin | ❌ No |
| `*.onrender.com` | landing.html | Super Admin | ❌ No |
| `admin.*` | landing.html | Super Admin | ❌ No |
| `demo.localhost` | tienda.html | Cliente | ✅ Sí |
| `[cliente].com` | tienda.html | Cliente | ✅ Sí |

## 🔐 Seguridad

### Identificación del Tenant:
1. Middleware detecta dominio desde `req.get('host')`
2. Si es dominio de hosting → Modo Super Admin
3. Si no → Busca cliente en DB por dominio
4. Si no existe → Error 404

### Aislamiento:
- Cada cliente solo puede acceder a su propia base de datos
- Imposible cross-tenant access
- Las queries siempre incluyen `clientId`

## ⚠️ Problemas Comunes

### Error 502 / 404 en Render:

**Causa:** El dominio no está en la lista de permitidos

**Solución:** Actualizar `tenantMiddleware.js` para incluir el dominio

### Cliente no puede acceder a su dominio:

**Causa:** Dominio no configurado en la base de datos

**Solución:** 
1. Super Admin → Crear cliente
2. Configurar dominio exacto (sin http://, sin puerto)
3. Verificar que el DNS apunte correctamente

### Subdominios no funcionan:

**Causa:** Render necesita configuración de wildcard domains

**Solución:**
- Plan Pro de Render para wildcard (*.frescosenvivo.com)
- O configurar cada subdominio individualmente

## 📝 Ejemplo Real

### Configuración de "Pescadería Miguel":

1. **Super Admin crea cliente:**
   ```
   Dominio: pescaderiamiguel.com
   Email: miguel@pescaderia.com
   ```

2. **DNS configurado:**
   ```
   pescaderiamiguel.com → CNAME → pescadolive.onrender.com
   ```

3. **Render Custom Domain:**
   ```
   pescaderiamiguel.com (verificado ✅)
   ```

4. **Resultado:**
   ```
   https://pescaderiamiguel.com → Tienda de Miguel
   https://pescaderiamiguel.com/login.html → Login de Miguel
   https://pescaderiamiguel.com/admin-panel.html → Panel de Miguel
   ```

---

**Estado actual:** ✅ Sistema funcionando en Render con dominio `.onrender.com`
**Próximo paso:** Configurar dominios personalizados para clientes

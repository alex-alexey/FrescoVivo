const mongoose = require('mongoose');
const Client = require('../models/Client');

// Cache para almacenar conexiones de bases de datos
const dbConnections = new Map();

/**
 * Middleware que identifica al cliente (tenant) basándose en el dominio
 * y establece la conexión a su base de datos dedicada
 */
async function tenantMiddleware(req, res, next) {
    try {
        // Obtener el host desde los headers
        const host = req.get('host') || req.hostname;
        
        // Extraer el dominio (sin puerto si existe)
        const domain = host.split(':')[0];
        
        console.log('🌐 Dominio detectado:', domain);
        
        // Si es el dominio de super admin, saltarse este middleware
        if (domain.startsWith('admin.') || domain === 'localhost' || domain === '127.0.0.1') {
            console.log('🔧 Acceso de Super Admin detectado');
            req.isSuperAdmin = true;
            return next();
        }
        
        // Buscar el cliente por dominio en la DB Master
        const client = await Client.findOne({ domain: domain });
        
        if (!client) {
            console.log('❌ Cliente no encontrado para el dominio:', domain);
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Dominio No Configurado</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            margin: 0;
                        }
                        .container {
                            text-align: center;
                            padding: 40px;
                            background: rgba(255,255,255,0.1);
                            border-radius: 20px;
                            backdrop-filter: blur(10px);
                        }
                        h1 { font-size: 3em; margin-bottom: 20px; }
                        p { font-size: 1.2em; opacity: 0.9; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🐟 Dominio No Configurado</h1>
                        <p>El dominio <strong>${domain}</strong> no está registrado en nuestro sistema.</p>
                        <p>Por favor, contacta con el administrador.</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Verificar si el cliente está activo
        if (!client.isActive()) {
            console.log('⚠️ Cliente inactivo o suspendido:', client.businessName);
            const statusMessages = {
                'suspendido': 'Su cuenta ha sido suspendida',
                'expirado': 'Su suscripción ha expirado',
                'eliminado': 'Esta cuenta ha sido eliminada'
            };
            
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Cuenta No Disponible</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                            color: white;
                            margin: 0;
                        }
                        .container {
                            text-align: center;
                            padding: 40px;
                            background: rgba(255,255,255,0.1);
                            border-radius: 20px;
                            backdrop-filter: blur(10px);
                        }
                        h1 { font-size: 3em; margin-bottom: 20px; }
                        p { font-size: 1.2em; opacity: 0.9; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⚠️ Cuenta No Disponible</h1>
                        <p><strong>${client.businessName}</strong></p>
                        <p>${statusMessages[client.status] || 'Cuenta no disponible'}</p>
                        <p style="font-size: 0.9em; margin-top: 30px;">Por favor, contacte con soporte técnico</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        console.log('✅ Cliente encontrado:', client.businessName);
        
        // Obtener o crear conexión a la base de datos del cliente
        let tenantDb;
        
        if (dbConnections.has(client.database.name)) {
            // Usar conexión cacheada
            tenantDb = dbConnections.get(client.database.name);
            console.log('📦 Usando conexión cacheada para:', client.database.name);
        } else {
            // Crear nueva conexión
            console.log('🔌 Creando nueva conexión a:', client.database.name);
            
            tenantDb = mongoose.createConnection(client.database.connectionString);
            
            // Guardar en cache
            dbConnections.set(client.database.name, tenantDb);
            
            // Manejar eventos de conexión
            tenantDb.on('connected', () => {
                console.log('✅ Conectado a DB del cliente:', client.database.name);
            });
            
            tenantDb.on('error', (err) => {
                console.error('❌ Error en DB del cliente:', client.database.name, err);
                dbConnections.delete(client.database.name);
            });
            
            tenantDb.on('disconnected', () => {
                console.log('🔌 Desconectado de DB del cliente:', client.database.name);
                dbConnections.delete(client.database.name);
            });
        }
        
        // Agregar información del cliente y la DB al request
        req.client = {
            _id: client._id,
            id: client._id,
            businessName: client.businessName,
            slug: client.slug,
            domain: client.domain,
            storeType: client.storeType || 'pescaderia',
            branding: client.branding,
            limits: client.limits,
            plan: client.plan,
            config: client.config
        };
        
        req.tenantDb = tenantDb;
        
        // Actualizar última actividad
        client.stats.lastActivityAt = new Date();
        await client.save();
        
        console.log('🎯 Tenant configurado correctamente para:', client.businessName);
        next();
        
    } catch (error) {
        console.error('❌ Error en tenantMiddleware:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error del Servidor</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
                        color: white;
                        margin: 0;
                    }
                    .container {
                        text-align: center;
                        padding: 40px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                    }
                    h1 { font-size: 3em; margin-bottom: 20px; }
                    p { font-size: 1.2em; opacity: 0.9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>❌ Error del Servidor</h1>
                    <p>Ocurrió un error al procesar tu solicitud.</p>
                    <p style="font-size: 0.9em; margin-top: 30px;">Por favor, intenta de nuevo más tarde</p>
                </div>
            </body>
            </html>
        `);
    }
}

/**
 * Función para cerrar todas las conexiones de tenants
 */
function closeAllTenantConnections() {
    for (const [dbName, connection] of dbConnections.entries()) {
        console.log('🔌 Cerrando conexión:', dbName);
        connection.close();
    }
    dbConnections.clear();
}

module.exports = {
    tenantMiddleware,
    closeAllTenantConnections
};

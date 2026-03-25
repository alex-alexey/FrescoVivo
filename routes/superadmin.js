const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const emailService = require('../services/emailService');

// Middleware de autenticación de Super Admin
function superAdminAuth(req, res, next) {
    // Verificar que esté autenticado
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'No autenticado', redirectTo: '/superadmin-login.html' });
    }
    
    // Verificar que tenga permisos de Super Admin
    // isSuperAdmin se setea en login cuando accede desde dominio de hosting
    // También aceptar si el role es 'admin' y no tiene clientId (es admin master)
    const isValidSuperAdmin = req.session.isSuperAdmin || 
                              (req.session.role === 'admin' && !req.session.clientId);

    if (!isValidSuperAdmin) {
        return res.status(403).json({ success: false, message: 'Acceso denegado - Se requieren permisos de Super Admin' });
    }
    
    next();
}

/**
 * GET /api/superadmin/clients
 * Listar todos los clientes
 */
router.get('/clients', superAdminAuth, async (req, res) => {
    try {
        const { status, plan, search, page = 1, limit = 20 } = req.query;
        
        let query = {};
        
        // Filtrar por estado
        if (status) {
            query.status = status;
        }
        
        // Filtrar por plan
        if (plan) {
            query.plan = plan;
        }
        
        // Búsqueda
        if (search) {
            query.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { domain: { $regex: search, $options: 'i' } },
                { 'owner.email': { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (page - 1) * limit;
        
        const clients = await Client.find(query)
            .select('-owner.password -database.connectionString')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Client.countDocuments(query);
        
        res.json({
            success: true,
            data: clients,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error al listar clientes:', error);
        res.status(500).json({ success: false, message: 'Error al listar clientes', error: error.message });
    }
});

/**
 * GET /api/superadmin/clients/:id
 * Obtener un cliente específico
 */
router.get('/clients/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id)
            .select('-owner.password');
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
        
        res.json({ success: true, data: client });
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ success: false, message: 'Error al obtener cliente', error: error.message });
    }
});

/**
 * POST /api/superadmin/clients
 * Crear un nuevo cliente
 */
router.post('/clients', superAdminAuth, async (req, res) => {
    try {
        const {
            businessName,
            domain,
            ownerUsername,
            ownerEmail,
            ownerPassword,
            ownerFullName,
            ownerPhone,
            plan,
            limits,
            branding
        } = req.body;
        
        // Validaciones
        if (!businessName || !domain || !ownerUsername || !ownerEmail || !ownerPassword || !ownerFullName) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }
        
        // Verificar que el dominio no exista
        const existingClient = await Client.findOne({ domain });
        if (existingClient) {
            return res.status(400).json({
                success: false,
                message: 'El dominio ya está registrado'
            });
        }
        
        // Verificar que el username no exista
        const existingUsername = await Client.findOne({ 'owner.username': ownerUsername });
        if (existingUsername) {
            return res.status(400).json({
                success: false,
                message: 'El nombre de usuario ya está en uso'
            });
        }
        
        // Verificar que el email no exista
        const existingEmail = await Client.findOne({ 'owner.email': ownerEmail });
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }
        
        // Generar slug
        const slug = businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        
        // Generar nombre de base de datos único
        const dbName = Client.generateDatabaseName(slug);
        
        // Obtener la URI base de MongoDB desde las variables de entorno
        const mongoBaseUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
        
        // Construir la URI de conexión para la base de datos del cliente
        // Si es MongoDB Atlas, reemplazar el nombre de la base de datos
        let clientDbUri;
        if (mongoBaseUri.includes('mongodb+srv://')) {
            // MongoDB Atlas
            clientDbUri = mongoBaseUri.replace(/\/[^\/]+\?/, `/${dbName}?`);
        } else {
            // MongoDB local
            clientDbUri = `${mongoBaseUri}/${dbName}`;
        }
        
        // Crear el cliente
        const client = new Client({
            businessName,
            slug,
            domain,
            owner: {
                username: ownerUsername,
                email: ownerEmail,
                password: ownerPassword,
                fullName: ownerFullName,
                phone: ownerPhone || ''
            },
            database: {
                name: dbName,
                connectionString: clientDbUri
            },
            plan: plan || 'basico',
            limits: limits || {
                maxDailyTickets: 200,
                maxCameras: 4,
                maxKiosks: 2,
                maxVendors: 3,
                storageQuotaMB: 1000
            },
            branding: branding || {},
            status: 'prueba',
            createdBy: req.session.username || 'superadmin'
        });
        
        // Marcar la contraseña como modificada para que el hook pre-save la hashee
        client.markModified('owner.password');
        
        await client.save();
        
        // Crear la base de datos e inicializarla con colecciones básicas
        try {
            const clientDbConnection = mongoose.createConnection(clientDbUri);
            
            // Crear colecciones básicas
            await clientDbConnection.createCollection('users');
            await clientDbConnection.createCollection('tickets');
            await clientDbConnection.createCollection('settings');
            
            // Insertar configuración inicial
            const settingsCollection = clientDbConnection.collection('settings');
            await settingsCollection.insertOne({
                key: 'initialized',
                value: true,
                createdAt: new Date()
            });
            
            console.log('✅ Base de datos del cliente creada:', dbName);
            
            await clientDbConnection.close();
        } catch (dbError) {
            console.error('Error al crear la base de datos del cliente:', dbError);
            // No fallar la creación del cliente si hay error en la DB
        }
        
        // Retornar el cliente creado (sin la contraseña)
        const clientResponse = client.toObject();
        delete clientResponse.owner.password;
        delete clientResponse.database.connectionString;
        
        // Enviar email de bienvenida (asíncrono, no bloqueante)
        emailService.sendWelcomeEmail(client, ownerPassword)
            .then(result => {
                if (result.success) {
                    console.log('✅ Email de bienvenida enviado a:', client.owner.email);
                } else {
                    console.log('⚠️ No se pudo enviar email de bienvenida:', result.error);
                }
            })
            .catch(err => {
                console.error('❌ Error enviando email de bienvenida:', err);
            });
        
        res.status(201).json({
            success: true,
            message: 'Cliente creado exitosamente',
            data: clientResponse
        });
        
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear cliente',
            error: error.message
        });
    }
});

/**
 * PUT /api/superadmin/clients/:id
 * Actualizar un cliente
 */
router.put('/clients/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
        
        const {
            businessName,
            domain,
            ownerUsername,
            ownerEmail,
            ownerFullName,
            ownerPhone,
            ownerPassword,
            status,
            plan,
            limits,
            branding,
            subscriptionEndDate,
            notes,
            tags
        } = req.body;
        
        // Actualizar campos permitidos
        if (businessName) client.businessName = businessName;
        if (domain && domain !== client.domain) {
            // Verificar que el nuevo dominio no exista
            const existingDomain = await Client.findOne({ domain, _id: { $ne: client._id } });
            if (existingDomain) {
                return res.status(400).json({
                    success: false,
                    message: 'El dominio ya está en uso'
                });
            }
            client.domain = domain;
        }
        
        // Actualizar información del propietario
        if (ownerUsername && ownerUsername !== client.owner.username) {
            // Verificar que el nuevo username no exista
            const existingUsername = await Client.findOne({ 'owner.username': ownerUsername, _id: { $ne: client._id } });
            if (existingUsername) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre de usuario ya está en uso'
                });
            }
            client.owner.username = ownerUsername;
        }
        
        if (ownerEmail) client.owner.email = ownerEmail;
        if (ownerFullName) client.owner.fullName = ownerFullName;
        if (ownerPhone !== undefined) client.owner.phone = ownerPhone;
        
        // Actualizar contraseña solo si se proporciona
        if (ownerPassword) {
            client.owner.password = ownerPassword;
            client.markModified('owner.password'); // Marcar como modificado para que el hook pre-save funcione
        }
        
        if (status) client.status = status;
        if (plan) client.plan = plan;
        if (limits) client.limits = { ...client.limits, ...limits };
        if (branding) client.branding = { ...client.branding, ...branding };
        if (subscriptionEndDate !== undefined) client.subscriptionEndDate = subscriptionEndDate;
        if (notes !== undefined) client.notes = notes;
        if (tags) client.tags = tags;
        
        client.lastModifiedBy = req.session.username || 'superadmin';
        
        await client.save();
        
        const clientResponse = client.toObject();
        delete clientResponse.owner.password;
        delete clientResponse.database.connectionString;
        
        res.json({
            success: true,
            message: 'Cliente actualizado exitosamente',
            data: clientResponse
        });
        
    } catch (error) {
        console.error('❌ Error al actualizar cliente:', error);
        console.error('   Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar cliente',
            error: error.message,
            details: error.stack
        });
    }
});

/**
 * DELETE /api/superadmin/clients/:id
 * Eliminar un cliente (soft delete)
 */
router.delete('/clients/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
        
        // Soft delete
        client.status = 'eliminado';
        client.lastModifiedBy = req.session.username || 'superadmin';
        await client.save();
        
        // TODO: Opcional - programar eliminación de la base de datos después de X días
        
        res.json({
            success: true,
            message: 'Cliente eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar cliente',
            error: error.message
        });
    }
});

/**
 * GET /api/superadmin/stats
 * Estadísticas generales del sistema
 */
router.get('/stats', superAdminAuth, async (req, res) => {
    try {
        const totalClients = await Client.countDocuments();
        const activeClients = await Client.countDocuments({ status: 'activo' });
        const trialClients = await Client.countDocuments({ status: 'prueba' });
        const suspendedClients = await Client.countDocuments({ status: 'suspendido' });
        
        const clientsByPlan = await Client.aggregate([
            { $group: { _id: '$plan', count: { $sum: 1 } } }
        ]);
        
        const recentClients = await Client.find()
            .select('businessName domain status createdAt')
            .sort({ createdAt: -1 })
            .limit(5);
        
        res.json({
            success: true,
            data: {
                total: totalClients,
                active: activeClients,
                trial: trialClients,
                suspended: suspendedClients,
                byPlan: clientsByPlan,
                recent: recentClients
            }
        });
        
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: error.message
        });
    }
});

/**
 * POST /api/superadmin/test-email
 * Probar el envío de emails
 */
router.post('/test-email', superAdminAuth, async (req, res) => {
    try {
        const { email, type = 'welcome', clientId } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email es requerido'
            });
        }
        
        let result;
        
        if (type === 'welcome' && clientId) {
            // Buscar el cliente
            const client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }
            
            result = await emailService.sendWelcomeEmail(client, 'password_temporal_123');
        } else {
            // Email de prueba genérico
            result = await emailService.sendEmail({
                to: email,
                subject: '📧 Email de prueba - FrescosEnVivo',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h1 style="color: #667eea;">¡Email de prueba!</h1>
                        <p>Este es un email de prueba del sistema FrescosEnVivo.</p>
                        <p>Si recibiste este email, significa que el servicio de correo está funcionando correctamente.</p>
                        <hr>
                        <p style="color: #666; font-size: 12px;">Enviado desde el panel de Super Admin</p>
                    </div>
                `,
                text: 'Email de prueba - FrescosEnVivo'
            });
        }
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Email enviado exitosamente',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Error al enviar email',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error al enviar email de prueba:', error);
        res.status(500).json({
            success: false,
            message: 'Error al enviar email',
            error: error.message
        });
    }
});

/**
 * POST /api/superadmin/resend-welcome/:id
 * Reenviar email de bienvenida a un cliente
 */
router.post('/resend-welcome/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }
        
        // Generar una contraseña temporal o usar una por defecto
        const tempPassword = 'cambiar_password_' + Math.random().toString(36).slice(-8);
        
        const result = await emailService.sendWelcomeEmail(client, tempPassword);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Email de bienvenida reenviado',
                note: `Se envió con contraseña temporal: ${tempPassword}`
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Error al reenviar email',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error al reenviar email:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reenviar email',
            error: error.message
        });
    }
});

module.exports = router;

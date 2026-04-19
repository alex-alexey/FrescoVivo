const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Client = require('../models/Client');
const mongoose = require('mongoose');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { auth, isAdmin } = require('../middleware/auth');
const emailService = require('../services/emailService');

// Rate limiter genérico para login de clientes/propietarios
// 10 intentos por ventana de 15 min, clave por IP + usuario
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req);
        const username = String(req.body?.username || '').toLowerCase().trim().slice(0, 64);
        return `login:${ip}:${username}`;
    },
    handler: (req, res) => {
        console.warn(`🚫 Rate limit login alcanzado - IP: ${req.ip} usuario: ${req.body?.username}`);
        return res.status(429).json({
            success: false,
            message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.'
        });
    }
});

// Rate limiter más estricto para superadmin
const superadminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req);
        const username = String(req.body?.username || '').toLowerCase().trim().slice(0, 64);
        return `superadmin-login:${ip}:${username}`;
    },
    handler: (req, res) => {
        console.warn(`🚫 Rate limit superadmin alcanzado - IP: ${req.ip} usuario: ${req.body?.username}`);
        return res.status(429).json({
            success: false,
            message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.'
        });
    }
});

function getScopedUserModel(req) {
    if (req.session?.clientId && !req.session?.isSuperAdmin) {
        if (!req.tenantDb) {
            return null;
        }
        return req.tenantDb.models.User || req.tenantDb.model('User', User.schema);
    }

    return User;
}

// ========== RUTAS PÚBLICAS ==========

// Login
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuario y contraseña son requeridos' 
            });
        }
        
        // Detectar el dominio
        const host = req.get('host') || req.hostname;
        const domain = host.split(':')[0];
        
        console.log('🔐 Intento de login:', { username, domain });
        
        // Detectar si es dominio de hosting/superadmin
        const isHostingDomain = (
            domain === 'localhost' ||
            domain === '127.0.0.1' ||
            domain.startsWith('admin.') ||
            domain.includes('.onrender.com') ||
            domain.includes('.herokuapp.com') ||
            domain.includes('.vercel.app') ||
            domain.includes('.netlify.app')
        );

        // También soporte para ?tenant= (login de cliente desde hosting)
        const tenantSlug = req.query.tenant;

        // Si es localhost o dominio de hosting SIN ?tenant=, buscar en DB Master (Super Admin)
        if (isHostingDomain && !tenantSlug) {
            console.log('🔧 Login de Super Admin en DB Master');
            
            // Buscar usuario en la base de datos MASTER
            const user = await User.findOne({ username: username.toLowerCase() });
            
            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Credenciales inválidas' 
                });
            }
            
            // Verificar si está activo
            if (!user.isActive) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Usuario inactivo. Contacta al administrador.' 
                });
            }
            
            // Verificar contraseña
            const isMatch = await user.comparePassword(password);
            
            if (!isMatch) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Credenciales inválidas' 
                });
            }
            
            // Actualizar último login
            await user.updateLastLogin();
            
            // Crear sesión
            req.session.userId = user._id;
            req.session.username = user.username;
            req.session.role = user.role;
            req.session.isSuperAdmin = true;
            req.session.superAdminRole = user.superAdminRole || 'owner';
            
            console.log(`✅ Login exitoso (Super Admin): ${user.username} (${user.role})`);
            
            res.json({ 
                success: true, 
                message: 'Login exitoso',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    superAdminRole: user.superAdminRole || 'owner'
                }
            });
            
        } else {
            // Es un cliente específico, buscar en su base de datos dedicada
            console.log('🏢 Login de cliente en dominio:', domain, '| tenant:', tenantSlug || 'por dominio');
            
            // 1. Buscar el cliente por slug (?tenant=) o por dominio
            const client = tenantSlug
                ? await Client.findOne({ slug: tenantSlug })
                : await Client.findOne({ domain: domain });
            
            if (!client) {
                console.log('❌ Cliente no encontrado:', tenantSlug || domain);
                return res.status(404).json({ 
                    success: false, 
                    message: 'Dominio no registrado en el sistema' 
                });
            }
            
            // 2. Verificar si el cliente está activo
            if (!client.isActive()) {
                console.log('⚠️ Cliente inactivo:', client.businessName);
                return res.status(403).json({ 
                    success: false, 
                    message: 'Tu cuenta está inactiva. Contacta con soporte.' 
                });
            }
            
            // 3. Verificar si está intentando acceder con las credenciales del propietario
            if (username.toLowerCase() === client.owner.username.toLowerCase()) {
                console.log('👤 Intento de login del propietario');
                
                // Verificar contraseña del propietario
                console.log(`🔐 Validando contraseña para: ${client.owner.username}`);
                console.log(`   - Hash almacenado: ${client.owner.password.substring(0, 15)}...`);
                console.log(`   - Contraseña ingresada: ${password.substring(0, 3)}***`);
                
                const isMatch = await client.comparePassword(password);
                
                if (!isMatch) {
                    console.log(`❌ Contraseña INCORRECTA para: ${client.owner.username}`);
                    console.log(`   - comparePassword devolvió: ${isMatch}`);
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Credenciales inválidas' 
                    });
                }
                
                console.log(`✅ Contraseña CORRECTA para: ${client.owner.username}`);
                
                // Login exitoso del propietario
                req.session.userId = client._id;
                req.session.username = client.owner.username;
                req.session.role = 'admin';
                req.session.clientId = client._id;
                req.session.businessName = client.businessName;
                
                console.log(`✅ Login exitoso (Propietario): ${client.owner.username} de ${client.businessName}`);

                // Guardar sesión explícitamente antes de responder (crítico en producción)
                return req.session.save((err) => {
                    if (err) {
                        console.error('❌ Error guardando sesión del propietario:', err);
                        return res.status(500).json({ success: false, message: 'Error guardando sesión' });
                    }
                    console.log('✅ Sesión del propietario guardada:', req.sessionID);
                    return res.json({ 
                        success: true, 
                        message: 'Login exitoso',
                        user: {
                            id: client._id,
                            username: client.owner.username,
                            email: client.owner.email,
                            fullName: client.owner.fullName,
                            role: 'admin',
                            businessName: client.businessName
                        }
                    });
                });
            }
            
            // 4. Si no es el propietario, buscar en la base de datos del cliente
            console.log('🔍 Buscando usuario en DB del cliente:', client.database.name);
            
            const clientDb = mongoose.createConnection(client.database.connectionString);
            const ClientUserModel = clientDb.model('User', User.schema);
            
            const user = await ClientUserModel.findOne({ username: username.toLowerCase() });
            
            if (!user) {
                await clientDb.close();
                return res.status(401).json({ 
                    success: false, 
                    message: 'Credenciales inválidas' 
                });
            }
            
            // Verificar si está activo
            if (!user.isActive) {
                await clientDb.close();
                return res.status(403).json({ 
                    success: false, 
                    message: 'Usuario inactivo. Contacta al administrador.' 
                });
            }
            
            // Verificar contraseña
            const isMatch = await user.comparePassword(password);
            
            if (!isMatch) {
                await clientDb.close();
                return res.status(401).json({ 
                    success: false, 
                    message: 'Credenciales inválidas' 
                });
            }
            
            // Actualizar último login
            await user.updateLastLogin();
            
            // Crear sesión
            req.session.userId = user._id;
            req.session.username = user.username;
            req.session.role = user.role;
            req.session.clientId = client._id;
            req.session.businessName = client.businessName;
            
            console.log(`✅ Login exitoso (Usuario): ${user.username} de ${client.businessName}`);
            
            await clientDb.close();
            
            res.json({ 
                success: true, 
                message: 'Login exitoso',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    businessName: client.businessName
                }
            });
        }
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Login específico para Super Admin
router.post('/superadmin-login', superadminLoginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuario y contraseña son requeridos' 
            });
        }
        
        console.log('🔐 Intento de login Super Admin:', { username });
        
        // Buscar usuario en la base de datos MASTER
        const user = await User.findOne({ username: username.toLowerCase() });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas' 
            });
        }
        
        // Verificar que sea un usuario admin
        if (user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos de Super Admin' 
            });
        }
        
        // Verificar si está activo
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                message: 'Usuario inactivo. Contacta al administrador.' 
            });
        }
        
        // Verificar contraseña
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas' 
            });
        }
        
        // Actualizar último login
        await user.updateLastLogin();
        
        // Crear sesión de Super Admin
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;
        req.session.isSuperAdmin = true;
        req.session.superAdminRole = user.superAdminRole || 'owner';
        
        // Guardar la sesión explícitamente antes de responder
        req.session.save((err) => {
            if (err) {
                console.error('Error guardando sesión:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error guardando sesión' 
                });
            }
            
            console.log(`✅ Login Super Admin exitoso: ${user.username} (${user.role})`);
            console.log('🔑 Sesión creada:', { 
                sessionID: req.sessionID,
                userId: req.session.userId,
                role: req.session.role 
            });
            
            res.json({ 
                success: true, 
                message: 'Login exitoso',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    superAdminRole: user.superAdminRole || 'owner'
                }
            });
        });
        
    } catch (error) {
        console.error('Error en superadmin-login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Logout
router.post('/logout', auth, (req, res) => {
    try {
        const username = req.user.username;
        
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destruyendo sesión:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al cerrar sesión' 
                });
            }
            
            console.log(`👋 Logout: ${username}`);
            res.json({ 
                success: true, 
                message: 'Sesión cerrada exitosamente' 
            });
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// ========== ACTIVACIÓN DE CUENTA ==========

// Rate limit para activaciones: 5 intentos / 30 min para evitar abuso de tokens
const activationLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req),
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Demasiados intentos de activación. Espera 30 minutos.'
        });
    }
});

// Rate limit para reenvío de emails de activación: 5 intentos / 24 horas por email
const resendActivationLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const email = String(req.body?.email || '').toLowerCase().trim().slice(0, 120);
        return `resend-activation:${email}`;
    },
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Ya has solicitado reenvío de emails. Intenta mañana o contacta con soporte.'
        });
    }
});

// POST /api/auth/activate-account
// Verifica el token de activación y establece la contraseña inicial del propietario
router.post('/activate-account', activationLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: 'Token y contraseña son requeridos'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 8 caracteres'
            });
        }

        // Buscar cliente con ese token que no haya expirado
        const client = await Client.findOne({
            activationToken: token,
            activationTokenExpires: { $gt: new Date() }
        });

        if (!client) {
            return res.status(400).json({
                success: false,
                message: 'El enlace de activación no es válido o ha expirado. Contacta con soporte.'
            });
        }

        console.log(`📝 Preparando para activar cuenta: ${client.owner.username}`);
        
        // Actualizar la contraseña
        // IMPORTANTE: No usar markModified con texto plano - dejar que pre-save hook lo detecte
        client.owner.password = password;
        client.activationToken = null;
        client.activationTokenExpires = null;

        console.log(`💾 Hasheando y guardando contraseña...`);
        await client.save();

        // Verificar que se guardó correctamente
        const savedClient = await Client.findById(client._id);
        const passwordIsHashed = savedClient.owner.password.startsWith('$2');
        console.log(`✅ Cuenta activada: ${savedClient.owner.username}`);
        console.log(`   - Contraseña hasheada: ${passwordIsHashed ? 'SÍ' : 'NO'}`);
        console.log(`   - Hash comienza con: ${savedClient.owner.password.substring(0, 10)}...`);

        res.json({
            success: true,
            message: 'Cuenta activada correctamente. Ya puedes iniciar sesión.',
            domain: client.domain
        });
    } catch (error) {
        console.error('Error en activate-account:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor'
        });
    }
});

// POST /api/auth/resend-activation-email
// Reenvía el email de activación si el token ha expirado
router.post('/resend-activation-email', resendActivationLimiter, async (req, res) => {
    try {
        const { email, userType = 'client' } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email es requerido'
            });
        }

        const sanitizedEmail = String(email).toLowerCase().trim();

        // Si es para un cliente (propietario)
        if (userType === 'client') {
            const client = await Client.findOne({ 'owner.email': sanitizedEmail });

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            // Si ya está activado, no reenviar
            if (!client.activationToken) {
                return res.status(400).json({
                    success: false,
                    message: 'Esta cuenta ya está activada. Por favor inicia sesión.'
                });
            }

            // Generar nuevo token
            const activationToken = crypto.randomBytes(32).toString('hex');
            const activationTokenExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

            client.activationToken = activationToken;
            client.activationTokenExpires = activationTokenExpires;
            await client.save();

            // Construir URL de activación
            const activationUrl = `http://localhost:3000/activate-account?token=${activationToken}`;

            // Enviar email
            await emailService.sendActivationEmail(client, activationUrl);

            console.log(`📧 Email de activación reenviado a: ${client.owner.email}`);

            res.json({
                success: true,
                message: 'Se ha reenviado el email de activación. Revisa tu bandeja de entrada.'
            });
        } 
        // Si es para un empleado del tenant
        else if (userType === 'employee') {
            console.log(`📧 Reenvío de activación para empleado. Email: ${sanitizedEmail}, Session:`, {
                clientId: req.session?.clientId,
                userId: req.session?.userId,
                isSuperAdmin: req.session?.isSuperAdmin,
                hasTenantDb: !!req.tenantDb
            });

            const ScopedUserModel = getScopedUserModel(req);
            if (!ScopedUserModel) {
                console.error(`❌ No se pudo obtener ScopedUserModel. Session:`, {
                    clientId: req.session?.clientId,
                    userId: req.session?.userId,
                    isSuperAdmin: req.session?.isSuperAdmin,
                    hasTenantDb: !!req.tenantDb
                });
                return res.status(500).json({
                    success: false,
                    message: 'Conexión de tenant no disponible'
                });
            }

            const user = await ScopedUserModel.findOne({ email: sanitizedEmail });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            // Si ya está activado, no reenviar
            if (!user.activationToken) {
                return res.status(400).json({
                    success: false,
                    message: 'Esta cuenta ya está activada. Por favor inicia sesión.'
                });
            }

            // Generar nuevo token
            const activationToken = crypto.randomBytes(32).toString('hex');
            const activationTokenExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

            user.activationToken = activationToken;
            user.activationTokenExpires = activationTokenExpires;
            await user.save();

            // Obtener información del cliente para el email
            let client = null;
            if (req.session?.clientId) {
                client = await Client.findById(req.session.clientId);
            }

            // Obtener dominio del tenant
            let clientDomain = req.get('host') || 'localhost:3000';
            if (req.tenantDomain && req.tenantDomain !== 'localhost') {
                clientDomain = req.tenantDomain;
            }

            // Construir URL de activación
            const activationUrl = `http://${clientDomain}/activate-account?token=${activationToken}`;

            // Enviar email
            // Para empleados, USAR SIEMPRE EMAIL SIMPLE (sin mencionar FrescosEnVivo)
            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
                <div style="background: white; padding: 30px; border-radius: 8px;">
                    <h2>Hola ${user.fullName},</h2>
                    <p>Se ha creado tu cuenta de usuario. Solo falta un paso: haz clic en el botón de abajo para activarla y establecer tu contraseña.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${activationUrl}" style="display: inline-block; padding: 14px 40px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Activar mi cuenta</a>
                    </div>
                    <p style="color: #666; margin-top: 20px; font-size: 14px;">⏳ <strong>Este enlace caduca en 72 horas.</strong> Si no lo usas a tiempo, contacta con soporte para que te envíen uno nuevo.</p>
                </div>
            </div>
            `;
            
            const emailText = `Hola ${user.fullName},\n\nSe ha creado tu cuenta de usuario. Solo falta un paso: haz clic en el enlace para activarla y establecer tu contraseña.\n\nActivala aquí: ${activationUrl}\n\nEste enlace caduca en 72 horas.`;
            
            // Enviar email directo
            if (emailService.sendEmail) {
                await emailService.sendEmail({
                    to: user.email,
                    subject: 'Activa tu cuenta de usuario',
                    html: emailHtml,
                    text: emailText
                });
            } else {
                console.warn('⚠️ sendEmail no disponible en emailService');
            }

            console.log(`📧 Email de activación reenviado a empleado: ${user.email}`);

            res.json({
                success: true,
                message: 'Se ha reenviado el email de activación. Revisa tu bandeja de entrada.'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Tipo de usuario inválido'
            });
        }

    } catch (error) {
        console.error('❌ Error reenviando email de activación:', {
            message: error.message,
            stack: error.stack,
            email: req.body?.email,
            userType: req.body?.userType
        });
        res.status(500).json({
            success: false,
            message: `Error en el servidor: ${error.message}`
        });
    }
});

// ========== RUTAS PROTEGIDAS ==========

// Obtener usuario actual
router.get('/me', auth, async (req, res) => {
    try {
        res.json({ 
            success: true, 
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                fullName: req.user.fullName || req.user.businessName,
                role: req.user.role,
                businessName: req.user.businessName || null,
                isOwner: req.user.isOwner || false,
                isSuperAdmin: Boolean(req.session?.isSuperAdmin),
                superAdminRole: req.session?.superAdminRole || null
            }
        });
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Cambiar contraseña
router.post('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Contraseña actual y nueva son requeridas' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La nueva contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        // Si es propietario del tenant, la contraseña vive en Client.owner
        if (req.session?.clientId && !req.session?.isSuperAdmin && String(req.session.userId) === String(req.session.clientId)) {
            const client = await Client.findById(req.session.clientId);

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            const isMatchOwner = await client.comparePassword(currentPassword);

            if (!isMatchOwner) {
                return res.status(401).json({
                    success: false,
                    message: 'Contraseña actual incorrecta'
                });
            }

            client.owner.password = newPassword;
            client.markModified('owner.password');
            await client.save();

            console.log(`🔑 Contraseña de propietario cambiada: ${client.owner.username}`);

            return res.json({
                success: true,
                message: 'Contraseña actualizada exitosamente'
            });
        }

        // Usuario normal (master o tenant)
        const ScopedUserModel = getScopedUserModel(req);
        if (!ScopedUserModel) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }

        const user = await ScopedUserModel.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const isMatch = await user.comparePassword(currentPassword);
        
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
        // Actualizar contraseña
        user.password = newPassword;
        await user.save();
        
        console.log(`🔑 Contraseña cambiada: ${user.username}`);
        
        res.json({ 
            success: true, 
            message: 'Contraseña actualizada exitosamente' 
        });
        
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// ========== RUTAS DE ADMINISTRADOR ==========

// Obtener todos los usuarios
router.get('/users', auth, isAdmin, async (req, res) => {
    try {
        const ScopedUserModel = getScopedUserModel(req);
        if (!ScopedUserModel) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }

        const users = await ScopedUserModel.find()
            .select('-password')
            .sort({ createdAt: -1 });
        
        res.json({ 
            success: true, 
            users 
        });
        
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Crear nuevo usuario (solo admin) - Flujo de activación
router.post('/users', auth, isAdmin, async (req, res) => {
    try {
        const { username, email, fullName, role } = req.body;
        
        // Validaciones
        if (!username || !email || !fullName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan campos requeridos (usuario, email, nombre completo)' 
            });
        }
        
        const ScopedUserModel = getScopedUserModel(req);
        if (!ScopedUserModel) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }

        // Verificar si el usuario ya existe
        const existingUser = await ScopedUserModel.findOne({ 
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'El usuario o email ya existe' 
            });
        }
        
        // Generar token de activación (válido 72 horas)
        const activationToken = crypto.randomBytes(32).toString('hex');
        const activationTokenExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
        
        // Crear usuario SIN contraseña (se establecerá en activación)
        const newUser = new ScopedUserModel({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            fullName,
            role: role || 'empleado',
            password: crypto.randomBytes(16).toString('hex'), // Contraseña temporal inútil (nunca se usa)
            activationToken,
            activationTokenExpires,
            createdBy: req.session?.userId || req.user._id
        });
        
        await newUser.save();
        
        console.log(`👤 Usuario creado (activación pendiente): ${newUser.username} (${newUser.role}) por ${req.user.username}`);
        
        // Obtener el dominio para el email
        let clientDomain = req.get('host') || 'localhost:3000';
        if (req.tenantDomain && req.tenantDomain !== 'localhost') {
            clientDomain = req.tenantDomain;
        }
        
        // Construir URL de activación
        const activationUrl = `http://${clientDomain}/activate-account?token=${activationToken}`;
        
        // Enviar email de activación
        try {
            // Para empleados, usar email simple sin mencionar FrescosEnVivo
            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
                <div style="background: white; padding: 30px; border-radius: 8px;">
                    <h2>Hola ${newUser.fullName},</h2>
                    <p>Se ha creado tu cuenta de usuario. Solo falta un paso: haz clic en el botón de abajo para activarla y establecer tu contraseña.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${activationUrl}" style="display: inline-block; padding: 14px 40px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Activar mi cuenta</a>
                    </div>
                    <p style="color: #666; margin-top: 20px; font-size: 14px;">⏳ <strong>Este enlace caduca en 72 horas.</strong> Si no lo usas a tiempo, contacta con soporte para que te envíen uno nuevo.</p>
                </div>
            </div>
            `;
            
            const emailText = `Hola ${newUser.fullName},\n\nSe ha creado tu cuenta de usuario. Solo falta un paso: haz clic en el enlace para activarla y establecer tu contraseña.\n\nActivala aquí: ${activationUrl}\n\nEste enlace caduca en 72 horas.`;
            
            // Usar sendEmail si está disponible
            if (emailService.sendEmail) {
                await emailService.sendEmail({
                    to: newUser.email,
                    subject: 'Activa tu cuenta de usuario',
                    html: emailHtml,
                    text: emailText
                });
                console.log(`✅ Email de activación enviado a ${newUser.email}`);
            } else {
                console.warn(`⚠️ sendEmail no disponible en emailService para ${newUser.email}`);
            }
        } catch (emailError) {
            console.error(`❌ Error enviando email de activación:`, emailError);
            // No rechazar la creación del usuario si falla el email
        }
        
        res.status(201).json({ 
            success: true, 
            message: 'Usuario creado. Se ha enviado un email de activación con instrucciones para establecer la contraseña.',
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                fullName: newUser.fullName,
                role: newUser.role
            }
        });
        
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Actualizar usuario (solo admin)
router.put('/users/:id', auth, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, fullName, role, isActive } = req.body;

        const ScopedUserModel = getScopedUserModel(req);
        if (!ScopedUserModel) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }
        
        const user = await ScopedUserModel.findById(id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        // No permitir que el admin se desactive a sí mismo
        if (user._id.toString() === req.user._id.toString() && isActive === false) {
            return res.status(400).json({ 
                success: false, 
                message: 'No puedes desactivarte a ti mismo' 
            });
        }
        
        // Actualizar campos
        if (email) user.email = email;
        if (fullName) user.fullName = fullName;
        if (role) user.role = role;
        if (typeof isActive !== 'undefined') user.isActive = isActive;
        
        await user.save();
        
        console.log(`✏️ Usuario actualizado: ${user.username} por ${req.user.username}`);
        
        res.json({ 
            success: true, 
            message: 'Usuario actualizado exitosamente',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isActive: user.isActive
            }
        });
        
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Eliminar usuario (solo admin)
router.delete('/users/:id', auth, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const ScopedUserModel = getScopedUserModel(req);
        if (!ScopedUserModel) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }
        
        const user = await ScopedUserModel.findById(id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        // No permitir que el admin se elimine a sí mismo
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ 
                success: false, 
                message: 'No puedes eliminarte a ti mismo' 
            });
        }
        
        await ScopedUserModel.findByIdAndDelete(id);
        
        console.log(`🗑️ Usuario eliminado: ${user.username} por ${req.user.username}`);
        
        res.json({ 
            success: true, 
            message: 'Usuario eliminado exitosamente' 
        });
        
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// Resetear contraseña de usuario (solo admin)
router.post('/users/:id/reset-password', auth, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        const ScopedUserModel = getScopedUserModel(req);
        if (!ScopedUserModel) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }

        const user = await ScopedUserModel.findById(id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        user.password = newPassword;
        await user.save();
        
        console.log(`🔑 Contraseña reseteada: ${user.username} por ${req.user.username}`);
        
        res.json({ 
            success: true, 
            message: 'Contraseña reseteada exitosamente' 
        });
        
    } catch (error) {
        console.error('Error reseteando contraseña:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

module.exports = router;

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Client = require('../models/Client');

// Middleware para verificar si el usuario está autenticado
const auth = async (req, res, next) => {
    try {
        console.log('🔐 Auth middleware:', {
            sessionID: req.sessionID,
            userId: req.session?.userId,
            clientId: req.session?.clientId,
            hasSession: !!req.session,
            cookies: req.headers.cookie ? 'present' : 'missing'
        });
        
        if (!req.session || !req.session.userId) {
            console.log('❌ No hay sesión activa');
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado. Por favor inicia sesión.' 
            });
        }

        // CASO 1: Es propietario de un tenant (clientId en sesión)
        if (req.session.clientId) {
            const client = await Client.findById(req.session.clientId);
            if (!client) {
                return res.status(401).json({ success: false, message: 'Cliente no encontrado' });
            }
            if (!client.isActive()) {
                return res.status(403).json({ success: false, message: 'Cuenta inactiva' });
            }
            // Construir objeto user compatible con el resto del código
            req.user = {
                _id: client._id,
                username: client.owner.username,
                email: client.owner.email,
                fullName: client.owner.fullName,
                role: 'admin',
                isActive: true,
                businessName: client.businessName,
                isOwner: true
            };
            // Asegurar que req.client también está seteado
            if (!req.client) {
                req.client = {
                    _id: client._id,
                    id: client._id,
                    businessName: client.businessName,
                    slug: client.slug,
                    domain: client.domain,
                    branding: client.branding,
                    limits: client.limits,
                    plan: client.plan,
                    config: client.config
                };
            }
            console.log('✅ Propietario autenticado:', client.owner.username, 'de', client.businessName);
            return next();
        }

        // CASO 2: Es usuario master (superadmin o usuario en DB maestra)
        const user = await User.findById(req.session.userId);
        if (!user) {
            console.log('❌ Usuario no encontrado en DB:', req.session.userId);
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        if (!user.isActive) {
            return res.status(403).json({ success: false, message: 'Usuario inactivo' });
        }
        console.log('✅ Usuario master autenticado:', user.username);
        req.user = user;
        next();

    } catch (error) {
        console.error('Error en middleware de autenticación:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error de autenticación' 
        });
    }
};

// Middleware para verificar si el usuario es administrador
const isAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso denegado. Solo administradores.' 
            });
        }
        
        next();
    } catch (error) {
        console.error('Error en middleware de admin:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error de autorización' 
        });
    }
};

// Middleware para verificar si el usuario puede acceder al vendor panel
const canAccessVendor = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        // Admin y empleado pueden acceder
        if (req.user.role === 'admin' || req.user.role === 'empleado') {
            next();
        } else {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso denegado' 
            });
        }
    } catch (error) {
        console.error('Error en middleware de acceso:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error de autorización' 
        });
    }
};

module.exports = { auth, isAdmin, canAccessVendor };

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Client = require('../models/Client');

function normalizeUserPayload(userDoc, extra = {}) {
    return {
        _id: userDoc._id,
        username: userDoc.username,
        email: userDoc.email,
        fullName: userDoc.fullName,
        role: userDoc.role,
        isActive: userDoc.isActive,
        lastLogin: userDoc.lastLogin || null,
        createdAt: userDoc.createdAt || null,
        ...extra
    };
}

// Middleware para verificar si el usuario está autenticado
const auth = async (req, res, next) => {
    try {
        // Verificar si hay sesión activa
        if (!(req.session && req.session.userId)) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado. Por favor inicia sesión.' 
            });
        }

        const { userId, clientId, isSuperAdmin } = req.session;

        // Sesión de superadmin/master
        if (isSuperAdmin || !clientId) {
            const user = await User.findById(userId);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            if (!user.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Usuario inactivo'
                });
            }

            req.user = user;
            return next();
        }

        // Sesión de tenant (cliente)
        const client = await Client.findById(clientId);

        if (!client) {
            return res.status(401).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        if (!client.isActive()) {
            return res.status(403).json({
                success: false,
                message: 'Cuenta de cliente inactiva'
            });
        }

        // Propietario del negocio (se guarda userId = client._id en sesión)
        if (String(userId) === String(client._id)) {
            req.user = normalizeUserPayload({
                _id: client._id,
                username: client.owner.username,
                email: client.owner.email,
                fullName: client.owner.fullName || client.businessName,
                role: 'admin',
                isActive: true,
                lastLogin: client.stats?.lastActivityAt,
                createdAt: client.createdAt
            }, {
                businessName: client.businessName,
                clientId: client._id,
                isOwner: true
            });

            return next();
        }

        // Usuario interno del tenant (empleado/admin de la DB dedicada)
        const tenantDb = req.tenantDb;

        if (!tenantDb) {
            return res.status(500).json({
                success: false,
                message: 'Conexión de tenant no disponible'
            });
        }

        const TenantUserModel = tenantDb.models.User || tenantDb.model('User', User.schema);
        const tenantUser = await TenantUserModel.findById(userId);

        if (!tenantUser) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        if (!tenantUser.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Usuario inactivo'
            });
        }

        req.user = tenantUser;
        req.user.clientId = client._id;
        req.user.businessName = client.businessName;
        return next();
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

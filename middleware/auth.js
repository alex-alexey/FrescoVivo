const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar si el usuario está autenticado
const auth = async (req, res, next) => {
    try {
        console.log('🔐 Auth middleware:', {
            sessionID: req.sessionID,
            userId: req.session?.userId,
            hasSession: !!req.session,
            cookies: req.headers.cookie ? 'present' : 'missing'
        });
        
        // Verificar si hay sesión activa
        if (req.session && req.session.userId) {
            // Buscar usuario en la base de datos
            const user = await User.findById(req.session.userId);
            
            if (!user) {
                console.log('❌ Usuario no encontrado en DB:', req.session.userId);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Usuario no encontrado' 
                });
            }
            
            if (!user.isActive) {
                console.log('⚠️ Usuario inactivo:', user.username);
                return res.status(403).json({ 
                    success: false, 
                    message: 'Usuario inactivo' 
                });
            }
            
            console.log('✅ Usuario autenticado:', user.username);
            
            // Agregar usuario a la request
            req.user = user;
            next();
        } else {
            console.log('❌ No hay sesión activa');
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado. Por favor inicia sesión.' 
            });
        }
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

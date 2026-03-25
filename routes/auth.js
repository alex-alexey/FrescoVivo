const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Client = require('../models/Client');
const mongoose = require('mongoose');
const { auth, isAdmin } = require('../middleware/auth');

// ========== RUTAS PÚBLICAS ==========

// Login
router.post('/login', async (req, res) => {
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
            
            console.log(`✅ Login exitoso (Super Admin): ${user.username} (${user.role})`);
            
            res.json({ 
                success: true, 
                message: 'Login exitoso',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role
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
                const isMatch = await client.comparePassword(password);
                
                if (!isMatch) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Credenciales inválidas' 
                    });
                }
                
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
router.post('/superadmin-login', async (req, res) => {
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
                    role: user.role
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
                isOwner: req.user.isOwner || false
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
        
        // Verificar contraseña actual
        const user = await User.findById(req.user._id);
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
        const users = await User.find()
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

// Crear nuevo usuario (solo admin)
router.post('/users', auth, isAdmin, async (req, res) => {
    try {
        const { username, email, password, fullName, role } = req.body;
        
        // Validaciones
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son requeridos' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ 
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'El usuario o email ya existe' 
            });
        }
        
        // Crear usuario
        const newUser = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password,
            fullName,
            role: role || 'empleado',
            createdBy: req.user._id
        });
        
        await newUser.save();
        
        console.log(`👤 Usuario creado: ${newUser.username} (${newUser.role}) por ${req.user.username}`);
        
        res.status(201).json({ 
            success: true, 
            message: 'Usuario creado exitosamente',
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
        
        const user = await User.findById(id);
        
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
        
        const user = await User.findById(id);
        
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
        
        await User.findByIdAndDelete(id);
        
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
        
        const user = await User.findById(id);
        
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

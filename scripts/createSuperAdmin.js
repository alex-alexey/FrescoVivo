require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function createSuperAdmin() {
    try {
        // Conectar a MongoDB
        const mongoUri = process.env.MONGO_URI;
        
        if (!mongoUri) {
            console.error('❌ MONGO_URI no está configurado en las variables de entorno');
            process.exit(1);
        }

        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');

        // Verificar si ya existe un Super Admin
        const existingAdmin = await User.findOne({ role: 'admin' });
        
        if (existingAdmin) {
            console.log('✅ Super Admin ya existe:');
            console.log('   👤 Usuario:', existingAdmin.username);
            console.log('   📧 Email:', existingAdmin.email);
            console.log('   🔑 Rol:', existingAdmin.role);
            console.log('');
            console.log('⚠️  Si olvidaste la contraseña, elimina este usuario y ejecuta el script de nuevo');
            process.exit(0);
        }

        // Crear Super Admin
        console.log('📝 Creando Super Admin...');
        
        const admin = new User({
            username: 'admin',
            email: 'admin@frescosenvivo.com',
            password: 'admin123', // Se encriptará automáticamente con el pre-save hook
            fullName: 'Super Administrador',
            role: 'admin',
            isActive: true
        });

        await admin.save();

        console.log('');
        console.log('✅ Super Admin creado exitosamente!');
        console.log('');
        console.log('📋 Credenciales:');
        console.log('   👤 Usuario: admin');
        console.log('   🔑 Contraseña: admin123');
        console.log('   📧 Email: admin@frescosenvivo.com');
        console.log('');
        console.log('⚠️  IMPORTANTE: Cambia estas credenciales después del primer login');
        console.log('');
        console.log('🌐 Accede al panel en:');
        console.log('   https://pescadolive.onrender.com/superadmin-login.html');
        console.log('');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Ejecutar
createSuperAdmin();

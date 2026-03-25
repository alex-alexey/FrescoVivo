require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function resetAdminPassword() {
    try {
        // Conectar a MongoDB
        const mongoUri = process.env.MONGO_URI;
        
        if (!mongoUri) {
            console.error('❌ MONGO_URI no está configurado');
            process.exit(1);
        }

        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');

        // Buscar admin
        const admin = await User.findOne({ role: 'admin' });
        
        if (!admin) {
            console.log('❌ No se encontró ningún Super Admin');
            console.log('   Ejecuta: node scripts/createSuperAdmin.js');
            process.exit(1);
        }

        console.log('📝 Super Admin encontrado:');
        console.log('   👤 Usuario:', admin.username);
        console.log('   📧 Email:', admin.email);
        console.log('');

        // Resetear contraseña
        console.log('🔄 Reseteando contraseña...');
        admin.password = 'admin123'; // Se encriptará automáticamente
        await admin.save();

        console.log('');
        console.log('✅ Contraseña reseteada exitosamente!');
        console.log('');
        console.log('📋 Nuevas credenciales:');
        console.log('   👤 Usuario:', admin.username);
        console.log('   🔑 Contraseña: admin123');
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
resetAdminPassword();

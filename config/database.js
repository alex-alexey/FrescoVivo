const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

        console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
        console.log(`📊 Base de datos: ${conn.connection.name}`);
        
        // Crear usuario admin por defecto si no existe
        await createDefaultAdmin();
        
    } catch (error) {
        console.error(`❌ Error conectando a MongoDB: ${error.message}`);
        process.exit(1);
    }
};

// Crear usuario administrador por defecto
const createDefaultAdmin = async () => {
    try {
        const User = require('../models/User');
        
        // Verificar si ya existe un admin
        const adminExists = await User.findOne({ role: 'admin' });
        
        if (!adminExists) {
            const defaultAdmin = new User({
                username: 'admin',
                email: 'admin@pescadolive.com',
                password: 'admin123', // Cambiar en producción
                fullName: 'Administrador',
                role: 'admin'
            });
            
            await defaultAdmin.save();
            console.log('👤 Usuario administrador creado:');
            console.log('   📧 Email: admin@pescadolive.com');
            console.log('   🔑 Password: admin123');
            console.log('   ⚠️  CAMBIAR CONTRASEÑA EN PRODUCCIÓN');
        }
    } catch (error) {
        console.error('❌ Error creando admin por defecto:', error.message);
    }
};

module.exports = connectDB;

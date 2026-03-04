require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const initDatabase = async () => {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB');

        // Verificar si ya existe un admin
        const adminExists = await User.findOne({ role: 'admin' });
        
        if (adminExists) {
            console.log('ℹ️  Usuario administrador ya existe:');
            console.log(`   👤 Usuario: ${adminExists.username}`);
            console.log(`   📧 Email: ${adminExists.email}`);
            console.log(`   🔑 Rol: ${adminExists.role}`);
        } else {
            // Crear usuario admin
            const admin = new User({
                username: 'admin',
                email: 'admin@pescadolive.com',
                password: 'admin123',
                fullName: 'Administrador',
                role: 'admin',
                isActive: true
            });

            await admin.save();
            
            console.log('✅ Usuario administrador creado exitosamente!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('   👤 Usuario: admin');
            console.log('   🔑 Contraseña: admin123');
            console.log('   📧 Email: admin@pescadolive.com');
            console.log('   🎯 Rol: Administrador');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('⚠️  IMPORTANTE: Cambia la contraseña después del primer login');
        }

        // Crear un empleado de ejemplo si no existe
        const empleadoExists = await User.findOne({ username: 'empleado1' });
        
        if (!empleadoExists) {
            const empleado = new User({
                username: 'empleado1',
                email: 'empleado1@pescadolive.com',
                password: 'empleado123',
                fullName: 'Empleado Ejemplo',
                role: 'empleado',
                isActive: true
            });

            await empleado.save();
            
            console.log('\n✅ Usuario empleado creado exitosamente!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('   👤 Usuario: empleado1');
            console.log('   🔑 Contraseña: empleado123');
            console.log('   📧 Email: empleado1@pescadolive.com');
            console.log('   🎯 Rol: Empleado');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        console.log('\n📊 Resumen de usuarios en la base de datos:');
        const totalUsers = await User.countDocuments();
        const admins = await User.countDocuments({ role: 'admin' });
        const empleados = await User.countDocuments({ role: 'empleado' });
        
        console.log(`   Total: ${totalUsers}`);
        console.log(`   Administradores: ${admins}`);
        console.log(`   Empleados: ${empleados}`);
        
        console.log('\n✅ Inicialización completada');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        process.exit(1);
    }
};

initDatabase();

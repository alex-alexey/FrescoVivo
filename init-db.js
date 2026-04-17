require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const initDatabase = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

        if (!mongoUri) {
            console.error('❌ Falta URI de MongoDB. Define MONGODB_URI o MONGO_URI');
            process.exit(1);
        }

        // Conectar a MongoDB
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');

        // Verificar si ya existe un admin
        const adminExists = await User.findOne({ role: 'admin' });
        
        if (adminExists) {
            console.log('ℹ️  Usuario administrador ya existe:');
            console.log(`   👤 Usuario: ${adminExists.username}`);
            console.log(`   📧 Email: ${adminExists.email}`);
            console.log(`   🎯 Rol: ${adminExists.role}`);
        } else {
            const adminUser = process.env.INIT_ADMIN_USER || process.env.ADMIN_USER;
            const adminEmail = process.env.INIT_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
            const adminPass = process.env.INIT_ADMIN_PASS || process.env.ADMIN_PASS;

            if (!adminUser || !adminEmail || !adminPass) {
                console.error('❌ Faltan variables de entorno para crear el admin:');
                console.error('   INIT_ADMIN_USER/ADMIN_USER, INIT_ADMIN_EMAIL/ADMIN_EMAIL, INIT_ADMIN_PASS/ADMIN_PASS');
                process.exit(1);
            }

            if (adminPass.length < 8) {
                console.error('❌ INIT_ADMIN_PASS debe tener al menos 8 caracteres');
                process.exit(1);
            }

            const admin = new User({
                username: adminUser.toLowerCase().trim(),
                email: adminEmail.toLowerCase().trim(),
                password: adminPass,
                fullName: 'Administrador',
                role: 'admin',
                isActive: true
            });

            await admin.save();

            console.log('✅ Usuario administrador creado exitosamente!');
            console.log(`   👤 Usuario: ${admin.username}`);
            console.log(`   📧 Email: ${admin.email}`);
            console.log('   🎯 Rol: Administrador');
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

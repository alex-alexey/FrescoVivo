/**
 * Script de diagnóstico para verificar el estado del sistema
 * Uso: node scripts/diagnose.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function diagnose() {
    console.log('🔍 Iniciando diagnóstico del sistema...\n');
    
    try {
        // 1. Verificar variables de entorno
        console.log('📋 1. Variables de Entorno:');
        console.log('   MONGO_URI:', process.env.MONGO_URI ? '✅ Configurada' : '❌ No configurada');
        console.log('   SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Configurada' : '❌ No configurada');
        console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
        console.log('   EMAIL_SERVICE:', process.env.EMAIL_SERVICE || '❌ No configurada');
        console.log('');
        
        // 2. Conectar a MongoDB
        console.log('🔌 2. Conexión a MongoDB:');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('   ✅ Conectado a MongoDB');
        console.log('   Database:', mongoose.connection.db.databaseName);
        console.log('');
        
        // 3. Verificar colecciones
        console.log('📦 3. Colecciones en la base de datos:');
        const collections = await mongoose.connection.db.listCollections().toArray();
        collections.forEach(col => {
            console.log(`   - ${col.name}`);
        });
        console.log('');
        
        // 4. Verificar usuarios Super Admin
        console.log('👤 4. Usuarios Super Admin:');
        const User = require('../models/User');
        const admins = await User.find({ role: 'admin' });
        if (admins.length === 0) {
            console.log('   ❌ No hay usuarios admin');
        } else {
            admins.forEach(admin => {
                console.log(`   ✅ ${admin.username} (${admin.email}) - Activo: ${admin.isActive}`);
            });
        }
        console.log('');
        
        // 5. Verificar sesiones
        console.log('🔑 5. Sesiones activas:');
        const sessionsCol = mongoose.connection.db.collection('sessions');
        const sessionCount = await sessionsCol.countDocuments();
        console.log(`   Total de sesiones: ${sessionCount}`);
        
        if (sessionCount > 0) {
            const recentSessions = await sessionsCol
                .find({})
                .sort({ expires: -1 })
                .limit(5)
                .toArray();
            
            console.log('   Últimas 5 sesiones:');
            recentSessions.forEach((sess, i) => {
                const session = JSON.parse(sess.session);
                console.log(`   ${i + 1}. User: ${session.username || 'N/A'} - Expira: ${new Date(sess.expires).toLocaleString()}`);
            });
        }
        console.log('');
        
        // 6. Verificar clientes
        console.log('🏪 6. Clientes registrados:');
        const Client = require('../models/Client');
        const clients = await Client.find({});
        console.log(`   Total de clientes: ${clients.length}`);
        if (clients.length > 0) {
            clients.forEach(client => {
                console.log(`   - ${client.businessName} (${client.domain}) - Status: ${client.status}`);
            });
        }
        console.log('');
        
        // 7. Verificar configuraciones de tienda
        console.log('🎨 7. Configuraciones de tienda:');
        const StoreConfig = require('../models/StoreConfig');
        const storeConfigs = await StoreConfig.countDocuments();
        console.log(`   Total de tiendas configuradas: ${storeConfigs}`);
        console.log('');
        
        // 8. Verificar cámaras
        console.log('📹 8. Cámaras configuradas:');
        const Camera = require('../models/Camera');
        const cameras = await Camera.countDocuments();
        console.log(`   Total de cámaras: ${cameras}`);
        console.log('');
        
        // 9. Resumen
        console.log('✅ Diagnóstico completado\n');
        console.log('📊 Resumen:');
        console.log(`   - Usuarios Admin: ${admins.length}`);
        console.log(`   - Clientes: ${clients.length}`);
        console.log(`   - Sesiones activas: ${sessionCount}`);
        console.log(`   - Tiendas configuradas: ${storeConfigs}`);
        console.log(`   - Cámaras: ${cameras}`);
        console.log('');
        
        // Recomendaciones
        if (admins.length === 0) {
            console.log('⚠️  RECOMENDACIÓN: Ejecuta node scripts/createSuperAdmin.js');
        }
        if (clients.length === 0) {
            console.log('ℹ️  INFO: No hay clientes registrados. Crea uno desde el Super Admin panel.');
        }
        
    } catch (error) {
        console.error('❌ Error durante el diagnóstico:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión cerrada');
    }
}

// Ejecutar
diagnose();

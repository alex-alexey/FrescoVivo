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

// Auto-creación de admin eliminada por seguridad.
// Usa el script `node init-db.js` con variables de entorno INIT_ADMIN_USER,
// INIT_ADMIN_EMAIL e INIT_ADMIN_PASS para crear el primer usuario superadmin.
const createDefaultAdmin = async () => {};

module.exports = connectDB;

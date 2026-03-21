const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: Number,
    image: String,
    category: String,
    available: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { _id: true });

const storeConfigSchema = new mongoose.Schema({
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        unique: true
    },
    
    // Información básica de la tienda
    storeName: {
        type: String,
        required: true,
        default: 'Mi Negocio'
    },
    tagline: {
        type: String,
        default: 'Productos frescos de calidad'
    },
    description: {
        type: String,
        default: 'Bienvenido a nuestra tienda'
    },
    
    // Branding
    logo: {
        type: String, // URL de la imagen
        default: ''
    },
    colors: {
        primary: { type: String, default: '#2563eb' },
        secondary: { type: String, default: '#059669' },
        accent: { type: String, default: '#f59e0b' }
    },
    
    // Imágenes
    heroImage: {
        type: String,
        default: ''
    },
    gallery: [{
        url: String,
        caption: String,
        order: Number
    }],
    
    // Productos
    products: [productSchema],
    
    // Horarios
    schedule: {
        monday: { open: String, close: String, closed: Boolean },
        tuesday: { open: String, close: String, closed: Boolean },
        wednesday: { open: String, close: String, closed: Boolean },
        thursday: { open: String, close: String, closed: Boolean },
        friday: { open: String, close: String, closed: Boolean },
        saturday: { open: String, close: String, closed: Boolean },
        sunday: { open: String, close: String, closed: Boolean }
    },
    
    // Contacto
    contact: {
        phone: String,
        email: String,
        address: String,
        city: String,
        postalCode: String,
        country: { type: String, default: 'España' }
    },
    
    // Redes sociales
    social: {
        facebook: String,
        instagram: String,
        twitter: String,
        whatsapp: String
    },
    
    // Configuración de funcionalidades
    features: {
        showProducts: { type: Boolean, default: true },
        showSchedule: { type: Boolean, default: true },
        showContact: { type: Boolean, default: true },
        showGallery: { type: Boolean, default: true },
        enableOnlineQueue: { type: Boolean, default: true },
        enableVideocall: { type: Boolean, default: true }
    },
    
    // SEO
    seo: {
        title: String,
        description: String,
        keywords: [String]
    },
    
    // Configuración avanzada
    customCSS: {
        type: String,
        default: ''
    },
    
    // Estado
    published: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Índices
storeConfigSchema.index({ clientId: 1 });

// Método para obtener la configuración con valores por defecto
storeConfigSchema.methods.getPublicConfig = function() {
    return {
        storeName: this.storeName,
        tagline: this.tagline,
        description: this.description,
        logo: this.logo,
        colors: this.colors,
        heroImage: this.heroImage,
        gallery: this.gallery,
        products: this.products.filter(p => p.available),
        schedule: this.schedule,
        contact: this.contact,
        social: this.social,
        features: this.features,
        seo: this.seo
    };
};

module.exports = mongoose.model('StoreConfig', storeConfigSchema);

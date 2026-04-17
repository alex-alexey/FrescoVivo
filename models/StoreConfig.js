const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: Number,
    priceUnit: { type: String, default: '€/kg' },
    icon: { type: String, default: '🐟' },
    iconColor: { type: String, default: 'pi-blue' },
    category: String,
    badge: String,
    badgeType: { type: String, default: 'badge-fresh' },
    image: String,
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
    favicon: {
        type: String,
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
    typographyPreset: {
        type: String,
        enum: ['moderna', 'clasica', 'mercado'],
        default: 'moderna'
    },
    visualStylePreset: {
        type: String,
        enum: ['clasico', 'moderno', 'mercado', 'premium'],
        default: 'moderno'
    },
    cameraTitles: {
        type: [String],
        default: [
            'Mostrador - Pescado fresco',
            'Zona mariscos',
            'Moluscos y cefalopodos',
            'Zona conservas y ahumados'
        ]
    },
    cameraSlotOrder: {
        type: [Number],
        default: [1, 2, 3, 4]
    },
    cameraEnabled: {
        type: [Boolean],
        default: [true, true, true, true]
    },
    cameraTitleVisibility: {
        type: [Boolean],
        default: [true, true, true, true]
    },
    cameraProducts: {
        type: [{
            icon: { type: String, default: '🐟' },
            name: { type: String, default: '' },
            price: { type: String, default: '' },
            promoLabel: { type: String, default: '' },
            visible: { type: Boolean, default: true }
        }],
        default: [
            { icon: '🐟', name: 'Lubina salvaje', price: '11.90€/kg', promoLabel: '', visible: true },
            { icon: '🦐', name: 'Gamba roja', price: '38€/kg', promoLabel: '', visible: true },
            { icon: '🐙', name: 'Pulpo gallego', price: '12.80€/kg', promoLabel: '', visible: true },
            { icon: '🥫', name: 'Conservas artesanas', price: 'desde 3.50€', promoLabel: '', visible: true }
        ]
    },
    gallery: [{
        url: String,
        caption: String,
        order: Number
    }],
    
    // Productos
    products: [productSchema],
    sectionTexts: {
        products: {
            label: { type: String, default: 'Catálogo' },
            title: { type: String, default: 'El género de hoy' }
        },
        schedule: {
            label: { type: String, default: 'Horarios y ubicación' },
            title: { type: String, default: 'Encuéntranos' }
        },
        contact: {
            label: { type: String, default: 'Contacto' },
            title: { type: String, default: 'Habla con nosotros' }
        }
    },
    
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
        country: { type: String, default: 'España' },
        mapsUrl: String
    },
    contactCards: {
        phone: {
            icon: { type: String, default: '📞' },
            helpText: { type: String, default: 'Disponible en horario de apertura' }
        },
        email: {
            icon: { type: String, default: '✉️' },
            helpText: { type: String, default: 'Respondemos en menos de 24h' }
        },
        whatsapp: {
            icon: { type: String, default: '💬' },
            helpText: { type: String, default: 'La forma más rápida de hacer un encargo' }
        }
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

    // Contenido editable para addons premium (habilitación en Client.features)
    premiumDesign: {
        heroBadgeText: {
            type: String,
            default: ''
        },
        heroCtaText: {
            type: String,
            default: ''
        }
    },
    reputation: {
        rating: {
            type: Number,
            default: 0
        },
        reviewCount: {
            type: Number,
            default: 0
        },
        featuredReview: {
            type: String,
            default: ''
        }
    },

    // Textos legales / pie
    legal: {
        footerNotice: {
            type: String,
            default: ''
        },
        legalNotice: {
            type: String,
            default: 'Aviso legal'
        },
        copyrightText: {
            type: String,
            default: ''
        }
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

// Método para obtener la configuración con valores por defecto
storeConfigSchema.methods.getPublicConfig = function() {
    return {
        storeName: this.storeName,
        tagline: this.tagline,
        description: this.description,
        logo: this.logo,
        favicon: this.favicon,
        colors: this.colors,
        heroImage: this.heroImage,
        typographyPreset: this.typographyPreset,
        visualStylePreset: this.visualStylePreset,
        cameraTitles: this.cameraTitles,
        cameraSlotOrder: this.cameraSlotOrder,
        cameraEnabled: this.cameraEnabled,
        cameraTitleVisibility: this.cameraTitleVisibility,
        cameraProducts: this.cameraProducts,
        gallery: this.gallery,
        products: this.products.filter(p => p.available),
        sectionTexts: this.sectionTexts,
        schedule: this.schedule,
        contact: this.contact,
        contactCards: this.contactCards,
        social: this.social,
        features: this.features,
        seo: this.seo,
        premiumDesign: this.premiumDesign,
        reputation: this.reputation,
        legal: this.legal
    };
};

module.exports = mongoose.model('StoreConfig', storeConfigSchema);

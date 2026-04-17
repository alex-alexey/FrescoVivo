const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
    // Información del Negocio
    businessName: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    
    // Dominio Personalizado
    domain: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
        // Ejemplo: "pescaderiajuan.com" o "mariscospepe.es"
    },
    storeType: {
        type: String,
        enum: ['pescaderia', 'marisqueria', 'carniceria', 'charcuteria', 'polleria', 'fruteria', 'panaderia', 'otra'],
        default: 'pescaderia'
    },
    
    // Información del Propietario
    owner: {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        password: {
            type: String,
            required: true
        },
        fullName: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            trim: true
        }
    },
    
    // Base de Datos Dedicada
    database: {
        name: {
            type: String,
            required: true,
            unique: true
            // Ejemplo: "pescado_db_cliente123"
        },
        connectionString: {
            type: String,
            required: true
            // URI completa de MongoDB para este cliente
        }
    },
    
    // Personalización de Marca
    branding: {
        logo: {
            type: String,
            default: null
            // Ruta al logo: /uploads/clients/cliente123/logo.png
        },
        primaryColor: {
            type: String,
            default: '#1565a0'
        },
        secondaryColor: {
            type: String,
            default: '#f5c842'
        },
        favicon: {
            type: String,
            default: null
        }
    },
    
    // Plan y Límites
    plan: {
        type: String,
        enum: ['basico', 'profesional', 'empresarial', 'personalizado'],
        default: 'basico'
    },
    
    // Características Premium
    features: {
        seoPro: {
            type: Boolean,
            default: false
        },
        premiumDesigns: {
            type: Boolean,
            default: false
        },
        reviewsReputation: {
            type: Boolean,
            default: false
        }
    },

    // Facturación
    billing: {
        currency: {
            type: String,
            default: 'EUR'
        },
        basePlanPrice: {
            type: Number,
            default: 39,
            min: 0
        },
        addonPrices: {
            seoPro: {
                type: Number,
                default: 19,
                min: 0
            },
            premiumDesigns: {
                type: Number,
                default: 29,
                min: 0
            },
            reviewsReputation: {
                type: Number,
                default: 15,
                min: 0
            }
        },
        discount: {
            type: Number,
            default: 0,
            min: 0
        },
        billingDayOfMonth: {
            type: Number,
            default: 5,
            min: 1,
            max: 28
        },
        nextDueDate: {
            type: Date,
            default: null
        },
        lastPaidAt: {
            type: Date,
            default: null
        },
        paymentStatus: {
            type: String,
            enum: ['al_dia', 'pendiente', 'vencido', 'pausado'],
            default: 'pendiente'
        }
    },

    // Datos fiscales para emisión de factura
    billingInfo: {
        legalName: {
            type: String,
            default: ''
        },
        taxId: {
            type: String,
            default: ''
        },
        billingEmail: {
            type: String,
            default: ''
        },
        fiscalAddress: {
            type: String,
            default: ''
        },
        postalCode: {
            type: String,
            default: ''
        },
        city: {
            type: String,
            default: ''
        },
        province: {
            type: String,
            default: ''
        },
        country: {
            type: String,
            default: 'España'
        }
    },
    
    limits: {
        maxDailyTickets: {
            type: Number,
            default: 200
        },
        maxCameras: {
            type: Number,
            default: 4
        },
        maxKiosks: {
            type: Number,
            default: 2
        },
        maxVendors: {
            type: Number,
            default: 3
        },
        storageQuotaMB: {
            type: Number,
            default: 1000 // 1GB
        }
    },
    
    // Estado y Fechas
    status: {
        type: String,
        enum: ['activo', 'suspendido', 'prueba', 'expirado', 'eliminado'],
        default: 'prueba'
    },
    subscriptionStartDate: {
        type: Date,
        default: Date.now
    },
    subscriptionEndDate: {
        type: Date,
        default: null
        // Si es null, es ilimitado o vitalicio
    },
    trialEndsAt: {
        type: Date,
        default: function() {
            // 30 días de prueba por defecto
            const date = new Date();
            date.setDate(date.getDate() + 30);
            return date;
        }
    },
    
    // Información Adicional
    notes: {
        type: String,
        default: ''
    },
    tags: [{
        type: String,
        trim: true
    }],
    
    // Estadísticas de Uso
    stats: {
        totalTicketsIssued: {
            type: Number,
            default: 0
        },
        totalCustomersServed: {
            type: Number,
            default: 0
        },
        lastActivityAt: {
            type: Date,
            default: null
        },
        storageUsedMB: {
            type: Number,
            default: 0
        }
    },
    
    // Configuración Técnica
    config: {
        allowPublicRegistration: {
            type: Boolean,
            default: false
        },
        requireEmailVerification: {
            type: Boolean,
            default: false
        },
        enableKiosk: {
            type: Boolean,
            default: true
        },
        enableOnlineQueue: {
            type: Boolean,
            default: true
        },
        enableInStoreQueue: {
            type: Boolean,
            default: true
        },
        enableLiveStreaming: {
            type: Boolean,
            default: true
        }
    },
    
    // Token de activación de cuenta (primer acceso)
    activationToken: {
        type: String,
        default: null
    },
    activationTokenExpires: {
        type: Date,
        default: null
    },

    // Auditoría
    createdBy: {
        type: String,
        default: 'superadmin'
    },
    lastModifiedBy: {
        type: String,
        default: null
    },

    // Historial de Facturas
    invoices: [{
        invoiceId: {
            type: String,
            required: true
        },
        invoiceNumber: {
            type: String,
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        },
        amount: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['sent', 'paid', 'unpaid', 'overdue', 'cancelled'],
            default: 'sent'
        },
        dueDate: {
            type: Date
        },
        paidDate: {
            type: Date,
            default: null
        }
    }]
}, {
    timestamps: true
});

// Índices para mejorar las búsquedas
clientSchema.index({ status: 1 });

// Hook pre-save para hashear la contraseña
clientSchema.pre('save', async function() {
    // Solo hashear si la contraseña no está ya hasheada (no empieza con bcrypt hash)
    if (this.owner.password && !this.owner.password.startsWith('$2')) {
        console.log('🔒 Hasheando contraseña para:', this.owner.username);
        const salt = await bcrypt.genSalt(10);
        this.owner.password = await bcrypt.hash(this.owner.password, salt);
        console.log('✅ Contraseña hasheada correctamente');
    }
});

// Método para verificar contraseña
clientSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.owner.password);
};

// Método para verificar si está activo
clientSchema.methods.isActive = function() {
    if (this.status === 'eliminado') return false;
    if (this.status === 'suspendido') return false;
    if (this.status === 'expirado') return false;
    
    // Verificar si la suscripción ha expirado
    if (this.subscriptionEndDate && this.subscriptionEndDate < new Date()) {
        return false;
    }
    
    // Verificar si el trial ha expirado
    if (this.status === 'prueba' && this.trialEndsAt && this.trialEndsAt < new Date()) {
        return false;
    }
    
    return true;
};

// Método para generar nombre de base de datos único
clientSchema.statics.generateDatabaseName = function(slug) {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `pescado_${slug}_${randomSuffix}`.replace(/[^a-z0-9_]/g, '_');
};

// Método virtual para obtener la URL completa
clientSchema.virtual('fullUrl').get(function() {
    return `https://${this.domain}/nuestroproducto`;
});

module.exports = mongoose.model('Client', clientSchema);

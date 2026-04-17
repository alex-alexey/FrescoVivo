const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    
    // Información de la cámara
    name: {
        type: String,
        required: true,
        default: 'Cámara'
    },
    
    description: {
        type: String,
        default: ''
    },
    
    // Posición/Orden de visualización (1 = principal, 2-4 = secundarias)
    position: {
        type: Number,
        required: true,
        default: 1,
        min: 1,
        max: 4
    },
    
    // Identificador único de la cámara (para WebRTC)
    cameraId: {
        type: String,
        required: true,
        unique: true
    },
    
    // Tipo de cámara
    type: {
        type: String,
        enum: ['webcam', 'ip', 'rtsp', 'usb'],
        default: 'webcam'
    },
    
    // Estado
    isActive: {
        type: Boolean,
        default: true
    },
    
    isLive: {
        type: Boolean,
        default: false
    },
    
    // Configuración específica de streaming
    streamConfig: {
        resolution: {
            type: String,
            enum: ['low', 'medium', 'high', 'hd'],
            default: 'medium'
        },
        fps: {
            type: Number,
            default: 30,
            min: 15,
            max: 60
        },
        bitrate: {
            type: Number,
            default: 1500 // kbps
        }
    },
    
    // Estadísticas
    stats: {
        totalViews: {
            type: Number,
            default: 0
        },
        totalStreamTime: {
            type: Number,
            default: 0 // minutos
        },
        lastStreamStart: Date,
        lastStreamEnd: Date,
        currentViewers: {
            type: Number,
            default: 0
        }
    },
    
    // Restricciones
    restrictions: {
        maxViewers: {
            type: Number,
            default: 100
        },
        requireAuth: {
            type: Boolean,
            default: false
        },
        allowRecording: {
            type: Boolean,
            default: false
        }
    },
    
    // Metadata
    deviceInfo: {
        deviceId: String,
        label: String,
        kind: String
    },
    
    // Configuración avanzada
    settings: {
        showInStore: {
            type: Boolean,
            default: true
        },
        showInVendor: {
            type: Boolean,
            default: true
        },
        autoStart: {
            type: Boolean,
            default: false
        },
        enableAudio: {
            type: Boolean,
            default: true
        }
    }
}, {
    timestamps: true
});

// Índices
cameraSchema.index({ clientId: 1, position: 1 });
cameraSchema.index({ clientId: 1, isActive: 1 });

// Métodos
cameraSchema.methods.startStream = async function() {
    this.isLive = true;
    this.stats.lastStreamStart = new Date();
    this.stats.currentViewers = 0;
    await this.save();
};

cameraSchema.methods.stopStream = async function() {
    this.isLive = false;
    this.stats.lastStreamEnd = new Date();
    
    // Calcular tiempo de streaming
    if (this.stats.lastStreamStart) {
        const duration = Math.floor((Date.now() - this.stats.lastStreamStart) / 60000); // minutos
        this.stats.totalStreamTime += duration;
    }
    
    this.stats.currentViewers = 0;
    await this.save();
};

cameraSchema.methods.incrementViews = async function() {
    this.stats.totalViews += 1;
    await this.save();
};

cameraSchema.methods.updateViewers = async function(count) {
    this.stats.currentViewers = count;
    await this.save();
};

// Estáticos
cameraSchema.statics.getClientCameras = async function(clientId, activeOnly = false) {
    const query = { clientId };
    if (activeOnly) {
        query.isActive = true;
    }
    return this.find(query).sort({ position: 1 });
};

cameraSchema.statics.getActiveCameras = async function(clientId) {
    return this.find({ 
        clientId, 
        isActive: true,
        isLive: true 
    }).sort({ position: 1 });
};

cameraSchema.statics.getCameraByPosition = async function(clientId, position) {
    return this.findOne({ clientId, position });
};

module.exports = mongoose.model('Camera', cameraSchema);

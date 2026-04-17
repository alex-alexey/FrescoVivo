const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3
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
        required: true,
        minlength: 6
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['admin', 'empleado'],
        default: 'empleado'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    activationToken: {
        type: String,
        default: null
    },
    activationTokenExpires: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // Agrega createdAt y updatedAt automáticamente
});

// Encriptar contraseña antes de guardar
userSchema.pre('save', async function() {
    // Solo hashear si la contraseña fue modificada Y existe
    if (!this.isModified('password') || !this.password) {
        return;
    }
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Método para obtener usuario sin contraseña
userSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    return user;
};

// Método para actualizar último login
userSchema.methods.updateLastLogin = async function() {
    this.lastLogin = new Date();
    await this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;

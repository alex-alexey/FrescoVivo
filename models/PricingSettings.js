const mongoose = require('mongoose');

const pricingSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: 'global'
    },
    plans: {
        basico: { type: Number, min: 0, default: 39 },
        profesional: { type: Number, min: 0, default: 79 },
        empresarial: { type: Number, min: 0, default: 149 },
        personalizado: { type: Number, min: 0, default: 249 }
    },
    addons: {
        seoPro: { type: Number, min: 0, default: 19 },
        premiumDesigns: { type: Number, min: 0, default: 29 },
        reviewsReputation: { type: Number, min: 0, default: 15 }
    },
    currency: {
        type: String,
        default: 'EUR'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PricingSettings', pricingSettingsSchema);

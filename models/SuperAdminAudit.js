const mongoose = require('mongoose');

const superAdminAuditSchema = new mongoose.Schema(
    {
        actor: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                default: null
            },
            username: {
                type: String,
                required: true,
                trim: true
            },
            role: {
                type: String,
                default: 'admin'
            }
        },
        action: {
            type: String,
            required: true,
            trim: true
        },
        target: {
            type: {
                type: String,
                default: 'client'
            },
            clientId: {
                type: mongoose.Schema.Types.ObjectId,
                default: null
            },
            businessName: {
                type: String,
                default: ''
            },
            domain: {
                type: String,
                default: ''
            }
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        requestMeta: {
            ip: {
                type: String,
                default: ''
            },
            userAgent: {
                type: String,
                default: ''
            }
        },
        status: {
            type: String,
            enum: ['success', 'failed'],
            default: 'success'
        }
    },
    {
        timestamps: true
    }
);

superAdminAuditSchema.index({ createdAt: -1 });
superAdminAuditSchema.index({ action: 1, createdAt: -1 });
superAdminAuditSchema.index({ 'target.clientId': 1, createdAt: -1 });

module.exports = mongoose.models.SuperAdminAudit || mongoose.model('SuperAdminAudit', superAdminAuditSchema);

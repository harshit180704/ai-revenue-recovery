const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        eventType: {
            type: String,
            enum: [
                "INCIDENT_DETECTED",
                "REVENUE_ATTRIBUTED",
                "RECOVERY_PREDICTED",
                "RECOVERY_OPTIMIZED",
                "RECOVERY_APPROVED",
                "RECOVERY_BLOCKED",
                "RECOVERY_EXECUTED",
                "RECOVERY_SUCCEEDED",
                "RECOVERY_FAILED"
            ],
            required: true
        },

        paymentId: {
            type: String,
            default: null
        },

        merchantId: {
            type: String,
            default: null
        },

        incidentId: {
            type: String,
            default: null
        },

        action: {
            type: String,
            default: null
        },

        amount: {
            type: Number,
            default: 0
        },

        amountRecovered: {
            type: Number,
            default: 0
        },

        recoveryProbability: {
            type: Number,
            default: null
        },

        expectedRecovery: {
            type: Number,
            default: null
        },

        expectedNetRecovery: {
            type: Number,
            default: null
        },

        status: {
            type: String,
            default: null
        },

        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "AuditLog",
    auditLogSchema
);
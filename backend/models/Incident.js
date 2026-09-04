const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema({

    incidentId: {
        type: String,
        required: true,
        unique: true
    },

    type: {
        type: String,
        enum: [
            "payment_degradation",
            "checkout_abandonment",
            "subscription_failure",
            "unknown"
        ],
        required: true
    },

    paymentMethod: {
        type: String,
        default: null
    },

    bank: {
        type: String,
        default: null
    },

    startTime: {
        type: Date,
        default: null
    },

    endTime: {
        type: Date,
        default: null
    },

    affectedMerchants: {
        type: Number,
        default: 0
    },

    affectedTransactions: {
        type: Number,
        default: 0
    },

    grossRevenueAtRisk: {
        type: Number,
        default: 0
    },

    recoverableRevenue: {
        type: Number,
        default: 0
    },

    recoveredRevenue: {
        type: Number,
        default: 0
    },

    confidence: {
        type: Number,
        default: 0
    },

    rootCause: {
        type: String,
        default: null
    },

    status: {
        type: String,
        enum: [
            "active",
            "investigating",
            "recovery",
            "resolved"
        ],
        default: "investigating"
    }

});

module.exports = mongoose.model(
    "Incident",
    incidentSchema
);
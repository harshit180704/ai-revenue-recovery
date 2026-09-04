const mongoose = require("mongoose");

const paymentEventSchema = new mongoose.Schema({

    paymentId: {
        type: String,
        required: true,
        unique: true
    },

    merchantId: {
        type: String,
        required: true
    },

    customerId: {
        type: String,
        required: true
    },

    amount: {
        type: Number,
        required: true
    },

    currency: {
        type: String,
        default: "INR"
    },

    method: {
        type: String,
        enum: [
            "upi",
            "card",
            "netbanking",
            "wallet"
        ],
        required: true
    },

    bank: {
        type: String,
        default: null
    },

    status: {
        type: String,
        enum: [
            "success",
            "failed",
            "abandoned",
            "pending",
            "recovered"
        ],
        required: true
    },

    failureReason: {
        type: String,
        default: null
    },

    device: {
        type: String,
        enum: [
            "android",
            "ios",
            "web"
        ]
    },

    paymentType: {
        type: String,
        enum: [
            "one_time",
            "subscription"
        ],
        default: "one_time"
    },

    timestamp: {
        type: Date,
        required: true
    },

    // ==========================================
    // ORIGINAL RETRY COUNT
    // ==========================================

    retryCount: {
        type: Number,
        default: 0
    },

    // ==========================================
    // AUTOMATED RECOVERY TRACKING
    // ==========================================

    autoRecoveryAttempts: {
        type: Number,
        default: 0
    },

    lastRecoveryAttempt: {
        type: Date,
        default: null
    },

    // ==========================================
    // INCIDENT TRACKING
    // ==========================================

    incidentId: {
        type: String,
        default: null
    }

});

module.exports = mongoose.model(
    "PaymentEvent",
    paymentEventSchema
);
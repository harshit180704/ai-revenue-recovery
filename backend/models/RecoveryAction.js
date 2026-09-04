const mongoose = require("mongoose");

const recoveryActionSchema = new mongoose.Schema({

    incidentId: String,

    paymentId: String,

    merchantId: String,

    action: {
        type: String,
        enum: [
            "RETRY_NOW",
            "DELAYED_RETRY",
            "ALTERNATE_METHOD",
            "PAYMENT_LINK",
            "CUSTOMER_CONTACT",
            "HUMAN_ESCALATION",
            "NO_ACTION"
        ]
    },

    recoveryProbability: Number,

    expectedRevenue: Number,

    interventionCost: Number,

    expectedNetRecovery: Number,

    reason: String,

    policyStatus: String,

    executionStatus: String,

    executedAt: Date

});

module.exports = mongoose.model(
    "RecoveryAction",
    recoveryActionSchema
);
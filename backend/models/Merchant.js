const mongoose = require("mongoose");

const merchantSchema = new mongoose.Schema({
    merchantId: {
        type: String,
        required: true,
        unique: true
    },

    name: {
        type: String,
        required: true
    },

    category: {
        type: String,
        required: true
    },

    monthlyTPV: {
        type: Number,
        required: true
    },

    averageOrderValue: {
        type: Number,
        required: true
    }
});

module.exports = mongoose.model("Merchant", merchantSchema);
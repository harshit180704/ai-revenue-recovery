const Merchant = require("../models/Merchant");
const PaymentEvent = require("../models/PaymentEvent");

const methods = [
    "upi",
    "card",
    "netbanking",
    "wallet"
];

const banks = [
    "HDFC",
    "SBI",
    "ICICI",
    "AXIS"
];

const categories = [
    "ecommerce",
    "food",
    "travel",
    "education",
    "fashion"
];

const devices = [
    "android",
    "ios",
    "web"
];

function randomItem(array) {
    return array[
        Math.floor(Math.random() * array.length)
    ];
}

function randomAmount() {
    return Math.floor(
        Math.random() * 49000
    ) + 100;
}

function randomCustomer() {
    return `customer_${Math.floor(
        Math.random() * 2000
    )}`;
}

async function generateData() {

    console.log("Clearing old data...");

    await Merchant.deleteMany({});
    await PaymentEvent.deleteMany({});

    console.log("Creating merchants...");

    const merchants = [];

    for (let i = 1; i <= 50; i++) {

        merchants.push({

            merchantId: `merchant_${i}`,

            name: `Merchant ${i}`,

            category: randomItem(categories),

            monthlyTPV:
                Math.floor(
                    Math.random() * 9000000
                ) + 1000000,

            averageOrderValue:
                Math.floor(
                    Math.random() * 5000
                ) + 500
        });
    }

    await Merchant.insertMany(merchants);

    console.log("50 merchants created.");

    console.log("Creating payment events...");

    const payments = [];

    for (let i = 1; i <= 50000; i++) {

        // Select payment method
        const method = randomItem(methods);

        // Normal success probability
        const successProbability = {

            upi: 0.96,

            card: 0.94,

            netbanking: 0.91,

            wallet: 0.95

        }[method];

        // Decide whether payment succeeds
        const success =
            Math.random() < successProbability;

        // Random timestamp within previous 7 days
        const timestamp = new Date(
            Date.now()
            -
            Math.random()
            *
            7
            *
            24
            *
            60
            *
            60
            *
            1000
        );

        // 15% of payments are subscription payments
        const paymentType =
            Math.random() < 0.15
                ? "subscription"
                : "one_time";

        payments.push({

            paymentId:
                `payment_${i}`,

            merchantId:
                randomItem(merchants).merchantId,

            customerId:
                randomCustomer(),

            amount:
                randomAmount(),

            currency:
                "INR",

            method,

            // Only UPI payments have a bank
            bank:
                method === "upi"
                    ? randomItem(banks)
                    : null,

            status:
                success
                    ? "success"
                    : "failed",

            failureReason:
                success
                    ? null
                    : randomItem([
                        "bank_timeout",
                        "network_error",
                        "authentication_failed",
                        "insufficient_funds"
                    ]),

            device:
                randomItem(devices),

            // IMPORTANT:
            // Store paymentType in MongoDB
            paymentType,

            timestamp,

            retryCount: 0,

            incidentId: null

        });
    }

    await PaymentEvent.insertMany(payments);

    console.log(
        "50,000 payment events created."
    );

    console.log(
        "Data generation completed."
    );
}

module.exports = generateData;
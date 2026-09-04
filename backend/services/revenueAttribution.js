const PaymentEvent = require("../models/PaymentEvent");

async function calculateRevenueImpact(incident) {

    const payments =
        await PaymentEvent.find({

            method:
                incident.paymentMethod,

            bank:
                incident.bank,

            timestamp: {
                $gte:
                    incident.startTime,

                $lte:
                    incident.endTime
            },

            status: "failed",

            incidentId:
                {
                    $ne: null
                }
        });

    /*
    Find unique merchants
    */

    const merchantIds =
        new Set();

    let revenueAtRisk = 0;

    for (const payment of payments) {

        merchantIds.add(
            payment.merchantId
        );

        revenueAtRisk +=
            payment.amount;
    }

    /*
    Estimate recoverable revenue.

    This is deliberately conservative.
    We will replace this with the
    ML model later.
    */

    const recoveryRate = 0.60;

    const recoverableRevenue =
        revenueAtRisk *
        recoveryRate;

    return {

        affectedMerchants:
            merchantIds.size,

        affectedTransactions:
            payments.length,

        revenueAtRisk,

        recoverableRevenue

    };
}

module.exports =
    calculateRevenueImpact;
const PaymentEvent = require("../models/PaymentEvent");

async function createIncidents() {

    console.log(
        "Creating realistic time-based incidents..."
    );

    /*
    ==========================================
    INCIDENT 1
    UPI + HDFC degradation
    ==========================================
    */

    const upiPayments =
        await PaymentEvent.find({
            method: "upi",
            bank: "HDFC"
        }).sort({
            timestamp: 1
        });

    /*
    Pick 400 consecutive payments.
    Give them timestamps within a
    60-minute incident window.
    */

    const upiStartIndex = 1000;

    const upiIncident =
        upiPayments.slice(
            upiStartIndex,
            upiStartIndex + 400
        );

    const incidentStart =
        new Date("2026-08-30T14:00:00");

    let upiCount = 0;

    for (
        let i = 0;
        i < upiIncident.length;
        i++
    ) {

        const payment =
            upiIncident[i];

        /*
        Spread events across
        60 minutes.
        */

        payment.timestamp =
            new Date(
                incidentStart.getTime()
                +
                i *
                9 *
                1000
            );

        /*
        Make approximately 70%
        of previously successful
        payments fail.
        */

        if (
            Math.random() < 0.70
        ) {

            payment.status =
                "failed";

            payment.failureReason =
                "bank_timeout";

            payment.incidentId =
                "INC_UPI_HDFC_001";

            upiCount++;
        }

        await payment.save();
    }


    /*
    ==========================================
    INCIDENT 2
    MOBILE CHECKOUT ABANDONMENT
    ==========================================
    */

    const mobilePayments =
        await PaymentEvent.find({
            device: {
                $in: [
                    "android",
                    "ios"
                ]
            }
        }).sort({
            timestamp: 1
        });

    const checkoutStartIndex =
        2000;

    const checkoutIncident =
        mobilePayments.slice(
            checkoutStartIndex,
            checkoutStartIndex + 400
        );

    const checkoutStart =
        new Date("2026-08-30T17:00:00");

    let checkoutCount = 0;

    for (
        let i = 0;
        i < checkoutIncident.length;
        i++
    ) {

        const payment =
            checkoutIncident[i];

        payment.timestamp =
            new Date(
                checkoutStart.getTime()
                +
                i *
                9 *
                1000
            );

        /*
        Turn a portion of successful
        checkout attempts into
        abandoned sessions.
        */

        if (
            payment.status === "success" &&
            Math.random() < 0.65
        ) {

            payment.status =
                "abandoned";

            payment.failureReason =
                "checkout_abandonment";

            payment.incidentId =
                "INC_MOBILE_CHECKOUT_001";

            checkoutCount++;
        }

        await payment.save();
    }


    /*
    ==========================================
    INCIDENT 3
    SUBSCRIPTION FAILURE
    ==========================================
    */

    const subscriptionPayments =
        await PaymentEvent.find({
            paymentType:
                "subscription"
        }).sort({
            timestamp: 1
        });

    const subscriptionIncident =
        subscriptionPayments.slice(
            500,
            800
        );

    const subscriptionStart =
        new Date("2026-08-30T20:00:00");

    let subscriptionCount = 0;

    for (
        let i = 0;
        i < subscriptionIncident.length;
        i++
    ) {

        const payment =
            subscriptionIncident[i];

        payment.timestamp =
            new Date(
                subscriptionStart.getTime()
                +
                i *
                12 *
                1000
            );

        if (
            payment.status === "success" &&
            Math.random() < 0.70
        ) {

            payment.status =
                "failed";

            payment.failureReason =
                "subscription_payment_failed";

            payment.incidentId =
                "INC_SUBSCRIPTION_001";

            subscriptionCount++;
        }

        await payment.save();
    }


    console.log(
        `UPI/HDFC incident events: ${upiCount}`
    );

    console.log(
        `Checkout incident events: ${checkoutCount}`
    );

    console.log(
        `Subscription incident events: ${subscriptionCount}`
    );

    console.log(
        "Time-based incident simulation completed."
    );
}

module.exports = createIncidents;
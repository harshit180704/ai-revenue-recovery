const PaymentEvent = require("../models/PaymentEvent");


// ==========================================
// TEST-MODE RECOVERY EXECUTOR
// ==========================================
//
// IMPORTANT:
// This does NOT perform real Razorpay payments.
// It only simulates the recovery workflow
// against our synthetic/test payment records.
//
// ==========================================


async function executeRecovery(
    paymentId,
    action
) {

    // ------------------------------------------
    // Find payment
    // ------------------------------------------

    const payment =
        await PaymentEvent.findOne({
            paymentId
        });


    if (!payment) {

        throw new Error(
            "Payment not found"
        );

    }


    // ------------------------------------------
    // Make sure payment is recoverable
    // ------------------------------------------

    if (
        payment.status !== "failed"
    ) {

        return {

            success: false,

            status: "not_executable",

            message:
                "Payment is not currently failed",

            paymentId

        };

    }


    // ------------------------------------------
    // Check automatic attempt limit
    // ------------------------------------------

    if (
        payment.autoRecoveryAttempts >= 2
    ) {

        return {

            success: false,

            status: "blocked",

            message:
                "Maximum automatic recovery attempts reached",

            paymentId

        };

    }


    // ------------------------------------------
    // Record recovery attempt
    // ------------------------------------------

    payment.autoRecoveryAttempts += 1;

    payment.lastRecoveryAttempt =
        new Date();

    payment.retryCount += 1;


    // ------------------------------------------
    // Simulate recovery probability
    // ------------------------------------------
    //
    // The actual probability would normally
    // come from our ML model.
    //
    // For this execution simulator, we use
    // action-specific probabilities so that
    // the demo can produce both successes
    // and failures.
    //

    const actionProbability = {

        RETRY_NOW: 0.65,

        DELAYED_RETRY: 0.75,

        ALTERNATE_METHOD: 0.80,

        NO_ACTION: 0.00

    };


    const probability =
        actionProbability[action] ||
        0;


    // ------------------------------------------
    // Random execution outcome
    // ------------------------------------------

    const randomValue =
        Math.random();

    const recovered =
        randomValue < probability;


    // ------------------------------------------
    // Handle successful recovery
    // ------------------------------------------

    if (recovered) {

        payment.status =
            "recovered";

        payment.failureReason =
            null;

        await payment.save();


        return {

            success: true,

            status: "recovered",

            paymentId,

            action,

            amountRecovered:
                payment.amount,

            recoveryAttempt:
                payment.autoRecoveryAttempts,

            executedAt:
                payment.lastRecoveryAttempt

        };

    }


    // ------------------------------------------
    // Handle failed recovery
    // ------------------------------------------

    await payment.save();


    return {

        success: false,

        status: "failed",

        paymentId,

        action,

        amountRecovered: 0,

        recoveryAttempt:
            payment.autoRecoveryAttempts,

        executedAt:
            payment.lastRecoveryAttempt

    };

}


module.exports =
    executeRecovery;
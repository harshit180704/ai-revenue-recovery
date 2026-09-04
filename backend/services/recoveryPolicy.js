// ==========================================
// RECOVERY POLICY / SAFETY GATE
// ==========================================

// Maximum amount allowed for automatic recovery
const MAX_AUTO_RECOVERY_AMOUNT = 50000;

// Maximum number of previous retries allowed
const MAX_RETRIES = 2;

// Minimum probability required for automatic action
const MIN_RECOVERY_PROBABILITY = 0.60;

// Maximum number of automatic recovery attempts
// for a single payment
const MAX_AUTO_ATTEMPTS = 2;


// ==========================================
// CHECK WHETHER RECOVERY IS ALLOWED
// ==========================================

function evaluateRecoveryPolicy({

    payment,
    recommendation,
    incident

}) {

    const reasons = [];

    let allowed = true;


    // ==========================================
    // 1. CHECK PAYMENT AMOUNT
    // ==========================================

    if (
        payment.amount >
        MAX_AUTO_RECOVERY_AMOUNT
    ) {

        allowed = false;

        reasons.push(
            "Payment amount exceeds automatic recovery limit"
        );

    }


    // ==========================================
    // 2. CHECK PREVIOUS RETRIES
    // ==========================================

    if (
        payment.retryCount >=
        MAX_RETRIES
    ) {

        allowed = false;

        reasons.push(
            "Maximum retry limit reached"
        );

    }


    // ==========================================
    // 3. CHECK RECOVERY CONFIDENCE
    // ==========================================

    if (
        recommendation.recoveryProbability <
        MIN_RECOVERY_PROBABILITY
    ) {

        allowed = false;

        reasons.push(
            "Recovery probability is below safety threshold"
        );

    }


    // ==========================================
    // 4. CHECK INCIDENT STATUS
    // ==========================================

    if (
        incident &&
        incident.status === "resolved"
    ) {

        allowed = false;

        reasons.push(
            "Incident has already been resolved"
        );

    }


    // ==========================================
    // 5. CHECK RECOMMENDED ACTION
    // ==========================================

    if (
        !recommendation.recommendedAction
    ) {

        allowed = false;

        reasons.push(
            "No recovery action was recommended"
        );

    }


    // ==========================================
    // 6. NO ACTION SHOULD NEVER EXECUTE
    // ==========================================

    if (
        recommendation.recommendedAction ===
        "NO_ACTION"
    ) {

        allowed = false;

        reasons.push(
            "Optimizer recommended no action"
        );

    }


    // ==========================================
    // 7. CHECK AUTOMATIC ATTEMPT LIMIT
    // ==========================================

    if (
        payment.autoRecoveryAttempts >=
        MAX_AUTO_ATTEMPTS
    ) {

        allowed = false;

        reasons.push(
            "Automatic recovery attempt limit reached"
        );

    }


    // ==========================================
    // FINAL DECISION
    // ==========================================

    return {

        allowed,

        decision:
            allowed
                ? "APPROVED"
                : "BLOCKED",

        reasons:

            reasons.length > 0
                ? reasons
                : [
                    "All recovery policy checks passed"
                ],

        policy: {

            maxAmount:
                MAX_AUTO_RECOVERY_AMOUNT,

            maxRetries:
                MAX_RETRIES,

            minimumProbability:
                MIN_RECOVERY_PROBABILITY,

            maxAutomaticAttempts:
                MAX_AUTO_ATTEMPTS

        }

    };

}


module.exports =
    evaluateRecoveryPolicy;
const predictRecovery =
    require("./recoveryPredictor");


// ==========================================
// AVAILABLE RECOVERY ACTIONS
// ==========================================

const ACTIONS = [
    "RETRY_NOW",
    "DELAYED_RETRY",
    "ALTERNATE_METHOD",
    "NO_ACTION"
];


// ==========================================
// ACTION COSTS
// ==========================================
//
// These are synthetic operational costs
// for our buildathon simulation.
//
// They are NOT Razorpay production costs.
//

const ACTION_COSTS = {

    RETRY_NOW: 2,

    DELAYED_RETRY: 1,

    ALTERNATE_METHOD: 3,

    NO_ACTION: 0

};


// ==========================================
// SAFETY LIMITS
// ==========================================

const MAX_RETRY_AMOUNT = 50000;

const MIN_RECOVERY_PROBABILITY = 0.20;


// ==========================================
// OPTIMIZE RECOVERY ACTION
// ==========================================

async function optimizeRecovery(
    payment
) {

    /*
    ------------------------------------------
    Safety check
    ------------------------------------------
    */

    if (
        payment.amount >
        MAX_RETRY_AMOUNT
    ) {

        return {

            recommendedAction:
                "NO_ACTION",

            reason:
                "Payment exceeds automatic recovery limit",

            candidates: []

        };

    }


    const candidates = [];


    /*
    ------------------------------------------
    Evaluate every possible action
    ------------------------------------------
    */

    for (
        const action of ACTIONS
    ) {

        const prediction =
            await predictRecovery({

                amount:
                    payment.amount,

                method:
                    payment.method,

                bank:
                    payment.bank ||
                    "NONE",

                device:
                    payment.device,

                failure_reason:
                    payment.failure_reason,

                previous_success_rate:
                    payment.previous_success_rate,

                previous_failures:
                    payment.previous_failures,

                customer_age_days:
                    payment.customer_age_days,

                action

            });


        const probability =
            prediction.recoveryProbability;


        const expectedRecovery =
            payment.amount *
            probability;


        const actionCost =
            ACTION_COSTS[action];


        const expectedNetRecovery =
            expectedRecovery -
            actionCost;


        candidates.push({

            action,

            recoveryProbability:
                Number(
                    probability.toFixed(4)
                ),

            expectedRecovery:
                Number(
                    expectedRecovery.toFixed(2)
                ),

            actionCost,

            expectedNetRecovery:
                Number(
                    expectedNetRecovery.toFixed(2)
                )

        });

    }


    /*
    ------------------------------------------
    Remove actions with very low probability
    ------------------------------------------
    */

    const eligible =
        candidates.filter(
            candidate =>
                candidate.recoveryProbability >=
                MIN_RECOVERY_PROBABILITY
        );


    /*
    If nothing has sufficient probability,
    don't take an automated action.
    */

    if (
        eligible.length === 0
    ) {

        return {

            recommendedAction:
                "NO_ACTION",

            reason:
                "No recovery action has sufficient confidence",

            candidates

        };

    }


    /*
    ------------------------------------------
    Select highest expected net recovery
    ------------------------------------------
    */

    eligible.sort(
        (
            a,
            b
        ) =>
            b.expectedNetRecovery -
            a.expectedNetRecovery
    );


    const best =
        eligible[0];


    return {

        recommendedAction:
            best.action,

        recoveryProbability:
            best.recoveryProbability,

        expectedRecovery:
            best.expectedRecovery,

        expectedNetRecovery:
            best.expectedNetRecovery,

        reason:
            `Selected ${best.action} because it has the highest expected net recovery`,

        candidates

    };

}


module.exports =
    optimizeRecovery;
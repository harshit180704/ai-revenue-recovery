const mongoose = require("mongoose");
const crypto = require("crypto");
const { spawn } = require("child_process");
const path = require("path");
require("dotenv").config();

const PaymentEvent =
    require("./models/PaymentEvent");

const Incident =
    require("./models/Incident");

const evaluateRecoveryPolicy =
    require("./services/recoveryPolicy");

const MONGO_URI =
    process.env.MONGO_URI;

const BENCHMARK_SIZE = 100;

const ACTIONS = [
    "RETRY_NOW",
    "DELAYED_RETRY",
    "ALTERNATE_METHOD",
    "NO_ACTION"
];

const ACTION_COSTS = {
    RETRY_NOW: 2,
    DELAYED_RETRY: 1,
    ALTERNATE_METHOD: 3,
    NO_ACTION: 0
};

const ACTION_PROBABILITIES = {
    RETRY_NOW: 0.65,
    DELAYED_RETRY: 0.75,
    ALTERNATE_METHOD: 0.80,
    NO_ACTION: 0
};

const MIN_OPTIMIZER_PROBABILITY = 0.20;


// ==================================================
// DETERMINISTIC RECOVERY SIMULATION
// ==================================================

function deterministicRecovery(
    paymentId,
    action
) {

    const hash =
        crypto
            .createHash("sha256")
            .update(
                `${paymentId}:benchmark-v2`
            )
            .digest("hex");

    const numeric =
        parseInt(
            hash.substring(0, 8),
            16
        );

    const score =
        numeric / 0xffffffff;

    const probability =
        ACTION_PROBABILITIES[action] || 0;

    return score < probability;
}


// ==================================================
// BUILD ML INPUT
// ==================================================

function buildWorkflowPayment(
    payment,
    action
) {

    return {

        paymentId:
            payment.paymentId,

        merchantId:
            payment.merchantId,

        customerId:
            payment.customerId,

        amount:
            payment.amount,

        method:
            payment.method,

        bank:
            payment.bank || "NONE",

        device:
            payment.device,

        failure_reason:
            payment.failureReason,

        retryCount:
            payment.retryCount || 0,

        autoRecoveryAttempts:
            payment.autoRecoveryAttempts || 0,

        previous_success_rate:
            0.90,

        previous_failures:
            payment.retryCount || 0,

        customer_age_days:
            400,

        action

    };

}


// ==================================================
// BATCH ML PREDICTION
// ==================================================

function predictBatch(
    inputs
) {

    return new Promise(
        (resolve, reject) => {

            const projectRoot =
                path.join(
                    __dirname,
                    ".."
                );

            const pythonScript =
                path.join(
                    projectRoot,
                    "ml",
                    "predict.py"
                );

            const python =
                spawn(
                    "python",
                    [pythonScript],
                    {
                        cwd:
                            projectRoot
                    }
                );

            let output = "";

            let errorOutput = "";


            python.stdout.on(
                "data",
                data => {

                    output +=
                        data.toString();

                }
            );


            python.stderr.on(
                "data",
                data => {

                    errorOutput +=
                        data.toString();

                }
            );


            python.on(
                "close",
                code => {

                    if (
                        code !== 0
                    ) {

                        reject(
                            new Error(
                                errorOutput ||
                                `Python exited with code ${code}`
                            )
                        );

                        return;

                    }


                    try {

                        const result =
                            JSON.parse(
                                output.trim()
                            );


                        if (
                            result.error
                        ) {

                            reject(
                                new Error(
                                    result.error
                                )
                            );

                            return;

                        }


                        if (
                            !Array.isArray(
                                result
                            )
                        ) {

                            reject(
                                new Error(
                                    "Expected batch prediction array"
                                )
                            );

                            return;

                        }


                        resolve(result);

                    } catch (
                        error
                    ) {

                        reject(
                            new Error(
                                `Invalid ML response: ${output}`
                            )
                        );

                    }

                }
            );


            python.on(
                "error",
                error => {

                    reject(error);

                }
            );


            python.stdin.write(
                JSON.stringify(inputs)
            );

            python.stdin.end();

        }
    );

}


// ==================================================
// AI RECOVERY STRATEGY
// ==================================================

async function runAIStrategy(
    payments,
    incidentMap
) {

    const inputs = [];

    const mapping = [];


    // ----------------------------------------------
    // Create four ML inputs per payment
    // ----------------------------------------------

    for (
        let paymentIndex = 0;
        paymentIndex < payments.length;
        paymentIndex++
    ) {

        const payment =
            payments[paymentIndex];


        for (
            const action of ACTIONS
        ) {

            inputs.push(
                buildWorkflowPayment(
                    payment,
                    action
                )
            );


            mapping.push({

                paymentIndex,

                action

            });

        }

    }


    console.log(
        `Sending ${inputs.length} predictions to ML model...`
    );


    // ----------------------------------------------
    // ONE Python process
    // ----------------------------------------------

    const predictions =
        await predictBatch(
            inputs
        );


    console.log(
        "ML prediction batch complete."
    );


    // ----------------------------------------------
    // Map predictions back to payments/actions
    // ----------------------------------------------

    const predictionMap =
        new Map();


    predictions.forEach(
        (prediction, index) => {

            const key =
                `${mapping[index].paymentIndex}:${mapping[index].action}`;


            predictionMap.set(
                key,
                Number(
                    prediction.recoveryProbability ||
                    0
                )
            );

        }
    );


    let revenueAtRisk = 0;

    let expectedRecovery = 0;

    let recoveredRevenue = 0;

    let candidates = 0;

    let approved = 0;

    let blocked = 0;

    let recovered = 0;

    let failed = 0;

    let incidentBlocked = 0;


    const results = [];


    // ==================================================
    // APPLY OPTIMIZER + POLICY
    // ==================================================

    for (
        let paymentIndex = 0;
        paymentIndex < payments.length;
        paymentIndex++
    ) {

        const payment =
            payments[paymentIndex];


        revenueAtRisk +=
            payment.amount;


        const candidatesForPayment =
            [];


        // ----------------------------------------------
        // Evaluate all four actions
        // ----------------------------------------------

        for (
            const action of ACTIONS
        ) {

            const probability =
                predictionMap.get(
                    `${paymentIndex}:${action}`
                ) || 0;


            const expected =
                payment.amount *
                probability;


            const cost =
                ACTION_COSTS[action];


            candidatesForPayment.push({

                action,

                recoveryProbability:
                    probability,

                expectedRecovery:
                    expected,

                actionCost:
                    cost,

                expectedNetRecovery:
                    expected - cost

            });

        }


        // ----------------------------------------------
        // Optimizer threshold
        // ----------------------------------------------

        const eligible =
            candidatesForPayment.filter(
                candidate =>
                    candidate.recoveryProbability >=
                    MIN_OPTIMIZER_PROBABILITY
            );


        let recommendation;


        if (
            eligible.length === 0
        ) {

            recommendation = {

                recommendedAction:
                    "NO_ACTION",

                recoveryProbability:
                    0,

                expectedRecovery:
                    0,

                expectedNetRecovery:
                    0,

                candidates:
                    candidatesForPayment

            };

        } else {

            eligible.sort(
                (a, b) =>
                    b.expectedNetRecovery -
                    a.expectedNetRecovery
            );


            const best =
                eligible[0];


            recommendation = {

                recommendedAction:
                    best.action,

                recoveryProbability:
                    best.recoveryProbability,

                expectedRecovery:
                    best.expectedRecovery,

                expectedNetRecovery:
                    best.expectedNetRecovery,

                candidates:
                    candidatesForPayment

            };

        }


        expectedRecovery +=
            recommendation.expectedRecovery;


        if (
            recommendation.recommendedAction !==
            "NO_ACTION"
        ) {

            candidates += 1;

        }


        // ==================================================
        // LOAD ASSOCIATED INCIDENT
        // ==================================================

        let incident = null;


        if (
            payment.incidentId
        ) {

            incident =
                incidentMap.get(
                    payment.incidentId
                ) || null;

        }


        // ==================================================
        // REAL SAFETY POLICY
        // ==================================================

        const policy =
            evaluateRecoveryPolicy({

                payment:
                    buildWorkflowPayment(
                        payment,
                        recommendation.recommendedAction
                    ),

                recommendation,

                incident

            });


        if (
            policy.allowed
        ) {

            approved += 1;


            const wasRecovered =
                deterministicRecovery(
                    payment.paymentId,
                    recommendation.recommendedAction
                );


            if (
                wasRecovered
            ) {

                recovered += 1;

                recoveredRevenue +=
                    payment.amount;

            } else {

                failed += 1;

            }


            results.push({

                paymentId:
                    payment.paymentId,

                amount:
                    payment.amount,

                action:
                    recommendation.recommendedAction,

                recoveryProbability:
                    recommendation.recoveryProbability,

                expectedRecovery:
                    recommendation.expectedRecovery,

                expectedNetRecovery:
                    recommendation.expectedNetRecovery,

                policyDecision:
                    policy.decision,

                incidentId:
                    payment.incidentId || null,

                incidentStatus:
                    incident?.status || null,

                recovered:
                    wasRecovered,

                amountRecovered:
                    wasRecovered
                        ? payment.amount
                        : 0

            });

        } else {

            blocked += 1;


            // Specifically track blocks caused
            // by a resolved incident.

            if (
                incident &&
                incident.status === "resolved"
            ) {

                incidentBlocked += 1;

            }


            results.push({

                paymentId:
                    payment.paymentId,

                amount:
                    payment.amount,

                action:
                    recommendation.recommendedAction,

                recoveryProbability:
                    recommendation.recoveryProbability,

                expectedRecovery:
                    recommendation.expectedRecovery,

                expectedNetRecovery:
                    recommendation.expectedNetRecovery,

                policyDecision:
                    policy.decision,

                incidentId:
                    payment.incidentId || null,

                incidentStatus:
                    incident?.status || null,

                recovered:
                    false,

                amountRecovered:
                    0,

                policyReasons:
                    policy.reasons

            });

        }

    }


    const recoveryRate =
        revenueAtRisk > 0
            ?
            (
                recoveredRevenue /
                revenueAtRisk
            ) * 100
            :
            0;


    return {

        strategy:
            "AI_OPTIMIZER",

        paymentsEvaluated:
            payments.length,

        candidates,

        approved,

        blocked,

        incidentBlocked,

        recovered,

        failed,

        revenueAtRisk,

        expectedRecovery,

        recoveredRevenue,

        recoveryRate,

        results

    };

}


// ==================================================
// FIXED RETRY BASELINE
// ==================================================

function runFixedRetryBaseline(
    payments
) {

    let revenueAtRisk = 0;

    let approved = 0;

    let blocked = 0;

    let recovered = 0;

    let failed = 0;

    let recoveredRevenue = 0;


    for (
        const payment of payments
    ) {

        revenueAtRisk +=
            payment.amount;


        let allowed = true;


        if (
            payment.amount > 50000
        ) {

            allowed = false;

        }


        if (
            (payment.retryCount || 0) >= 2
        ) {

            allowed = false;

        }


        if (
            (payment.autoRecoveryAttempts || 0) >= 2
        ) {

            allowed = false;

        }


        if (
            allowed
        ) {

            approved += 1;


            const wasRecovered =
                deterministicRecovery(
                    payment.paymentId,
                    "RETRY_NOW"
                );


            if (
                wasRecovered
            ) {

                recovered += 1;

                recoveredRevenue +=
                    payment.amount;

            } else {

                failed += 1;

            }

        } else {

            blocked += 1;

        }

    }


    const recoveryRate =
        revenueAtRisk > 0
            ?
            (
                recoveredRevenue /
                revenueAtRisk
            ) * 100
            :
            0;


    return {

        strategy:
            "FIXED_RETRY",

        paymentsEvaluated:
            payments.length,

        approved,

        blocked,

        recovered,

        failed,

        revenueAtRisk,

        recoveredRevenue,

        recoveryRate

    };

}


// ==================================================
// FORMATTING
// ==================================================

function money(
    value
) {

    return (
        "₹" +
        Number(
            value || 0
        ).toLocaleString(
            "en-IN",
            {
                maximumFractionDigits: 2
            }
        )
    );

}


function percent(
    value
) {

    return (
        Number(
            value || 0
        ).toFixed(2) +
        "%"
    );

}


// ==================================================
// MAIN
// ==================================================

async function main() {

    console.log("");

    console.log(
        "========================================"
    );

    console.log(
        "     REVENUE RECOVERY BENCHMARK"
    );

    console.log(
        "========================================"
    );

    console.log("");


    try {

        await mongoose.connect(
            MONGO_URI
        );


        console.log(
            "Connected to MongoDB"
        );


        // ==================================================
        // LOAD FAILED PAYMENTS
        // ==================================================

        const payments =
            await PaymentEvent.find({

                status: "failed",

                $or: [

                    {
                        autoRecoveryAttempts: {
                            $lt: 2
                        }
                    },

                    {
                        autoRecoveryAttempts: {
                            $exists: false
                        }
                    }

                ]

            })
            .sort({
                amount: -1
            })
            .limit(
                BENCHMARK_SIZE
            );


        if (
            payments.length === 0
        ) {

            console.log(
                "No eligible failed payments found."
            );

            await mongoose.disconnect();

            return;

        }


        console.log(
            `Payments selected: ${payments.length}`
        );


        // ==================================================
        // LOAD INCIDENTS
        // ==================================================

        const incidentIds =
            [
                ...new Set(
                    payments
                        .map(
                            payment =>
                                payment.incidentId
                        )
                        .filter(
                            Boolean
                        )
                )
            ];


        const incidents =
            incidentIds.length > 0
                ?
                await Incident.find({
                    incidentId: {
                        $in:
                            incidentIds
                    }
                })
                :
                [];


        const incidentMap =
            new Map();


        incidents.forEach(
            incident => {

                incidentMap.set(
                    incident.incidentId,
                    incident
                );

            }
        );


        const paymentsWithIncidents =
            payments.filter(
                payment =>
                    payment.incidentId &&
                    incidentMap.has(
                        payment.incidentId
                    )
            ).length;


        const resolvedIncidents =
            incidents.filter(
                incident =>
                    incident.status ===
                    "resolved"
            ).length;


        console.log(
            `Associated incidents found: ${incidents.length}`
        );

        console.log(
            `Payments linked to incidents: ${paymentsWithIncidents}`
        );

        console.log(
            `Resolved incidents available for policy testing: ${resolvedIncidents}`
        );


        // ==================================================
        // AI
        // ==================================================

        console.log("");

        console.log(
            "Running AI optimizer..."
        );


        const ai =
            await runAIStrategy(
                payments,
                incidentMap
            );


        // ==================================================
        // BASELINE
        // ==================================================

        console.log("");

        console.log(
            "Running fixed retry baseline..."
        );


        const baseline =
            runFixedRetryBaseline(
                payments
            );


        // ==================================================
        // COMPARISON
        // ==================================================

        const difference =
            ai.recoveredRevenue -
            baseline.recoveredRevenue;


        const improvement =
            baseline.recoveredRevenue > 0
                ?
                (
                    difference /
                    baseline.recoveredRevenue
                ) * 100
                :
                0;


        // ==================================================
        // RESULTS
        // ==================================================

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "BATCH DATASET"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Payments evaluated:",
            payments.length
        );

        console.log(
            "Revenue at risk:",
            money(
                ai.revenueAtRisk
            )
        );

        console.log(
            "Payments linked to incidents:",
            paymentsWithIncidents
        );


        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "AI RECOVERY OPTIMIZER"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Recovery candidates:",
            ai.candidates
        );

        console.log(
            "Approved:",
            ai.approved
        );

        console.log(
            "Blocked:",
            ai.blocked
        );

        console.log(
            "Blocked by resolved incident:",
            ai.incidentBlocked
        );

        console.log(
            "Recovered payments:",
            ai.recovered
        );

        console.log(
            "Failed executions:",
            ai.failed
        );

        console.log(
            "Expected recovery:",
            money(
                ai.expectedRecovery
            )
        );

        console.log(
            "Recovered revenue:",
            money(
                ai.recoveredRevenue
            )
        );

        console.log(
            "Recovery rate:",
            percent(
                ai.recoveryRate
            )
        );


        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "FIXED RETRY BASELINE"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Approved:",
            baseline.approved
        );

        console.log(
            "Blocked:",
            baseline.blocked
        );

        console.log(
            "Recovered payments:",
            baseline.recovered
        );

        console.log(
            "Failed executions:",
            baseline.failed
        );

        console.log(
            "Recovered revenue:",
            money(
                baseline.recoveredRevenue
            )
        );

        console.log(
            "Recovery rate:",
            percent(
                baseline.recoveryRate
            )
        );


        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "AI VS FIXED RETRY"
        );

        console.log(
            "========================================"
        );

        console.log(
            "AI recovered:",
            money(
                ai.recoveredRevenue
            )
        );

        console.log(
            "Fixed retry recovered:",
            money(
                baseline.recoveredRevenue
            )
        );

        console.log(
            "Revenue difference:",
            money(
                difference
            )
        );

        console.log(
            "Relative improvement:",
            percent(
                improvement
            )
        );


        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "SAFETY CONTROLS"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Maximum automatic amount: ₹50,000"
        );

        console.log(
            "Minimum recovery probability: 60%"
        );

        console.log(
            "Maximum retries: 2"
        );

        console.log(
            "Maximum automatic attempts: 2"
        );

        console.log(
            "Resolved incidents block recovery: YES"
        );

        console.log(
            "Policy blocks low-confidence actions"
        );


        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "BENCHMARK COMPLETE"
        );

        console.log(
            "========================================"
        );

        console.log(
            "ML Python processes: 1"
        );

        console.log(
            "Database payments modified: NO"
        );

        console.log(
            "Deterministic recovery simulation: YES"
        );

        console.log("");


        await mongoose.disconnect();

    } catch (
        error
    ) {

        console.error("");

        console.error(
            "BENCHMARK ERROR:"
        );

        console.error(
            error.message
        );


        try {

            await mongoose.disconnect();

        } catch {}


        process.exit(1);

    }

}


main();
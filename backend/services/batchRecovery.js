const PaymentEvent =
    require("../models/PaymentEvent");

const Incident =
    require("../models/Incident");

const runRecoveryWorkflow =
    require("./recoveryWorkflow");


// =========================================
// BATCH CONFIGURATION
// =========================================

const MAX_BATCH_SIZE = 10;

// Number of payments allowed to run through
// the recovery workflow at the same time.
//
// 3 is a safe compromise for a demo because
// each workflow may invoke the Python ML model.
const CONCURRENCY = 3;


// =========================================
// RUN ONE PAYMENT
// =========================================

async function processPayment(
    payment,
    incident
) {

    const workflowPayment = {

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
            payment.bank,

        device:
            payment.device,

        failure_reason:
            payment.failureReason,

        retryCount:
            payment.retryCount || 0,

        autoRecoveryAttempts:
            payment.autoRecoveryAttempts || 0,

        // Synthetic historical/context features
        // used by the ML model.
        previous_success_rate:
            0.90,

        previous_failures:
            payment.retryCount || 0,

        customer_age_days:
            400

    };


    try {

        const result =
            await runRecoveryWorkflow({

                paymentId:
                    payment.paymentId,

                payment:
                    workflowPayment,

                incident

            });


        return {

            success: true,

            paymentId:
                payment.paymentId,

            amount:
                payment.amount,

            merchantId:
                payment.merchantId,

            action:
                result
                    .recommendation
                    ?.recommendedAction ||
                "NO_ACTION",

            recoveryProbability:
                result
                    .recommendation
                    ?.recoveryProbability ||
                0,

            expectedRecovery:
                result
                    .recommendation
                    ?.expectedRecovery ||
                0,

            expectedNetRecovery:
                result
                    .recommendation
                    ?.expectedNetRecovery ||
                0,

            policyDecision:
                result.policy
                    ?.decision ||
                "UNKNOWN",

            policyReasons:
                result.policy
                    ?.reasons ||
                [],

            executionStatus:
                result.execution
                    ?.status ||
                "not_executed",

            recovered:
                result.execution
                    ?.success ||
                false,

            amountRecovered:
                result.execution
                    ?.amountRecovered ||
                0

        };


    } catch (error) {

        console.error(
            `Batch recovery error for ${payment.paymentId}:`,
            error.message
        );


        return {

            success: false,

            paymentId:
                payment.paymentId,

            amount:
                payment.amount,

            merchantId:
                payment.merchantId,

            action:
                "NO_ACTION",

            recoveryProbability:
                0,

            expectedRecovery:
                0,

            expectedNetRecovery:
                0,

            policyDecision:
                "ERROR",

            policyReasons: [

                error.message

            ],

            executionStatus:
                "error",

            recovered:
                false,

            amountRecovered:
                0

        };

    }

}


// =========================================
// BATCH RECOVERY
// =========================================

async function runBatchRecovery({
    merchantId
}) {

    // -----------------------------------------
    // FIND ELIGIBLE PAYMENTS
    // -----------------------------------------

    const payments =
        await PaymentEvent.find({

            merchantId,

            status:
                "failed",

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
            MAX_BATCH_SIZE
        );


    // -----------------------------------------
    // NO OPPORTUNITIES
    // -----------------------------------------

    if (
        payments.length === 0
    ) {

        return {

            merchantId,

            status:
                "no_opportunities",

            message:
                "No eligible failed payments available for batch recovery.",

            batchLimit:
                MAX_BATCH_SIZE,

            summary: {

                paymentsEvaluated:
                    0,

                approved:
                    0,

                blocked:
                    0,

                recovered:
                    0,

                failed:
                    0,

                totalRevenueAtRisk:
                    0,

                totalRecovered:
                    0,

                totalExpectedRecovery:
                    0,

                recoveryRate:
                    0

            },

            results: []

        };

    }


    // -----------------------------------------
    // FETCH ALL RELATED INCIDENTS AT ONCE
    // -----------------------------------------

    const incidentIds =
        payments
            .map(
                payment =>
                    payment.incidentId
            )
            .filter(Boolean);


    const incidents =
        incidentIds.length > 0

            ?

            await Incident.find({

                incidentId: {
                    $in: incidentIds
                }

            })

            :

            [];


    const incidentMap =
        new Map(
            incidents.map(
                incident => [
                    incident.incidentId,
                    incident
                ]
            )
        );


    // -----------------------------------------
    // PROCESS PAYMENTS WITH LIMITED
    // CONCURRENCY
    // -----------------------------------------

    const results =
        new Array(
            payments.length
        );


    let nextIndex = 0;


    async function worker() {

        while (true) {

            const currentIndex =
                nextIndex++;


            if (
                currentIndex >=
                payments.length
            ) {

                return;

            }


            const payment =
                payments[currentIndex];


            const incident =
                payment.incidentId
                    ? incidentMap.get(
                        payment.incidentId
                    ) || null
                    : null;


            results[currentIndex] =
                await processPayment(
                    payment,
                    incident
                );

        }

    }


    const workers = [];


    const workerCount =
        Math.min(
            CONCURRENCY,
            payments.length
        );


    for (
        let i = 0;
        i < workerCount;
        i++
    ) {

        workers.push(
            worker()
        );

    }


    await Promise.all(
        workers
    );


    // -----------------------------------------
    // CALCULATE SUMMARY
    // -----------------------------------------

    let totalRevenueAtRisk = 0;

    let totalExpectedRecovery = 0;

    let totalRecovered = 0;

    let approved = 0;

    let blocked = 0;

    let recovered = 0;

    let failed = 0;


    results.forEach(
        result => {

            totalRevenueAtRisk +=
                result.amount;


            totalExpectedRecovery +=
                result.expectedRecovery || 0;


            if (
                result.policyDecision ===
                "APPROVED"
            ) {

                approved += 1;

            } else if (
                result.policyDecision ===
                "BLOCKED"
            ) {

                blocked += 1;

            }


            if (
                result.recovered
            ) {

                recovered += 1;

                totalRecovered +=
                    result.amountRecovered ||
                    0;

            }


            if (
                result.policyDecision ===
                    "ERROR" ||
                (
                    result.executionStatus &&
                    result.executionStatus ===
                        "failed"
                )
            ) {

                failed += 1;

            }

        }
    );


    // -----------------------------------------
    // RECOVERY RATE
    // -----------------------------------------

    const recoveryRate =
        totalRevenueAtRisk > 0

            ?

            (
                totalRecovered /
                totalRevenueAtRisk
            ) * 100

            :

            0;


    // -----------------------------------------
    // FINAL RESULT
    // -----------------------------------------

    return {

        merchantId,

        status:
            "completed",

        batchLimit:
            MAX_BATCH_SIZE,

        summary: {

            paymentsEvaluated:
                payments.length,

            approved,

            blocked,

            recovered,

            failed,

            totalRevenueAtRisk:
                Number(
                    totalRevenueAtRisk.toFixed(2)
                ),

            totalExpectedRecovery:
                Number(
                    totalExpectedRecovery.toFixed(2)
                ),

            totalRecovered:
                Number(
                    totalRecovered.toFixed(2)
                ),

            recoveryRate:
                Number(
                    recoveryRate.toFixed(2)
                )

        },

        results

    };

}


module.exports =
    runBatchRecovery;
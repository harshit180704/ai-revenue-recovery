const express = require("express");

const router = express.Router();


// =========================================
// MODELS
// =========================================

const Incident =
    require("../models/Incident");

const PaymentEvent =
    require("../models/PaymentEvent");

const AuditLog =
    require("../models/AuditLog");


// =========================================
// SERVICES
// =========================================

const detectIncidents =
    require("../services/incidentEngine");

const attributeRevenue =
    require("../services/revenueAttribution");

const predictRecovery =
    require("../services/recoveryPredictor");

const optimizeRecovery =
    require("../services/recoveryOptimizer");

const runRecoveryWorkflow =
    require("../services/recoveryWorkflow");

const runBatchRecovery =
    require("../services/batchRecovery");

const getMerchantIntelligence =
    require("../services/merchantIntelligence");


// =========================================
// GET ALL INCIDENTS
// =========================================

router.get(
    "/",
    async (req, res) => {

        try {

            const incidents =
                await Incident.find()
                    .sort({
                        startTime: -1
                    });


            res.json(
                incidents
            );


        } catch (error) {

            console.error(
                "Get incidents error:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to fetch incidents",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// DETECT INCIDENTS
// =========================================

router.post(
    "/detect",
    async (req, res) => {

        try {

            const result =
                await detectIncidents();


            res.json({

                message:
                    "Incident detection completed",

                result

            });


        } catch (error) {

            console.error(
                "Incident detection error:",
                error
            );


            res.status(500).json({

                message:
                    "Incident detection failed",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// REVENUE ATTRIBUTION
// =========================================

router.post(
    "/:incidentId/attribute",
    async (req, res) => {

        try {

            const {
                incidentId
            } = req.params;


            const incident =
                await Incident.findOne({
                    incidentId
                });


            if (!incident) {

                return res
                    .status(404)
                    .json({

                        message:
                            "Incident not found"

                    });

            }


            const result =
                await attributeRevenue(
                    incident
                );


            res.json({

                message:
                    "Revenue attribution completed",

                result

            });


        } catch (error) {

            console.error(
                "Revenue attribution error:",
                error
            );


            res.status(500).json({

                message:
                    "Revenue attribution failed",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// PREDICT RECOVERY
// =========================================

router.post(
    "/predict-recovery",
    async (req, res) => {

        try {

            const prediction =
                await predictRecovery(
                    req.body
                );


            res.json({

                message:
                    "Recovery prediction completed",

                prediction

            });


        } catch (error) {

            console.error(
                "Recovery prediction error:",
                error
            );


            res.status(500).json({

                message:
                    "Recovery prediction failed",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// OPTIMIZE RECOVERY
// =========================================

router.post(
    "/optimize-recovery",
    async (req, res) => {

        try {

            const recommendation =
                await optimizeRecovery(
                    req.body
                );


            res.json({

                message:
                    "Recovery optimization completed",

                recommendation

            });


        } catch (error) {

            console.error(
                "Recovery optimization error:",
                error
            );


            res.status(500).json({

                message:
                    "Recovery optimization failed",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// EXECUTE SINGLE PAYMENT RECOVERY
// =========================================

router.post(
    "/execute-recovery",
    async (req, res) => {

        try {

            const {
                paymentId,
                recommendation
            } = req.body;


            if (!paymentId) {

                return res
                    .status(400)
                    .json({

                        message:
                            "paymentId is required"

                    });

            }


            // -------------------------------------
            // Find EXACT payment
            // -------------------------------------

            const payment =
                await PaymentEvent.findOne({
                    paymentId
                });


            if (!payment) {

                return res
                    .status(404)
                    .json({

                        message:
                            "Payment not found"

                    });

            }


            // -------------------------------------
            // Find associated incident
            // -------------------------------------

            let incident = null;


            if (
                payment.incidentId
            ) {

                incident =
                    await Incident.findOne({

                        incidentId:
                            payment.incidentId

                    });

            }


            // -------------------------------------
            // Run workflow
            // -------------------------------------

            const result =
                await runRecoveryWorkflow({

                    paymentId,

                    payment: {

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
                            payment.retryCount,

                        autoRecoveryAttempts:
                            payment.autoRecoveryAttempts,

                        previous_success_rate:
                            req.body.previous_success_rate ||
                            0.90,

                        previous_failures:
                            req.body.previous_failures ??
                            payment.retryCount,

                        customer_age_days:
                            req.body.customer_age_days ||
                            400

                    },

                    // IMPORTANT:
                    // Reuse the exact recommendation
                    // already shown by the AI analysis.
                    recommendation,

                    incident

                });


            res.json({

                message:
                    "Recovery workflow completed",

                result

            });


        } catch (error) {

            console.error(
                "Execute recovery error:",
                error
            );


            res.status(500).json({

                message:
                    "Recovery execution failed",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// MERCHANT INTELLIGENCE
// =========================================

router.get(
    "/merchant-intelligence",
    async (req, res) => {

        try {

            const merchants =
                await getMerchantIntelligence();


            res.json({

                message:
                    "Merchant revenue intelligence",

                merchants

            });


        } catch (error) {

            console.error(
                "Merchant intelligence error:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to calculate merchant intelligence",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// MERCHANT FAILED PAYMENTS
// =========================================

router.get(
    "/merchant/:merchantId/payments",
    async (req, res) => {

        try {

            const {
                merchantId
            } = req.params;


            const payments =
                await PaymentEvent.find({

                    merchantId,

                    status: {
                        $in: [
                            "failed",
                            "abandoned"
                        ]
                    }

                })
                .sort({
                    amount: -1
                })
                .limit(25);


            const totalFailedRevenue =
                payments.reduce(

                    (
                        total,
                        payment
                    ) => {

                        return (
                            total +
                            payment.amount
                        );

                    },

                    0

                );


            // ---------------------------------
            // METHOD BREAKDOWN
            // ---------------------------------

            const methodBreakdown = {};


            payments.forEach(
                payment => {

                    const method =
                        payment.method ||
                        "unknown";


                    if (
                        !methodBreakdown[
                            method
                        ]
                    ) {

                        methodBreakdown[
                            method
                        ] = {

                            count: 0,

                            revenue: 0

                        };

                    }


                    methodBreakdown[
                        method
                    ].count += 1;


                    methodBreakdown[
                        method
                    ].revenue +=
                        payment.amount;

                }
            );


            // ---------------------------------
            // FAILURE BREAKDOWN
            // ---------------------------------

            const failureBreakdown = {};


            payments.forEach(
                payment => {

                    const reason =
                        payment.failureReason ||
                        "unknown";


                    if (
                        !failureBreakdown[
                            reason
                        ]
                    ) {

                        failureBreakdown[
                            reason
                        ] = {

                            count: 0,

                            revenue: 0

                        };

                    }


                    failureBreakdown[
                        reason
                    ].count += 1;


                    failureBreakdown[
                        reason
                    ].revenue +=
                        payment.amount;

                }
            );


            res.json({

                merchantId,

                totalPayments:
                    payments.length,

                totalFailedRevenue,

                failureCount:
                    payments.length,

                methodBreakdown,

                failureBreakdown,

                payments

            });


        } catch (error) {

            console.error(
                "Merchant payment intelligence error:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to fetch merchant payments",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// MERCHANT BATCH RECOVERY
// =========================================
//
// Evaluates up to 10 eligible failed
// payments for a merchant.
//
// Every payment goes through:
//
// ML Prediction
//       ↓
// Recovery Optimization
//       ↓
// Policy Check
//       ↓
// Recovery Execution
//       ↓
// Audit Logging
//
// =========================================

router.post(
    "/merchant/:merchantId/recover-batch",
    async (req, res) => {

        try {

            const {
                merchantId
            } = req.params;


            if (!merchantId) {

                return res
                    .status(400)
                    .json({

                        message:
                            "merchantId is required"

                    });

            }


            const result =
                await runBatchRecovery({

                    merchantId

                });


            res.json({

                message:
                    "Merchant batch recovery completed",

                result

            });


        } catch (error) {

            console.error(
                "Merchant batch recovery error:",
                error
            );


            res.status(500).json({

                message:
                    "Merchant batch recovery failed",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// REVENUE RECOVERY METRICS
// =========================================

router.get(
    "/metrics",
    async (req, res) => {

        try {

            const incidentRevenue =
                await Incident.aggregate([

                    {

                        $group: {

                            _id: null,

                            revenueAtRisk: {

                                $sum:
                                    "$grossRevenueAtRisk"

                            },

                            recoverableRevenue: {

                                $sum:
                                    "$recoverableRevenue"

                            }

                        }

                    }

                ]);


            const revenue =
                incidentRevenue[0] || {

                    revenueAtRisk: 0,

                    recoverableRevenue: 0

                };


            // ---------------------------------
            // RECOVERY STATISTICS
            // ---------------------------------

            const recoveryStats =
                await AuditLog.aggregate([

                    {

                        $match: {

                            eventType: {

                                $in: [

                                    "RECOVERY_EXECUTED",

                                    "RECOVERY_SUCCEEDED",

                                    "RECOVERY_FAILED"

                                ]

                            }

                        }

                    },

                    {

                        $group: {

                            _id:
                                "$eventType",

                            count: {

                                $sum: 1

                            },

                            amountRecovered: {

                                $sum:
                                    "$amountRecovered"

                            }

                        }

                    }

                ]);


            let totalRecoveryAttempts = 0;

            let successfulRecoveries = 0;

            let failedRecoveryAttempts = 0;

            let totalRecovered = 0;


            recoveryStats.forEach(
                stat => {

                    if (
                        stat._id ===
                        "RECOVERY_EXECUTED"
                    ) {

                        totalRecoveryAttempts =
                            stat.count;

                    }


                    if (
                        stat._id ===
                        "RECOVERY_SUCCEEDED"
                    ) {

                        successfulRecoveries =
                            stat.count;


                        totalRecovered =
                            stat.amountRecovered ||
                            0;

                    }


                    if (
                        stat._id ===
                        "RECOVERY_FAILED"
                    ) {

                        failedRecoveryAttempts =
                            stat.count;

                    }

                }
            );


            // ---------------------------------
            // RECOVERY RATE
            // ---------------------------------

            const recoveryRate =
                revenue.recoverableRevenue > 0

                    ?

                    (
                        totalRecovered /
                        revenue.recoverableRevenue
                    ) * 100

                    :

                    0;


            // ---------------------------------
            // RECOVERY BY ACTION
            // ---------------------------------

            const recoveryByAction =
                await AuditLog.aggregate([

                    {

                        $match: {

                            eventType:
                                "RECOVERY_SUCCEEDED"

                        }

                    },

                    {

                        $group: {

                            _id:
                                "$action",

                            recoveredRevenue: {

                                $sum:
                                    "$amountRecovered"

                            },

                            successfulRecoveries: {

                                $sum: 1

                            }

                        }

                    },

                    {

                        $project: {

                            _id: 0,

                            action:
                                "$_id",

                            recoveredRevenue: 1,

                            successfulRecoveries: 1

                        }

                    },

                    {

                        $sort: {

                            recoveredRevenue: -1

                        }

                    }

                ]);


            res.json({

                message:
                    "Revenue recovery metrics",

                metrics: {

                    revenueAtRisk:
                        revenue.revenueAtRisk,

                    recoverableRevenue:
                        revenue.recoverableRevenue,

                    totalRecovered:
                        totalRecovered,

                    recoveryRate:
                        Number(
                            recoveryRate.toFixed(2)
                        ),

                    totalRecoveryAttempts:
                        totalRecoveryAttempts,

                    successfulRecoveries:
                        successfulRecoveries,

                    failedRecoveryAttempts:
                        failedRecoveryAttempts

                },

                recoveryByAction

            });


        } catch (error) {

            console.error(
                "Metrics error:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to calculate recovery metrics",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// TEST PAYMENT
// =========================================
//
// Optional excludePaymentId prevents this
// endpoint from returning the same payment
// when another payment is requested.
//
// =========================================

router.get(
    "/test-payment",
    async (req, res) => {

        try {

            const {
                excludePaymentId
            } = req.query;


            const query = {
                status: "failed"
            };


            if (excludePaymentId) {

                query.paymentId = {
                    $ne:
                        excludePaymentId
                };

            }


            const payment =
                await PaymentEvent.findOne(
                    query
                )
                .sort({
                    timestamp: 1
                });


            if (!payment) {

                return res
                    .status(404)
                    .json({

                        message:
                            "No failed payment available"

                    });

            }


            res.json({

                paymentId:
                    payment.paymentId,

                amount:
                    payment.amount,

                method:
                    payment.method,

                bank:
                    payment.bank,

                device:
                    payment.device,

                failureReason:
                    payment.failureReason,

                retryCount:
                    payment.retryCount,

                autoRecoveryAttempts:
                    payment.autoRecoveryAttempts,

                timestamp:
                    payment.timestamp,

                merchantId:
                    payment.merchantId,

                customerId:
                    payment.customerId

            });


        } catch (error) {

            console.error(
                "Test payment error:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to fetch test payment",

                error:
                    error.message

            });

        }

    }
);


// =========================================
// EXPORT ROUTER
// =========================================

module.exports =
    router;
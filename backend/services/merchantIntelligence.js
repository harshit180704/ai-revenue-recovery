const PaymentEvent = require("../models/PaymentEvent");


async function getMerchantIntelligence() {

    const merchants = await PaymentEvent.aggregate([

        // =========================================
        // 1. GROUP PAYMENT DATA BY MERCHANT
        // =========================================

        {
            $group: {

                _id: "$merchantId",

                totalTransactions: {
                    $sum: 1
                },

                failedTransactions: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$status",
                                    [
                                        "failed",
                                        "abandoned"
                                    ]
                                ]
                            },
                            1,
                            0
                        ]
                    }
                },

                failedRevenue: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$status",
                                    [
                                        "failed",
                                        "abandoned"
                                    ]
                                ]
                            },
                            "$amount",
                            0
                        ]
                    }
                },

                successfulRevenue: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$status",
                                    "success"
                                ]
                            },
                            "$amount",
                            0
                        ]
                    }
                },

                recoveredRevenue: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$status",
                                    "recovered"
                                ]
                            },
                            "$amount",
                            0
                        ]
                    }
                }

            }
        },


        // =========================================
        // 2. CALCULATE FAILURE RATE + RECOVERABLE
        // =========================================

        {
            $addFields: {

                failureRate: {

                    $cond: [

                        {
                            $gt: [
                                "$totalTransactions",
                                0
                            ]
                        },

                        {
                            $divide: [
                                "$failedTransactions",
                                "$totalTransactions"
                            ]
                        },

                        0

                    ]

                },

                // Estimate 60% of failed revenue
                // as potentially recoverable.

                recoverableRevenue: {

                    $multiply: [
                        "$failedRevenue",
                        0.60
                    ]

                }

            }
        },


        // =========================================
        // 3. CALCULATE MERCHANT RISK SCORE
        // =========================================

        {
            $addFields: {

                riskScore: {

                    $multiply: [

                        "$failureRate",

                        {
                            $ln: {
                                $add: [
                                    "$failedRevenue",
                                    1
                                ]
                            }
                        }

                    ]

                }

            }
        },


        // =========================================
        // 4. PRIORITIZE MERCHANTS
        // =========================================

        {
            $sort: {

                recoverableRevenue: -1

            }
        },


        // =========================================
        // 5. RETURN TOP 10 MERCHANTS
        // =========================================

        {
            $limit: 10
        },


        // =========================================
        // 6. CLEAN API RESPONSE
        // =========================================

        {
            $project: {

                _id: 0,

                merchantId: "$_id",

                totalTransactions: 1,

                failedTransactions: 1,

                failedRevenue: 1,

                successfulRevenue: 1,

                recoveredRevenue: 1,

                recoverableRevenue: 1,

                failureRate: 1,

                riskScore: 1

            }

        }

    ]);


    // =========================================
    // FORMAT NUMBERS FOR FRONTEND
    // =========================================

    return merchants.map(
        merchant => ({

            merchantId:
                merchant.merchantId,

            totalTransactions:
                merchant.totalTransactions,

            failedTransactions:
                merchant.failedTransactions,

            failedRevenue:
                Number(
                    merchant.failedRevenue.toFixed(2)
                ),

            successfulRevenue:
                Number(
                    merchant.successfulRevenue.toFixed(2)
                ),

            recoveredRevenue:
                Number(
                    merchant.recoveredRevenue.toFixed(2)
                ),

            recoverableRevenue:
                Number(
                    merchant.recoverableRevenue.toFixed(2)
                ),

            failureRate:
                Number(
                    (
                        merchant.failureRate *
                        100
                    ).toFixed(2)
                ),

            riskScore:
                Number(
                    merchant.riskScore.toFixed(2)
                )

        })
    );

}


module.exports =
    getMerchantIntelligence;
const PaymentEvent = require("../models/PaymentEvent");
const Incident = require("../models/Incident");

const WINDOW_MINUTES = 30;

const BASELINE_FAILURE_RATES = {
    upi: 0.04,
    card: 0.06,
    netbanking: 0.09,
    wallet: 0.05
};

function getWindowStart(date) {

    const window = new Date(date);

    const minutes =
        window.getMinutes();

    const roundedMinutes =
        Math.floor(
            minutes / WINDOW_MINUTES
        ) * WINDOW_MINUTES;

    window.setMinutes(
        roundedMinutes,
        0,
        0
    );

    return window;
}

async function detectIncidents() {

    console.log(
        "Starting time-window incident detection..."
    );

    /*
    IMPORTANT:
    We don't use incidentId here.
    */

    const payments =
        await PaymentEvent.find({});

    /*
    Group by:
    method + bank + time window
    */

    const windows = {};

    for (const payment of payments) {

        const windowStart =
            getWindowStart(
                payment.timestamp
            );

        const key =
            `${payment.method}_${payment.bank || "ALL"}_${windowStart.getTime()}`;

        if (!windows[key]) {

            windows[key] = {

                method:
                    payment.method,

                bank:
                    payment.bank,

                startTime:
                    windowStart,

                payments: []

            };
        }

        windows[key].payments.push(
            payment
        );
    }

    const abnormalWindows = [];

    /*
    Analyze each time window
    */

    for (
        const key of Object.keys(windows)
    ) {

        const window =
            windows[key];

        const payments =
            window.payments;

        if (payments.length < 100) {
            continue;
        }

        const failed =
            payments.filter(
                p =>
                    p.status === "failed"
            ).length;

        const total =
            payments.length;

        const failureRate =
            failed / total;

        const baseline =
            BASELINE_FAILURE_RATES[
                window.method
            ];

        const anomalyRatio =
            failureRate / baseline;

        /*
        Incident threshold:
        failure rate is at least
        2x normal.
        */

        if (
    anomalyRatio >= 2 &&
    failed >= 20
) {

            const revenueAtRisk =
                payments
                    .filter(
                        p =>
                            p.status === "failed"
                    )
                    .reduce(
                        (sum, p) =>
                            sum + p.amount,
                        0
                    );

            abnormalWindows.push({

                method:
                    window.method,

                bank:
                    window.bank,

                startTime:
                    window.startTime,

                endTime:
                    new Date(
                        window.startTime.getTime()
                        +
                        WINDOW_MINUTES *
                        60 *
                        1000
                    ),

                affectedTransactions:
                    failed,

                totalTransactions:
                    total,

                failureRate,

                baselineFailureRate:
                    baseline,

                anomalyRatio,

                revenueAtRisk

            });
        }
    }

    /*
    Merge consecutive abnormal
    windows belonging to the
    same payment method + bank.
    */

    abnormalWindows.sort(
        (a, b) =>
            a.startTime - b.startTime
    );

    const incidents = [];

    for (
        const current
        of abnormalWindows
    ) {

        const previous =
            incidents[
                incidents.length - 1
            ];

        if (
            previous &&
            previous.paymentMethod ===
                current.method &&
            previous.bank ===
                current.bank &&
            current.startTime <=
                previous.endTime
        ) {

            previous.endTime =
                current.endTime;

            previous.affectedTransactions +=
                current.affectedTransactions;

            previous.grossRevenueAtRisk +=
                current.revenueAtRisk;

        } else {

            incidents.push({

                incidentId:
                    `DETECTED_${Date.now()}_${Math.floor(
                        Math.random() * 10000
                    )}`,

                type:
                    "payment_degradation",

                paymentMethod:
                    current.method,

                bank:
                    current.bank,

                startTime:
                    current.startTime,

                endTime:
                    current.endTime,

                affectedTransactions:
                    current.affectedTransactions,

                grossRevenueAtRisk:
                    current.revenueAtRisk,

                recoverableRevenue:
                    0,

                recoveredRevenue:
                    0,

                confidence:
                    Math.min(
                        0.99,
                        0.60 +
                        (
                            current.anomalyRatio
                            * 0.05
                        )
                    ),

                rootCause:
                    `Elevated ${current.method} failure rate`,

                status:
                    "investigating"

            });
        }
    }

    /*
    Save detected incidents
    */

    if (incidents.length > 0) {

        await Incident.insertMany(
            incidents
        );
    }

    console.log(
        `Detected ${incidents.length} incidents.`
    );

    return incidents;
}

module.exports = detectIncidents;
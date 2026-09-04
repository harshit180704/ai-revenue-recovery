const AuditLog = require("../models/AuditLog");

async function createAuditLog({
    eventType,
    paymentId = null,
    merchantId = null,
    incidentId = null,
    action = null,
    amount = 0,
    amountRecovered = 0,
    recoveryProbability = null,
    expectedRecovery = null,
    expectedNetRecovery = null,
    status = null,
    details = {}
}) {

    try {

        const log = await AuditLog.create({
            eventType,
            paymentId,
            merchantId,
            incidentId,
            action,
            amount,
            amountRecovered,
            recoveryProbability,
            expectedRecovery,
            expectedNetRecovery,
            status,
            details
        });

        return log;

    } catch (error) {

        console.error(
            "Audit logging error:",
            error.message
        );

        // Audit logging should never crash
        // the recovery workflow.
        return null;
    }
}

module.exports =
    createAuditLog;
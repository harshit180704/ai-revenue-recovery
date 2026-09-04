import {
    useEffect,
    useRef,
    useState,
    type ReactNode
} from "react";

import {
    AlertTriangle,
    ArrowRight,
    Bot,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    CreditCard,
    IndianRupee,
    Loader2,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    Target,
    TrendingUp,
    X,
    XCircle,
    Zap
} from "lucide-react";

import "./style.css";
import "./batch-results.css";
import "./audit-trail.css";


const API_URL =
    "http://localhost:5000/api/incidents";


// =========================================
// TYPES
// =========================================

type Metrics = {
    revenueAtRisk: number;
    recoverableRevenue: number;
    totalRecovered: number;
    recoveryRate: number;
    totalRecoveryAttempts: number;
    successfulRecoveries: number;
    failedRecoveryAttempts: number;
};


type RecoveryAction = {
    action: string;
    recoveredRevenue: number;
    successfulRecoveries: number;
};


type Incident = {
    _id?: string;
    incidentId: string;
    type: string;
    paymentMethod?: string;
    bank?: string;
    affectedTransactions: number;
    grossRevenueAtRisk: number;
    recoverableRevenue: number;
    recoveredRevenue: number;
    confidence: number;
    rootCause?: string;
    status: string;
};


type MerchantIntelligence = {
    merchantId: string;
    totalTransactions: number;
    failedTransactions: number;
    failedRevenue: number;
    successfulRevenue: number;
    recoveredRevenue: number;
    recoverableRevenue: number;
    failureRate: number;
    riskScore: number;
};


type FailedPayment = {
    paymentId: string;
    merchantId: string;
    customerId: string;
    amount: number;
    method: string;
    bank: string | null;
    device: string;
    failureReason: string;
    retryCount: number;
    autoRecoveryAttempts: number;
};


type MerchantPayment = {
    _id: string;
    paymentId: string;
    merchantId: string;
    customerId: string;
    amount: number;
    currency: string;
    method: string;
    bank: string | null;
    status: string;
    failureReason: string | null;
    device: string;
    paymentType: string;
    timestamp: string;
    retryCount: number;
    autoRecoveryAttempts: number;
};


type MerchantPaymentsResponse = {
    merchantId: string;
    totalPayments: number;
    totalFailedRevenue: number;
    failureCount: number;

    methodBreakdown: Record<
        string,
        {
            count: number;
            revenue: number;
        }
    >;

    failureBreakdown: Record<
        string,
        {
            count: number;
            revenue: number;
        }
    >;

    payments: MerchantPayment[];
};


type Candidate = {
    action: string;
    recoveryProbability: number;
    expectedRecovery: number;
    actionCost: number;
    expectedNetRecovery: number;
};


type Recommendation = {
    recommendedAction: string;
    recoveryProbability: number;
    expectedRecovery: number;
    expectedNetRecovery: number;
    reason: string;
    candidates: Candidate[];
};


type RecoveryResult = {
    paymentId: string;
    status: string;

    recommendation: Recommendation;

    policy: {
        allowed: boolean;
        decision: string;
        reasons: string[];

        policy: {
            maxAmount: number;
            maxRetries: number;
            minimumProbability: number;
            maxAutomaticAttempts: number;
        };
    };

    execution: {
        success: boolean;
        status: string;
        paymentId: string;
        action?: string;
        amountRecovered?: number;
        recoveryAttempt?: number;
        message?: string;
    } | null;
};

type BatchResultItem = {
    paymentId: string;
    amount: number;
    merchantId: string;
    action: string;
    recoveryProbability: number;
    expectedRecovery: number;
    expectedNetRecovery: number;
    policyDecision: string;
    policyReasons: string[];
    executionStatus: string;
    recovered: boolean;
    amountRecovered: number;
};

type BatchResult = {
    merchantId: string;
    status: string;
    batchLimit: number;
    summary: {
        paymentsEvaluated: number;
        approved: number;
        blocked: number;
        recovered: number;
        failed: number;
        totalRevenueAtRisk: number;
        totalExpectedRecovery: number;
        totalRecovered: number;
        recoveryRate: number;
    };
    results: BatchResultItem[];
};


// =========================================
// FORMATTING
// =========================================

function formatRupees(
    value: number
) {

    if (value >= 10000000) {

        return `₹${(
            value / 10000000
        ).toFixed(2)}Cr`;

    }

    if (value >= 100000) {

        return `₹${(
            value / 100000
        ).toFixed(2)}L`;

    }

    if (value >= 1000) {

        return `₹${(
            value / 1000
        ).toFixed(1)}K`;

    }

    return `₹${value.toLocaleString(
        "en-IN"
    )}`;

}


function formatFullRupees(
    value: number
) {

    return `₹${value.toLocaleString(
        "en-IN",
        {
            maximumFractionDigits: 2
        }
    )}`;

}


function actionLabel(
    action: string
) {

    return action
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(
            /\b\w/g,
            letter =>
                letter.toUpperCase()
        );

}


function decisionExplanation(
    recommendation: Recommendation
) {
    const ranked = [...recommendation.candidates].sort(
        (a, b) => b.expectedNetRecovery - a.expectedNetRecovery
    );

    const best = ranked[0];
    const nextBest = ranked[1];

    if (!best) {
        return recommendation.reason;
    }

    if (!nextBest) {
        return `${actionLabel(best.action)} was selected because it produced the highest expected net recovery.`;
    }

    const advantage = best.expectedNetRecovery - nextBest.expectedNetRecovery;

    return `${actionLabel(best.action)} was selected because it produced the highest expected net recovery of ${formatFullRupees(best.expectedNetRecovery)}, ${formatFullRupees(Math.max(0, advantage))} above the next-best option.`;
}


// =========================================
// APP
// =========================================

function App() {

    const [
        metrics,
        setMetrics
    ] =
        useState<Metrics | null>(null);


    const [
        actions,
        setActions
    ] =
        useState<RecoveryAction[]>([]);


    const [
        incidents,
        setIncidents
    ] =
        useState<Incident[]>([]);


    const [
        merchantIntelligence,
        setMerchantIntelligence
    ] =
        useState<MerchantIntelligence[]>([]);


    const [
        failedPayment,
        setFailedPayment
    ] =
        useState<FailedPayment | null>(
            null
        );


    const [
        recommendation,
        setRecommendation
    ] =
        useState<Recommendation | null>(
            null
        );


    const [
        workflowResult,
        setWorkflowResult
    ] =
        useState<RecoveryResult | null>(
            null
        );


    const [
        loading,
        setLoading
    ] =
        useState(true);


    const [
        analyzing,
        setAnalyzing
    ] =
        useState(false);


    const [
        executing,
        setExecuting
    ] =
        useState(false);


    const [
        nextPaymentLoading,
        setNextPaymentLoading
    ] =
        useState(false);


    // Prevent the automatic dashboard refresh from replacing
    // a payment that the user selected with "Analyze next failed payment".
    const manualPaymentSelection =
        useRef(false);

    // Keep track of payments already reviewed in this recovery session.
    // This prevents a successfully recovered payment from causing the
    // workflow to jump back to the first previously blocked payment.
    const visitedPaymentIds =
        useRef(new Set<string>());


    const [
        error,
        setError
    ] =
        useState("");


    const [
        lastUpdated,
        setLastUpdated
    ] =
        useState<Date | null>(null);


    // =====================================
    // MERCHANT DETAIL STATE
    // =====================================

    const [
        selectedMerchant,
        setSelectedMerchant
    ] =
        useState<MerchantIntelligence | null>(
            null
        );


    const [
        merchantPayments,
        setMerchantPayments
    ] =
        useState<MerchantPaymentsResponse | null>(
            null
        );


    const [
        merchantLoading,
        setMerchantLoading
    ] =
        useState(false);


    const [
        selectedMerchantPayment,
        setSelectedMerchantPayment
    ] =
        useState<MerchantPayment | null>(
            null
        );


    const [
        merchantRecommendation,
        setMerchantRecommendation
    ] =
        useState<Recommendation | null>(
            null
        );


    const [
        merchantRecoveryResult,
        setMerchantRecoveryResult
    ] =
        useState<RecoveryResult | null>(
            null
        );

    const [
        analyzedMerchantPaymentId,
        setAnalyzedMerchantPaymentId
    ] =
        useState<string | null>(
            null
        );


    const [
        merchantAnalyzing,
        setMerchantAnalyzing
    ] =
        useState(false);


    const [
        merchantExecuting,
        setMerchantExecuting
    ] =
        useState(false);


    const [
        batchRunning,
        setBatchRunning
    ] =
        useState(false);


    const [
        batchResult,
        setBatchResult
    ] =
        useState<BatchResult | null>(null);


    // =====================================
    // LOAD DASHBOARD
    // =====================================

    async function loadDashboard() {

        try {

            setError("");


            const [
                metricsResponse,
                incidentsResponse,
                paymentResponse,
                merchantResponse
            ] =
                await Promise.all([

                    fetch(
                        `${API_URL}/metrics`
                    ),

                    fetch(
                        `${API_URL}`
                    ),

                    fetch(
                        `${API_URL}/test-payment`
                    ),

                    fetch(
                        `${API_URL}/merchant-intelligence`
                    )

                ]);


            if (
                !metricsResponse.ok ||
                !incidentsResponse.ok
            ) {

                throw new Error(
                    "Backend unavailable"
                );

            }


            const metricsData =
                await metricsResponse.json();


            const incidentsData =
                await incidentsResponse.json();


            setMetrics(
                metricsData.metrics
            );


            setActions(
                metricsData.recoveryByAction ||
                []
            );


            setIncidents(
                incidentsData || []
            );


            if (
                merchantResponse.ok
            ) {

                const merchantData =
                    await merchantResponse.json();


                setMerchantIntelligence(
                    merchantData.merchants ||
                    []
                );

            }


            if (
                paymentResponse.ok &&
                !manualPaymentSelection.current
            ) {

                const paymentData =
                    await paymentResponse.json();


                setFailedPayment(
                    paymentData
                );

            } else if (
                !paymentResponse.ok &&
                !manualPaymentSelection.current
            ) {

                setFailedPayment(
                    null
                );

            }


            setLastUpdated(
                new Date()
            );


        } catch (error) {

            console.error(error);


            setError(
                "Unable to connect to the backend. Make sure Node.js is running on port 5000."
            );

        } finally {

            setLoading(false);

        }

    }


    useEffect(() => {

        loadDashboard();


        const interval =
            setInterval(
                loadDashboard,
                15000
            );


        return () =>
            clearInterval(
                interval
            );

    }, []);


    // =====================================
    // OPEN MERCHANT
    // =====================================

    async function openMerchant(
        merchant: MerchantIntelligence
    ) {

        setSelectedMerchant(
            merchant
        );

        setMerchantPayments(
            null
        );

        setSelectedMerchantPayment(
            null
        );

        setMerchantRecommendation(
            null
        );

        setMerchantRecoveryResult(
            null
        );

        setAnalyzedMerchantPaymentId(
            null
        );

        setBatchResult(
            null
        );

        setMerchantLoading(
            true
        );

        setError("");


        try {

            const response =
                await fetch(
                    `${API_URL}/merchant/${merchant.merchantId}/payments`
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Failed to load merchant payments"
                );

            }


            setMerchantPayments(
                data
            );


        } catch (error) {

            console.error(error);


            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to load merchant payments"
            );

        } finally {

            setMerchantLoading(
                false
            );

        }

    }


    // =====================================
    // CLOSE MERCHANT
    // =====================================

    function closeMerchant() {

        setSelectedMerchant(
            null
        );

        setMerchantPayments(
            null
        );

        setSelectedMerchantPayment(
            null
        );

        setMerchantRecommendation(
            null
        );

        setMerchantRecoveryResult(
            null
        );

        setAnalyzedMerchantPaymentId(
            null
        );

        setBatchResult(
            null
        );

    }


    // =====================================
    // SELECT MERCHANT PAYMENT
    // =====================================

    function selectMerchantPayment(
        payment: MerchantPayment
    ) {

        setSelectedMerchantPayment(
            payment
        );

        setMerchantRecommendation(
            null
        );

        setMerchantRecoveryResult(
            null
        );

        setAnalyzedMerchantPaymentId(
            null
        );

    }


    // =====================================
    // SELECT NEXT MERCHANT PAYMENT
    // =====================================

    function selectNextMerchantPayment() {

        if (
            !selectedMerchantPayment ||
            !merchantPayments?.payments?.length
        ) {
            return;
        }

        const payments =
            merchantPayments.payments;

        const currentIndex =
            payments.findIndex(
                payment =>
                    payment.paymentId ===
                    selectedMerchantPayment.paymentId
            );

        const nextPayment =
            currentIndex >= 0
                ? payments
                    .slice(currentIndex + 1)
                    .find(
                        payment =>
                            payment.paymentId !==
                            selectedMerchantPayment.paymentId
                    )
                : payments.find(
                    payment =>
                        payment.paymentId !==
                        selectedMerchantPayment.paymentId
                );

        if (!nextPayment) {
            setError(
                "No other failed payments are available for this merchant."
            );
            return;
        }

        selectMerchantPayment(
            nextPayment
        );

        setError(
            ""
        );

    }


    // =====================================
    // SELECT NEXT MAIN FAILED PAYMENT
    // =====================================

    async function selectNextFailedPayment() {

        if (!failedPayment) {
            return;
        }

        // Mark the current payment as reviewed so it is never selected
        // again during this recovery session. This includes payments
        // blocked by policy and payments that were successfully recovered.
        visitedPaymentIds.current.add(
            failedPayment.paymentId
        );

        try {
            setNextPaymentLoading(true);
            setError("");

            const response =
                await fetch(
                    `${API_URL}/merchant/${failedPayment.merchantId}/payments`
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    data.message ||
                    "Unable to load the next failed payment"
                );
            }

            const payments =
                (data.payments || []) as MerchantPayment[];

            const currentIndex =
                payments.findIndex(
                    payment =>
                        payment.paymentId ===
                        failedPayment.paymentId
                );

            const orderedPayments =
                currentIndex >= 0
                    ? [
                        ...payments.slice(currentIndex + 1),
                        ...payments.slice(0, currentIndex)
                    ]
                    : payments;

            const nextPayment =
                orderedPayments.find(
                    payment =>
                        payment.paymentId !==
                            failedPayment.paymentId &&
                        !visitedPaymentIds.current.has(
                            payment.paymentId
                        ) &&
                        (payment.status === "failed" ||
                            payment.status === "abandoned")
                );

            if (!nextPayment) {
                setError(
                    "No unreviewed failed payments are available for this merchant."
                );
                return;
            }

            // Lock the manually selected payment so the 15-second
            // dashboard refresh cannot replace it.
            manualPaymentSelection.current = true;

            setFailedPayment({
                paymentId: nextPayment.paymentId,
                merchantId: nextPayment.merchantId,
                customerId: nextPayment.customerId,
                amount: nextPayment.amount,
                method: nextPayment.method,
                bank: nextPayment.bank,
                device: nextPayment.device,
                failureReason:
                    nextPayment.failureReason ||
                    "unknown",
                retryCount: nextPayment.retryCount || 0,
                autoRecoveryAttempts:
                    nextPayment.autoRecoveryAttempts || 0
            });

            setRecommendation(null);
            setWorkflowResult(null);

        } catch (error) {
            console.error(
                "Next failed payment error:",
                error
            );

            setError(
                error instanceof Error
                    ? error.message
                    : "Unable to load the next failed payment"
            );
        } finally {
            setNextPaymentLoading(false);
        }
    }


    // =====================================
    // ANALYZE MAIN PAYMENT
    // =====================================

    async function analyzePayment() {

        if (!failedPayment) {

            return;

        }


        try {

            setAnalyzing(true);

            setError("");

            setRecommendation(null);

            setWorkflowResult(null);


            const response =
                await fetch(
                    `${API_URL}/optimize-recovery`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                amount:
                                    failedPayment.amount,

                                method:
                                    failedPayment.method,

                                bank:
                                    failedPayment.bank ||
                                    "NONE",

                                device:
                                    failedPayment.device,

                                failure_reason:
                                    failedPayment.failureReason,

                                previous_success_rate:
                                    0.90,

                                previous_failures:
                                    failedPayment.retryCount,

                                customer_age_days:
                                    400

                            })

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Recovery analysis failed"
                );

            }


            setRecommendation(
                data.recommendation
            );


        } catch (error) {

            console.error(error);


            setError(
                error instanceof Error
                    ? error.message
                    : "Recovery analysis failed"
            );

        } finally {

            setAnalyzing(false);

        }

    }


    // =====================================
    // EXECUTE MAIN PAYMENT
    // =====================================

    async function executeRecovery() {

        if (
            !failedPayment ||
            !recommendation
        ) {

            return;

        }


        try {

            setExecuting(true);

            setError("");


            const response =
                await fetch(
                    `${API_URL}/execute-recovery`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                paymentId:
                                    failedPayment.paymentId,

                                merchantId:
                                    failedPayment.merchantId,

                                amount:
                                    failedPayment.amount,

                                method:
                                    failedPayment.method,

                                bank:
                                    failedPayment.bank ||
                                    "NONE",

                                device:
                                    failedPayment.device,

                                failure_reason:
                                    failedPayment.failureReason,

                                previous_success_rate:
                                    0.90,

                                previous_failures:
                                    failedPayment.retryCount,

                                customer_age_days:
                                    400,

                                retryCount:
                                    failedPayment.retryCount,

                                autoRecoveryAttempts:
                                    failedPayment.autoRecoveryAttempts,

                                // Send the exact AI decision shown in the UI.
                                // The backend will validate this recommendation
                                // instead of silently generating a new one.
                                recommendation:
                                    recommendation

                            })

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Recovery execution failed"
                );

            }


            setWorkflowResult(
                data.result
            );


            /*
             * Keep the payment that was just executed selected.
             * loadDashboard() also refreshes /test-payment, so allowing
             * it to replace failedPayment here would make the execution
             * result appear to belong to a different payment.
             */
            manualPaymentSelection.current = true;

            await loadDashboard();


        } catch (error) {

            console.error(error);


            setError(
                error instanceof Error
                    ? error.message
                    : "Recovery execution failed"
            );

        } finally {

            setExecuting(false);

        }

    }


    // =====================================
    // ANALYZE MERCHANT PAYMENT
    // =====================================

    async function analyzeMerchantPayment() {

        if (
            !selectedMerchantPayment
        ) {

            return;

        }


        try {

            setMerchantAnalyzing(
                true
            );

            setError("");

            setMerchantRecommendation(
                null
            );

            setMerchantRecoveryResult(
                null
            );


            const response =
                await fetch(
                    `${API_URL}/optimize-recovery`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                amount:
                                    selectedMerchantPayment.amount,

                                method:
                                    selectedMerchantPayment.method,

                                bank:
                                    selectedMerchantPayment.bank ||
                                    "NONE",

                                device:
                                    selectedMerchantPayment.device,

                                failure_reason:
                                    selectedMerchantPayment.failureReason ||
                                    "unknown",

                                previous_success_rate:
                                    0.90,

                                previous_failures:
                                    selectedMerchantPayment.retryCount,

                                customer_age_days:
                                    400

                            })

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Recovery analysis failed"
                );

            }


            setMerchantRecommendation(
                data.recommendation
            );

            // Bind this recommendation to the exact payment analyzed.
            setAnalyzedMerchantPaymentId(
                selectedMerchantPayment.paymentId
            );


        } catch (error) {

            console.error(error);


            setError(
                error instanceof Error
                    ? error.message
                    : "Recovery analysis failed"
            );

        } finally {

            setMerchantAnalyzing(
                false
            );

        }

    }


    // =====================================
    // EXECUTE MERCHANT PAYMENT
    // =====================================

    async function executeMerchantRecovery() {

        if (
            !selectedMerchantPayment ||
            !merchantRecommendation ||
            !analyzedMerchantPaymentId
        ) {

            return;

        }

        // Never execute an AI recommendation against a different payment.
        if (
            selectedMerchantPayment.paymentId !==
            analyzedMerchantPaymentId
        ) {
            setMerchantRecommendation(null);
            setMerchantRecoveryResult(null);
            setAnalyzedMerchantPaymentId(null);
            setError(
                "Payment changed. Analyze the selected payment again before executing."
            );
            return;
        }

        const analyzedPaymentId =
            analyzedMerchantPaymentId;


        try {

            setMerchantExecuting(
                true
            );

            setError("");


            const response =
                await fetch(
                    `${API_URL}/execute-recovery`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                paymentId:
                                    analyzedPaymentId,

                                merchantId:
                                    selectedMerchantPayment.merchantId,

                                amount:
                                    selectedMerchantPayment.amount,

                                method:
                                    selectedMerchantPayment.method,

                                bank:
                                    selectedMerchantPayment.bank ||
                                    "NONE",

                                device:
                                    selectedMerchantPayment.device,

                                failure_reason:
                                    selectedMerchantPayment.failureReason ||
                                    "unknown",

                                previous_success_rate:
                                    0.90,

                                previous_failures:
                                    selectedMerchantPayment.retryCount,

                                customer_age_days:
                                    400,

                                retryCount:
                                    selectedMerchantPayment.retryCount,

                                autoRecoveryAttempts:
                                    selectedMerchantPayment.autoRecoveryAttempts

                            })

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Recovery execution failed"
                );

            }


            setMerchantRecoveryResult(
                data.result
            );


            await loadDashboard();


            // Refresh merchant payments
            if (selectedMerchant) {

                const refreshResponse =
                    await fetch(
                        `${API_URL}/merchant/${selectedMerchant.merchantId}/payments`
                    );


                if (
                    refreshResponse.ok
                ) {

                    const refreshed =
                        await refreshResponse.json();


                    setMerchantPayments(
                        refreshed
                    );

                }

            }


        } catch (error) {

            console.error(error);


            setError(
                error instanceof Error
                    ? error.message
                    : "Recovery execution failed"
            );

        } finally {

            setMerchantExecuting(
                false
            );

        }

    }


    // =====================================
    // RUN MERCHANT BATCH RECOVERY
    // =====================================

    async function runMerchantBatchRecovery() {

        if (!selectedMerchant) {
            return;
        }

        try {

            setBatchRunning(true);

            setBatchResult(null);

            setError("");


            const response =
                await fetch(
                    `${API_URL}/merchant/${selectedMerchant.merchantId}/recover-batch`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        }
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    data.message ||
                    "Batch recovery failed"
                );

            }


            setBatchResult(
                data.result
            );


            await loadDashboard();


            const refreshResponse =
                await fetch(
                    `${API_URL}/merchant/${selectedMerchant.merchantId}/payments`
                );


            if (
                refreshResponse.ok
            ) {

                const refreshed =
                    await refreshResponse.json();

                setMerchantPayments(
                    refreshed
                );

            }


            setSelectedMerchantPayment(
                null
            );

            setMerchantRecommendation(
                null
            );

            setMerchantRecoveryResult(
                null
            );


        } catch (error) {

            console.error(
                "Batch recovery error:",
                error
            );

            setError(
                error instanceof Error
                    ? error.message
                    : "Batch recovery failed"
            );

        } finally {

            setBatchRunning(false);

        }

    }


    // =====================================
    // METRICS
    // =====================================

    const recoveryRate =
        metrics?.recoveryRate || 0;


    const recovered =
        metrics?.totalRecovered || 0;


    const recoverable =
        metrics?.recoverableRevenue || 0;


    const successRate =
        metrics &&
        metrics.totalRecoveryAttempts > 0

            ?

            (
                metrics.successfulRecoveries /
                metrics.totalRecoveryAttempts
            ) * 100

            :

            0;


    // =====================================
    // SIDEBAR NAVIGATION
    // =====================================
    function navigateToSection(sectionId: string) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    }

    // =====================================
    // RENDER
    // =====================================

    const batchActionBreakdown = batchResult
        ? Object.entries(
            batchResult.results.reduce<Record<string, number>>(
                (counts, item) => {
                    const action = item.action || "NO_ACTION";
                    counts[action] = (counts[action] || 0) + 1;
                    return counts;
                },
                {}
            )
        ).sort(([, a], [, b]) => b - a)
        : [];


    const batchBlockedReasonBreakdown = batchResult
        ? Object.entries(
            batchResult.results
                .filter(
                    item =>
                        item.policyDecision === "BLOCKED"
                )
                .reduce<Record<string, number>>(
                    (counts, item) => {
                        const reasons =
                            item.policyReasons?.length > 0
                                ? item.policyReasons
                                : ["Policy blocked the recovery"];

                        reasons.forEach(reason => {
                            counts[reason] =
                                (counts[reason] || 0) + 1;
                        });

                        return counts;
                    },
                    {}
                )
        ).sort(([, a], [, b]) => b - a)
        : [];


    return (

        <div className="app">


            {/* =================================
                SIDEBAR
            ================================= */}

            <aside className="sidebar">

                <div className="brand">

                    <div className="brand-mark">

                        <IndianRupee
                            size={21}
                            strokeWidth={2.5}
                        />

                    </div>


                    <div>

                        <div className="brand-title">
                            Revenue
                        </div>

                        <div className="brand-subtitle">
                            Intelligence
                        </div>

                    </div>

                </div>


                <nav>

                    <div className="nav-section">
                        OVERVIEW
                    </div>


                    <button type="button" className="nav-item active" onClick={() => navigateToSection("dashboard-section")}>

                        <TrendingUp
                            size={18}
                        />

                        Dashboard

                    </button>


                    <button type="button" className="nav-item" onClick={() => navigateToSection("incidents-section")}>

                        <AlertTriangle
                            size={18}
                        />

                        Incidents

                    </button>


                    <button type="button" className="nav-item" onClick={() => navigateToSection("recovery-engine-section")}>

                        <Zap
                            size={18}
                        />

                        Recovery Engine

                    </button>


                    <div className="nav-section">
                        INTELLIGENCE
                    </div>


                    <button type="button" className="nav-item" onClick={() => navigateToSection("ai-decisions-section")}>

                        <Bot
                            size={18}
                        />

                        AI Decisions

                    </button>


                    <button type="button" className="nav-item" onClick={() => navigateToSection("policy-controls-section")}>

                        <ShieldCheck
                            size={18}
                        />

                        Policy Controls

                    </button>


                    <button type="button" className="nav-item" onClick={() => navigateToSection("audit-trail-section")}>

                        <Clock3
                            size={18}
                        />

                        Audit Trail

                    </button>

                </nav>


                <div className="sidebar-bottom">

                    <div className="system-status">

                        <span className="status-dot"></span>


                        <div>

                            <div className="status-title">
                                Recovery engine
                            </div>

                            <div className="status-text">
                                Operational
                            </div>

                        </div>

                    </div>


                    <div className="version">
                        Revenue Intelligence v1.0
                    </div>

                </div>

            </aside>


            {/* =================================
                MAIN
            ================================= */}

            <main className="main">


                <header className="header">

                    <div>

                        <div className="eyebrow">
                            MERCHANT REVENUE CONTROL
                        </div>


                        <h1>
                            Revenue Intelligence
                        </h1>


                        <p>
                            Detect revenue at risk.
                            Optimize recovery.
                            Measure actual recovery.
                        </p>

                    </div>


                    <div className="header-actions">

                        <div className="live-pill">

                            <span></span>

                            LIVE

                        </div>


                        <button
                            className="refresh-button"
                            onClick={
                                loadDashboard
                            }
                        >

                            <RefreshCw
                                size={16}
                            />

                            Refresh

                        </button>

                    </div>

                </header>


                {error && (

                    <div className="error-banner">

                        <AlertTriangle
                            size={18}
                        />

                        {error}

                    </div>

                )}


                {/* =================================
                    METRICS
                ================================= */}

                <section id="dashboard-section" className="metrics-grid">


                    <MetricCard
                        label="Revenue at risk"
                        value={
                            metrics
                                ? formatRupees(
                                    metrics.revenueAtRisk
                                )
                                : "—"
                        }
                        detail="Detected payment degradation"
                        icon={
                            <AlertTriangle />
                        }
                        variant="danger"
                    />


                    <MetricCard
                        label="Recoverable revenue"
                        value={
                            metrics
                                ? formatRupees(
                                    metrics.recoverableRevenue
                                )
                                : "—"
                        }
                        detail="AI-estimated opportunity"
                        icon={
                            <Target />
                        }
                        variant="warning"
                    />


                    <MetricCard
                        label="Actually recovered"
                        value={
                            metrics
                                ? formatRupees(
                                    metrics.totalRecovered
                                )
                                : "—"
                        }
                        detail={
                            metrics
                                ? `${metrics.successfulRecoveries} successful recovery`
                                : "—"
                        }
                        icon={
                            <CircleDollarSign />
                        }
                        variant="success"
                    />


                    <MetricCard
                        label="Recovery rate"
                        value={
                            `${recoveryRate.toFixed(2)}%`
                        }
                        detail="Recovered / recoverable"
                        icon={
                            <TrendingUp />
                        }
                        variant="blue"
                    />

                </section>


                {/* =================================
                    SECONDARY METRICS
                ================================= */}

                <section className="secondary-grid">


                    <MiniMetric
                        icon={
                            <RefreshCw />
                        }
                        label="Recovery attempts"
                        value={
                            metrics?.totalRecoveryAttempts ||
                            0
                        }
                    />


                    <MiniMetric
                        icon={
                            <CheckCircle2 />
                        }
                        label="Successful"
                        value={
                            metrics?.successfulRecoveries ||
                            0
                        }
                    />


                    <MiniMetric
                        icon={
                            <AlertTriangle />
                        }
                        label="Failed"
                        value={
                            metrics?.failedRecoveryAttempts ||
                            0
                        }
                    />


                    <MiniMetric
                        icon={
                            <Zap />
                        }
                        label="Execution success"
                        value={
                            `${successRate.toFixed(0)}%`
                        }
                    />

                </section>


                {/* =================================
                    AI RECOVERY CENTER
                ================================= */}

                <section id="recovery-engine-section" className="recovery-center">


                    <div className="recovery-center-header">

                        <div>

                            <div className="panel-label">
                                AI RECOVERY CENTER
                            </div>


                            <h2>
                                Recover a failed payment
                            </h2>


                            <p>
                                The AI evaluates every available
                                intervention before execution.
                            </p>

                        </div>


                        <div className="ai-engine-status">

                            <Sparkles
                                size={15}
                            />

                            AI ENGINE ONLINE

                        </div>

                    </div>


                    {!failedPayment ? (

                        <div className="recovery-empty">

                            <XCircle
                                size={25}
                            />


                            <strong>
                                No failed payment available
                            </strong>


                            <span>
                                All available test payments have been recovered.
                            </span>


                            <button
                                onClick={
                                    loadDashboard
                                }
                            >
                                Refresh payments
                            </button>

                        </div>

                    ) : (

                        <div className="recovery-workspace">


                            <div className="payment-card">


                                <div className="payment-card-header">

                                    <span>
                                        FAILED PAYMENT
                                    </span>


                                    <span className="failed-badge">

                                        <span></span>

                                        FAILED

                                    </span>

                                </div>


                                <div className="payment-amount">

                                    {
                                        formatFullRupees(
                                            failedPayment.amount
                                        )
                                    }

                                </div>


                                <div className="payment-id">

                                    {
                                        failedPayment.paymentId
                                    }

                                </div>


                                <div className="payment-details">


                                    <PaymentDetail
                                        label="Method"
                                        value={
                                            failedPayment.method.toUpperCase()
                                        }
                                        icon={
                                            <CreditCard />
                                        }
                                    />


                                    <PaymentDetail
                                        label="Device"
                                        value={
                                            failedPayment.device.toUpperCase()
                                        }
                                        icon={
                                            <Bot />
                                        }
                                    />


                                    <PaymentDetail
                                        label="Failure"
                                        value={
                                            failedPayment.failureReason
                                        }
                                        icon={
                                            <AlertTriangle />
                                        }
                                    />


                                    <PaymentDetail
                                        label="Attempts"
                                        value={
                                            `${failedPayment.autoRecoveryAttempts}/2`
                                        }
                                        icon={
                                            <RefreshCw />
                                        }
                                    />

                                </div>


                                <button
                                    className="analyze-button"
                                    onClick={
                                        analyzePayment
                                    }
                                    disabled={
                                        analyzing ||
                                        executing
                                    }
                                >

                                    {analyzing ? (

                                        <>

                                            <Loader2
                                                size={16}
                                                className="spin"
                                            />

                                            Analyzing...

                                        </>

                                    ) : (

                                        <>

                                            <Bot
                                                size={16}
                                            />

                                            Analyze with AI

                                            <ArrowRight
                                                size={15}
                                            />

                                        </>

                                    )}

                                </button>

                            </div>


                            <div className="decision-card">


                                {!recommendation ? (

                                    <div className="decision-placeholder">

                                        <div className="placeholder-icon">

                                            <Bot
                                                size={24}
                                            />

                                        </div>


                                        <strong>
                                            AI decision pending
                                        </strong>


                                        <span>
                                            Analyze the failed payment to
                                            compare recovery strategies.
                                        </span>

                                    </div>

                                ) : (

                                    <>

                                        <div className="decision-header">

                                            <div>

                                                <div className="panel-label">
                                                    AI DECISION
                                                </div>

                                                <h3>
                                                    Best recovery strategy
                                                </h3>

                                            </div>


                                            <div className="recommended-badge">

                                                <CheckCircle2
                                                    size={14}
                                                />

                                                RECOMMENDED

                                            </div>

                                        </div>


                                        <div className="recommended-action">

                                            <div>

                                                <span>
                                                    Recommended action
                                                </span>


                                                <strong>

                                                    {
                                                        actionLabel(
                                                            recommendation.recommendedAction
                                                        )
                                                    }

                                                </strong>

                                            </div>


                                            <div className="probability">

                                                <strong>

                                                    {(
                                                        recommendation.recoveryProbability *
                                                        100
                                                    ).toFixed(2)}

                                                    %

                                                </strong>


                                                <span>
                                                    recovery probability
                                                </span>

                                            </div>

                                        </div>


                                        <div className="candidate-list">


                                            {
                                                recommendation.candidates.map(
                                                    candidate => {

                                                        const isBest =
                                                            candidate.action ===
                                                            recommendation.recommendedAction;


                                                        return (

                                                            <div
                                                                className={
                                                                    `candidate ${
                                                                        isBest
                                                                            ? "best"
                                                                            : ""
                                                                    }`
                                                                }
                                                                key={
                                                                    candidate.action
                                                                }
                                                            >


                                                                <div className="candidate-name">

                                                                    {isBest && (

                                                                        <CheckCircle2
                                                                            size={13}
                                                                        />

                                                                    )}


                                                                    <span>

                                                                        {
                                                                            actionLabel(
                                                                                candidate.action
                                                                            )
                                                                        }

                                                                    </span>

                                                                </div>


                                                                <div className="candidate-probability">

                                                                    {(
                                                                        candidate.recoveryProbability *
                                                                        100
                                                                    ).toFixed(1)}

                                                                    %

                                                                </div>


                                                                <div className="candidate-recovery">

                                                                    {
                                                                        formatRupees(
                                                                            candidate.expectedRecovery
                                                                        )
                                                                    }

                                                                </div>

                                                            </div>

                                                        );

                                                    }
                                                )
                                            }

                                        </div>


                                        <div className="expected-box">


                                            <div>

                                                <span>
                                                    Expected recovery
                                                </span>


                                                <strong>

                                                    {
                                                        formatFullRupees(
                                                            recommendation.expectedRecovery
                                                        )
                                                    }

                                                </strong>

                                            </div>


                                            <div>

                                                <span>
                                                    Expected net recovery
                                                </span>


                                                <strong>

                                                    {
                                                        formatFullRupees(
                                                            recommendation.expectedNetRecovery
                                                        )
                                                    }

                                                </strong>

                                            </div>

                                        </div>                                        <div className="decision-trace">

                                            <div className="decision-trace-header">
                                                <Sparkles size={14} />
                                                <span>WHY THIS ACTION</span>
                                            </div>

                                            <div className="decision-trace-grid">
                                                <div>
                                                    <span>PAYMENT</span>
                                                    <strong>{formatFullRupees(failedPayment?.amount || 0)}</strong>
                                                </div>
                                                <div>
                                                    <span>METHOD</span>
                                                    <strong>{(failedPayment?.method || "unknown").toUpperCase()}</strong>
                                                </div>
                                                <div>
                                                    <span>RETRIES</span>
                                                    <strong>{failedPayment?.retryCount || 0} / 2</strong>
                                                </div>
                                                <div>
                                                    <span>CONFIDENCE</span>
                                                    <strong>{(recommendation.recoveryProbability * 100).toFixed(1)}%</strong>
                                                </div>
                                            </div>

                                            <p>
                                                {decisionExplanation(recommendation)}
                                            </p>

                                            <small>
                                                AI compared all recovery strategies, then the safety policy determined whether the selected action could execute.
                                            </small>

                                        </div>

                                        <div className="decision-reason">

                                            <ShieldCheck
                                                size={14}
                                            />

                                            {
                                                recommendation.reason
                                            }

                                        </div>


                                        {!workflowResult && (

                                            <button
                                                className="execute-button"
                                                onClick={
                                                    executeRecovery
                                                }
                                                disabled={
                                                    executing
                                                }
                                            >

                                                {executing ? (

                                                    <>

                                                        <Loader2
                                                            size={16}
                                                            className="spin"
                                                        />

                                                        Executing recovery...

                                                    </>

                                                ) : (

                                                    <>

                                                        <Zap
                                                            size={16}
                                                        />

                                                        Execute approved recovery

                                                    </>

                                                )}

                                            </button>

                                        )}

                                    </>

                                )}

                            </div>

                        </div>

                    )}


                    {workflowResult && (

                       <>

                          <div
                                className={
                                   `workflow-result ${
                                    workflowResult.execution?.success
                                        ? "success-result"
                                        : workflowResult.policy.decision ===
                                            "BLOCKED"
                                            ? "blocked-result"
                                            : "failed-result"
                                }`
                            }
                        >

                            <div className="result-icon">

                                {workflowResult.execution?.success ? (

                                    <CheckCircle2
                                        size={25}
                                    />

                                ) : workflowResult.policy.decision ===
                                    "BLOCKED" ? (

                                    <ShieldCheck
                                        size={25}
                                    />

                                ) : (

                                    <XCircle
                                        size={25}
                                    />

                                )}

                            </div>


                            <div className="result-main">

                                <span>
                                    RECOVERY EXECUTION
                                </span>


                                <strong>

                                    {workflowResult.execution?.success

                                        ? `${formatFullRupees(
                                            workflowResult.execution.amountRecovered ||
                                            0
                                        )} recovered`

                                        : workflowResult.policy.decision ===
                                            "BLOCKED"

                                            ? "Recovery blocked by policy"

                                            : "Recovery attempt failed"

                                    }

                                </strong>


                                <p>

                                    {workflowResult.execution?.success

                                        ? `Payment ${workflowResult.paymentId} was successfully recovered using ${actionLabel(
                                            workflowResult.execution.action ||
                                            workflowResult.recommendation.recommendedAction
                                        )}.`

                                        : workflowResult.policy.decision ===
                                            "BLOCKED"

                                            ? workflowResult.policy.reasons.join(
                                                " • "
                                            )

                                            : (
                                                workflowResult.execution?.message ||
                                                "The recovery attempt did not recover the payment."
                                            )

                                    }

                                </p>

                            </div>


                            <div className="result-status">

                                {
                                    workflowResult.policy.decision
                                }

                            </div>

                        </div>

                        {(
                            workflowResult.policy.decision ===
                                "BLOCKED" ||
                            workflowResult.execution?.success
                        ) && (
                            <button
                                type="button"
                                className="next-payment-button"
                                onClick={
                                    selectNextFailedPayment
                                }
                                disabled={
                                    nextPaymentLoading
                                }
                            >
                                {nextPaymentLoading ? (
                                    <>
                                        <Loader2
                                            size={16}
                                            className="spin"
                                        />
                                        Loading next payment...
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight
                                            size={16}
                                        />
                                        Analyze next failed payment
                                    </>
                                )}
                            </button>
                        )}

                        </>

                    )}

                </section>


                {/* =================================
                    MERCHANT INTELLIGENCE
                ================================= */}

                <section className="panel merchant-panel">


                    <div className="panel-header">

                        <div>

                            <div className="panel-label">
                                MERCHANT INTELLIGENCE
                            </div>


                            <h2>
                                Revenue recovery priority
                            </h2>

                        </div>


                        <div className="merchant-priority-badge">

                            <Target
                                size={14}
                            />

                            PRIORITIZED BY RECOVERABLE REVENUE

                        </div>

                    </div>


                    <div className="merchant-intro">

                        <div className="merchant-intro-icon">

                            <TrendingUp
                                size={18}
                            />

                        </div>


                        <div>

                            <strong>
                                Where should the recovery engine focus?
                            </strong>


                            <span>
                                Click a merchant to inspect its revenue
                                exposure and affected payments.
                            </span>

                        </div>

                    </div>


                    <div className="merchant-table">


                        <div className="merchant-table-head">

                            <span>
                                PRIORITY
                            </span>


                            <span>
                                MERCHANT
                            </span>


                            <span>
                                FAILED
                            </span>


                            <span>
                                FAILURE RATE
                            </span>


                            <span>
                                RECOVERABLE
                            </span>


                            <span>
                                RISK
                            </span>

                        </div>


                        {merchantIntelligence.length === 0 ? (

                            <div className="empty-state">
                                Calculating merchant intelligence...
                            </div>

                        ) : (

                            merchantIntelligence.map(
                                (
                                    merchant,
                                    index
                                ) => {


                                    const maxRecoverable =
                                        merchantIntelligence[0]
                                            ?.recoverableRevenue ||
                                        1;


                                    const barWidth =
                                        Math.min(
                                            (
                                                merchant.recoverableRevenue /
                                                maxRecoverable
                                            ) * 100,
                                            100
                                        );


                                    const risk =
                                        merchant.riskScore >= 1.35
                                            ? "HIGH"
                                            : merchant.riskScore >= 1.15
                                                ? "ELEVATED"
                                                : "NORMAL";


                                    return (

                                        <button
                                            type="button"
                                            className="merchant-row merchant-row-button"
                                            key={
                                                merchant.merchantId
                                            }
                                            onClick={() =>
                                                openMerchant(
                                                    merchant
                                                )
                                            }
                                        >


                                            <div className="priority-number">

                                                {String(
                                                    index + 1
                                                ).padStart(
                                                    2,
                                                    "0"
                                                )}

                                            </div>


                                            <div className="merchant-name">

                                                <div className="merchant-avatar">

                                                    {
                                                        merchant.merchantId
                                                            .replace(
                                                                "merchant_",
                                                                ""
                                                            )
                                                            .slice(
                                                                0,
                                                                2
                                                            )
                                                    }

                                                </div>


                                                <div>

                                                    <strong>
                                                        {
                                                            merchant.merchantId
                                                        }
                                                    </strong>


                                                    <small>

                                                        {
                                                            merchant.totalTransactions
                                                                .toLocaleString(
                                                                    "en-IN"
                                                                )
                                                        }

                                                        {" "}

                                                        transactions

                                                    </small>

                                                </div>

                                            </div>


                                            <div className="merchant-failed">

                                                <strong>

                                                    {
                                                        formatRupees(
                                                            merchant.failedRevenue
                                                        )
                                                    }

                                                </strong>


                                                <small>

                                                    {
                                                        merchant.failedTransactions
                                                    }

                                                    {" "}

                                                    failures

                                                </small>

                                            </div>


                                            <div className="merchant-failure-rate">

                                                <div>

                                                    <div className="merchant-rate-track">

                                                        <div
                                                            style={{
                                                                width:
                                                                    `${Math.min(
                                                                        merchant.failureRate,
                                                                        100
                                                                    )}%`
                                                            }}
                                                        />

                                                    </div>


                                                    <span>

                                                        {
                                                            merchant.failureRate
                                                        }%

                                                    </span>

                                                </div>

                                            </div>


                                            <div className="merchant-recoverable">

                                                <strong>

                                                    {
                                                        formatRupees(
                                                            merchant.recoverableRevenue
                                                        )
                                                    }

                                                </strong>


                                                <div className="merchant-value-track">

                                                    <div
                                                        style={{
                                                            width:
                                                                `${barWidth}%`
                                                        }}
                                                    />

                                                </div>

                                            </div>


                                            <div>

                                                <span
                                                    className={
                                                        `risk-level ${
                                                            risk ===
                                                            "HIGH"

                                                                ? "high"

                                                                : risk ===
                                                                    "ELEVATED"

                                                                    ? "medium"

                                                                    : "normal"
                                                        }`
                                                    }
                                                >

                                                    {
                                                        risk
                                                    }

                                                </span>

                                            </div>

                                        </button>

                                    );

                                }
                            )

                        )}

                    </div>

                </section>


                {/* =================================
                    RECOVERY PERFORMANCE + AI DECISIONS
                ================================= */}

                <section id="ai-decisions-section" className="content-grid">


                    <div className="panel">


                        <div className="panel-header">

                            <div>

                                <div className="panel-label">
                                    RECOVERY PERFORMANCE
                                </div>


                                <h2>
                                    Money recovered by action
                                </h2>

                            </div>


                            <div className="ai-badge">

                                <Sparkles
                                    size={14}
                                />

                                AI OPTIMIZED

                            </div>

                        </div>


                        <div className="recovery-summary">


                            <div>

                                <span>
                                    Actual recovered
                                </span>


                                <strong>

                                    {
                                        formatFullRupees(
                                            recovered
                                        )
                                    }

                                </strong>

                            </div>


                            <div>

                                <span>
                                    Recoverable opportunity
                                </span>


                                <strong>

                                    {formatFullRupees(
                                            recoverable
                                        )
                                    }

                                </strong>

                            </div>

                        </div>


                        <div className="action-list">


                            {actions.length === 0 ? (

                                <div className="empty-state">
                                    No recovery actions recorded yet.
                                </div>

                            ) : (

                                actions.map(
                                    (
                                        action,
                                        index
                                    ) => {


                                        const percentage =
                                            recovered > 0

                                                ?

                                                (
                                                    action.recoveredRevenue /
                                                    recovered
                                                ) * 100

                                                :

                                                0;


                                        return (

                                            <div
                                                className="action-row"
                                                key={
                                                    action.action
                                                }
                                            >


                                                <div className="action-info">

                                                    <span className="action-number">
                                                        0{index + 1}
                                                    </span>


                                                    <div>

                                                        <strong>

                                                            {
                                                                actionLabel(
                                                                    action.action
                                                                )
                                                            }

                                                        </strong>


                                                        <small>

                                                            {
                                                                action.successfulRecoveries
                                                            }

                                                            {" "}

                                                            successful

                                                        </small>

                                                    </div>

                                                </div>


                                                <div className="action-bar">

                                                    <div
                                                        style={{
                                                            width:
                                                                `${percentage}%`
                                                        }}
                                                    />

                                                </div>


                                                <strong className="action-value">

                                                    {
                                                        formatRupees(
                                                            action.recoveredRevenue
                                                        )
                                                    }

                                                </strong>

                                            </div>

                                        );

                                    }
                                )

                            )}

                        </div>

                    </div>


                    <div className="panel">


                        <div className="panel-header">

                            <div>

                                <div className="panel-label">
                                    AI RECOVERY ENGINE
                                </div>


                                <h2>
                                    Decision pipeline
                                </h2>

                            </div>


                            <Bot
                                size={22}
                                className="panel-icon"
                            />

                        </div>


                        <div className="pipeline">


                            <PipelineStep
                                number="01"
                                title="Detect"
                                description="Find abnormal payment failure patterns"
                                icon={
                                    <AlertTriangle />
                                }
                            />


                            <div className="connector" />


                            <PipelineStep
                                number="02"
                                title="Predict"
                                description="Estimate recovery probability"
                                icon={
                                    <Bot />
                                }
                            />


                            <div className="connector" />


                            <PipelineStep
                                number="03"
                                title="Optimize"
                                description="Choose highest expected recovery"
                                icon={
                                    <Target />
                                }
                            />


                            <div className="connector" />


                            <PipelineStep
                                number="04"
                                title="Execute"
                                description="Apply bounded recovery policy"
                                icon={
                                    <Zap />
                                }
                            />

                        </div>

                    </div>

                </section>


                {/* =================================
                    INCIDENTS
                ================================= */}

                <section id="incidents-section" className="panel incidents-panel">


                    <div className="panel-header">

                        <div>

                            <div className="panel-label">
                                REVENUE INCIDENTS
                            </div>


                            <h2>
                                Detected payment degradation
                            </h2>

                        </div>


                        <span className="incident-count">

                            {
                                incidents.length
                            }

                            {" "}

                            incidents

                        </span>

                    </div>


                    <div className="incident-table">


                        <div className="table-head">

                            <span>
                                Incident
                            </span>


                            <span>
                                Root cause
                            </span>


                            <span>
                                Transactions
                            </span>


                            <span>
                                Revenue at risk
                            </span>


                            <span>
                                Confidence
                            </span>


                            <span>
                                Status
                            </span>

                        </div>


                        {incidents.length === 0 ? (

                            <div className="empty-state">
                                No incidents detected.
                            </div>

                        ) : (

                            incidents
                                .slice(
                                    0,
                                    8
                                )
                                .map(
                                    incident => (

                                        <div
                                            className="table-row"
                                            key={
                                                incident._id ||
                                                incident.incidentId
                                            }
                                        >


                                            <div className="incident-name">

                                                <div className="incident-icon">

                                                    <CreditCard
                                                        size={16}
                                                    />

                                                </div>


                                                <div>

                                                    <strong>

                                                        {
                                                            incident.paymentMethod
                                                                ?.toUpperCase()
                                                        }

                                                        {
                                                            incident.bank
                                                                ? ` / ${incident.bank}`
                                                                : ""
                                                        }

                                                    </strong>


                                                    <small>
                                                        {
                                                            incident.type
                                                        }
                                                    </small>

                                                </div>

                                            </div>


                                            <span>

                                                {
                                                    incident.rootCause ||
                                                    "Payment failure spike"
                                                }

                                            </span>


                                            <strong>

                                                {
                                                    incident.affectedTransactions
                                                        ?.toLocaleString(
                                                            "en-IN"
                                                        )
                                                }

                                            </strong>


                                            <strong className="risk-value">

                                                {
                                                    formatRupees(
                                                        incident.grossRevenueAtRisk ||
                                                        0
                                                    )
                                                }

                                            </strong>


                                            <div className="confidence">

                                                <div className="confidence-track">

                                                    <div
                                                        style={{
                                                            width:
                                                                `${
                                                                    (
                                                                        incident.confidence ||
                                                                        0
                                                                    ) * 100
                                                                }%`
                                                        }}
                                                    />

                                                </div>


                                                <span>

                                                    {
                                                        (
                                                            (
                                                                incident.confidence ||
                                                                0
                                                            ) * 100
                                                        ).toFixed(0)
                                                    }%

                                                </span>

                                            </div>


                                            <span className="status-badge">

                                                <span />

                                                {
                                                    incident.status
                                                }

                                            </span>

                                        </div>

                                    )
                                )

                        )}

                    </div>

                </section>



                {/* =================================
                    AUDIT TRAIL
                ================================= */}
                <section id="audit-trail-section" className="panel audit-trail-panel">
                    <div className="panel-header">
                        <div>
                            <div className="panel-label">AUDIT TRAIL</div>
                            <h2>Recovery decision history</h2>
                        </div>
                        <Clock3 size={22} className="panel-icon" />
                    </div>

                    {!workflowResult ? (
                        <div className="audit-empty">
                            <div className="audit-empty-icon">
                                <Clock3 size={18} />
                            </div>
                            <strong>No recovery execution recorded yet</strong>
                            <span>Run an approved recovery to see the decision, policy check, and execution trail.</span>
                        </div>
                    ) : (
                        <div className="audit-timeline">
                            <div className="audit-item">
                                <div className="audit-dot ai"></div>
                                <div className="audit-content">
                                    <div className="audit-topline">
                                        <span>AI DECISION</span>
                                        <strong>{actionLabel(workflowResult.recommendation.recommendedAction)}</strong>
                                    </div>
                                    <div className="audit-meta">
                                        Payment <b>{workflowResult.paymentId}</b> · Confidence <b>{(workflowResult.recommendation.recoveryProbability * 100).toFixed(1)}%</b>
                                    </div>
                                    <div className="audit-detail">
                                        {workflowResult.recommendation.reason}
                                    </div>
                                </div>
                            </div>

                            <div className="audit-item">
                                <div className={`audit-dot ${workflowResult.policy.allowed ? "policy-ok" : "policy-blocked"}`}></div>
                                <div className="audit-content">
                                    <div className="audit-topline">
                                        <span>POLICY CHECK</span>
                                        <strong>{workflowResult.policy.decision}</strong>
                                    </div>
                                    <div className="audit-meta">
                                        Automatic recovery guardrails evaluated before execution
                                    </div>
                                    <div className="audit-detail">
                                        {workflowResult.policy.reasons.join(" • ")}
                                    </div>
                                </div>
                            </div>

                            <div className="audit-item last">
                                <div className={`audit-dot ${workflowResult.execution?.success ? "success" : "failed"}`}></div>
                                <div className="audit-content">
                                    <div className="audit-topline">
                                        <span>EXECUTION</span>
                                        <strong>{workflowResult.execution?.success ? "SUCCESS" : workflowResult.execution?.status?.toUpperCase() || "NOT EXECUTED"}</strong>
                                    </div>
                                    <div className="audit-meta">
                                        Action <b>{actionLabel(workflowResult.execution?.action || workflowResult.recommendation.recommendedAction)}</b> · Attempt <b>{workflowResult.execution?.recoveryAttempt || 0} / 2</b>
                                    </div>
                                    <div className="audit-detail">
                                        {workflowResult.execution?.success
                                            ? `${formatFullRupees(workflowResult.execution.amountRecovered || 0)} recovered successfully.`
                                            : workflowResult.execution?.message || workflowResult.policy.reasons.join(" • ")}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="audit-note">
                        <ShieldCheck size={14} />
                        <span>Decision, safety policy, and execution outcome remain linked to the same payment ID.</span>
                    </div>
                </section>


                {/* =================================
                    POLICY CONTROLS
                ================================= */}
                <section id="policy-controls-section" className="panel policy-controls-panel">
                    <div className="panel-header">
                        <div>
                            <div className="panel-label">POLICY CONTROLS</div>
                            <h2>Bounded recovery guardrails</h2>
                        </div>
                        <ShieldCheck size={22} className="panel-icon" />
                    </div>

                    <div className="policy-grid">
                        <div className="policy-card">
                            <span>MAX AUTO-RECOVERY AMOUNT</span>
                            <strong>₹50,000</strong>
                            <small>Higher-value payments require manual review.</small>
                        </div>
                        <div className="policy-card">
                            <span>MINIMUM RECOVERY PROBABILITY</span>
                            <strong>60%</strong>
                            <small>Low-confidence actions are blocked.</small>
                        </div>
                        <div className="policy-card">
                            <span>MAX RETRIES</span>
                            <strong>2</strong>
                            <small>Prevents repeated payment attempts.</small>
                        </div>
                        <div className="policy-card">
                            <span>MAX AUTO ATTEMPTS</span>
                            <strong>2</strong>
                            <small>Stops the recovery loop automatically.</small>
                        </div>
                    </div>

                    <div className="policy-note">
                        <ShieldCheck size={15} />
                        <span>Every recovery recommendation passes policy checks before execution.</span>
                    </div>
                </section>

                {/* =================================
                    FOOTER
                ================================= */}

                <footer>

                    <div>

                        <span className="footer-live"></span>

                        System operational

                    </div>


                    <div>

                        {
                            lastUpdated

                                ? `Last updated ${lastUpdated.toLocaleTimeString()}`

                                : "Connecting..."
                        }

                    </div>

                </footer>

            </main>


            {/* =================================
                MERCHANT DETAIL DRAWER
            ================================= */}

            {selectedMerchant && (

                <div className="merchant-overlay">


                    <div
                        className="merchant-overlay-backdrop"
                        onClick={
                            closeMerchant
                        }
                    />


                    <aside className="merchant-drawer">


                        {/* DRAWER HEADER */}

                        <div className="merchant-drawer-header">


                            <div>

                                <div className="panel-label">
                                    MERCHANT RECOVERY CONTROL
                                </div>


                                <h2>

                                    {
                                        selectedMerchant.merchantId
                                    }

                                </h2>


                                <p>
                                    Revenue recovery opportunity
                                </p>

                            </div>


                            <button
                                type="button"
                                className="merchant-close"
                                onClick={
                                    closeMerchant
                                }
                            >

                                <X
                                    size={19}
                                />

                            </button>

                        </div>


                        {/* LOADING */}

                        {merchantLoading ? (

                            <div className="merchant-loading">

                                <Loader2
                                    size={25}
                                    className="spin"
                                />

                                <span>
                                    Loading merchant intelligence...
                                </span>

                            </div>

                        ) : (

                            <>


                                {/* =================================
                                    MERCHANT SUMMARY
                                ================================= */}

                                <div className="merchant-detail-metrics">


                                    <div>

                                        <span>
                                            FAILED REVENUE
                                        </span>


                                        <strong>

                                            {
                                                formatRupees(
                                                    selectedMerchant.failedRevenue
                                                )
                                            }

                                        </strong>

                                    </div>


                                    <div>

                                        <span>
                                            RECOVERABLE
                                        </span>


                                        <strong className="green-text">

                                            {
                                                formatRupees(
                                                    selectedMerchant.recoverableRevenue
                                                )
                                            }

                                        </strong>

                                    </div>


                                    <div>

                                        <span>
                                            FAILURE RATE
                                        </span>


                                        <strong>

                                            {
                                                selectedMerchant.failureRate
                                            }%

                                        </strong>

                                    </div>

                                </div>


                                {/* =================================
                                    RECOVERY FOCUS
                                ================================= */}

                                <div className="merchant-focus-box">


                                    <div className="merchant-focus-icon">

                                        <Target
                                            size={18}
                                        />

                                    </div>


                                    <div>

                                        <span>
                                            RECOVERY OPPORTUNITY
                                        </span>


                                        <strong>

                                            {
                                                merchantPayments?.failureCount ||
                                                0
                                            }

                                            {" "}
                                            failed payments representing approximately{" "}

                                            {
                                                formatRupees(
                                                    merchantPayments?.totalFailedRevenue ||
                                                    0
                                                )
                                            }

                                            {" "}
                                            in exposed revenue.

                                        </strong>

                                    </div>

                                </div>


                                {/* =================================
                                    AUTONOMOUS BATCH RECOVERY
                                ================================= */}

                                <div className="merchant-batch-box">

                                    <div className="merchant-batch-header">

                                        <div className="merchant-batch-icon">
                                            <Zap
                                                size={16}
                                            />
                                        </div>

                                        <div>

                                            <span>
                                                AUTONOMOUS RECOVERY
                                            </span>

                                            <strong>
                                                Recover eligible failed payments
                                            </strong>

                                        </div>

                                    </div>


                                    <p>
                                        AI evaluates up to{" "}
                                        <strong>
                                            10
                                        </strong>{" "}
                                        failed payments, selects the
                                        highest expected-value action,
                                        applies safety policy, and executes
                                        only approved recoveries.
                                    </p>


                                    <button
                                        type="button"
                                        className="merchant-batch-button"
                                        onClick={
                                            runMerchantBatchRecovery
                                        }
                                        disabled={
                                            batchRunning
                                        }
                                    >

                                        {batchRunning ? (

                                            <>
                                                <Loader2
                                                    size={16}
                                                    className="spin"
                                                />

                                                Running recovery batch...
                                            </>

                                        ) : (

                                            <>
                                                <Zap
                                                    size={16}
                                                />

                                                Run Recovery Batch

                                                <ArrowRight
                                                    size={15}
                                                />
                                            </>

                                        )}

                                    </button>

                                </div>


                                {batchResult && (

                                    <div className="batch-result-panel">

                                        <div className="batch-result-header">

                                            <div>

                                                <span>
                                                    BATCH COMPLETE
                                                </span>

                                                <h3>
                                                    Recovery batch executed
                                                </h3>

                                            </div>

                                            <CheckCircle2
                                                size={19}
                                            />

                                        </div>


                                        <div className="batch-metrics">

                                            <div>
                                                <span>
                                                    EVALUATED
                                                </span>

                                                <strong>
                                                    {
                                                        batchResult.summary
                                                            .paymentsEvaluated
                                                    }
                                                </strong>
                                            </div>


                                            <div>
                                                <span>
                                                    APPROVED
                                                </span>

                                                <strong>
                                                    {
                                                        batchResult.summary
                                                            .approved
                                                    }
                                                </strong>
                                            </div>


                                            <div>
                                                <span>
                                                    BLOCKED
                                                </span>

                                                <strong>
                                                    {
                                                        batchResult.summary
                                                            .blocked
                                                    }
                                                </strong>
                                            </div>


                                            <div>
                                                <span>
                                                    RECOVERED
                                                </span>

                                                <strong>
                                                    {
                                                        batchResult.summary
                                                            .recovered
                                                    }
                                                </strong>
                                            </div>

                                        </div>


                                        <div className="batch-money">

                                            <div>
                                                <span>
                                                    REVENUE EVALUATED
                                                </span>

                                                <strong>
                                                    {
                                                        formatRupees(
                                                            batchResult.summary
                                                                .totalRevenueAtRisk
                                                        )
                                                    }
                                                </strong>
                                            </div>


                                            <div>
                                                <span>
                                                    EXPECTED RECOVERY
                                                </span>

                                                <strong>
                                                    {
                                                        formatRupees(
                                                            batchResult.summary
                                                                .totalExpectedRecovery
                                                        )
                                                    }
                                                </strong>
                                            </div>


                                            <div>
                                                <span>
                                                    ACTUALLY RECOVERED
                                                </span>

                                                <strong>
                                                    {
                                                        formatRupees(
                                                            batchResult.summary
                                                                .totalRecovered
                                                        )
                                                    }
                                                </strong>
                                            </div>


                                            <div>
                                                <span>
                                                    RECOVERY RATE
                                                </span>

                                                <strong>
                                                    {
                                                        batchResult.summary
                                                            .recoveryRate
                                                            .toFixed(2)
                                                    }%
                                                </strong>
                                            </div>

                                        </div>


                                        <div className="batch-result-message">

                                            <ShieldCheck
                                                size={14}
                                            />

                                            <span>
                                                Every payment was evaluated
                                                against the same recovery
                                                policy. Blocked payments
                                                were not executed.
                                            </span>

                                        </div>


                                        <div className="batch-intelligence-grid">

                                            <div className="batch-intelligence-card">

                                                <div className="batch-intelligence-title">
                                                    <Bot size={14} />
                                                    <span>TOP RECOVERY ACTIONS</span>
                                                </div>

                                                <div className="batch-intelligence-list">
                                                    {batchActionBreakdown.slice(0, 4).map(
                                                        ([action, count]) => {
                                                            const maxCount =
                                                                batchActionBreakdown[0]?.[1] ||
                                                                1;
                                                            const width =
                                                                Math.max(12, (count / maxCount) * 100);

                                                            return (
                                                                <div
                                                                    className="batch-intelligence-row"
                                                                    key={action}
                                                                >
                                                                    <div className="batch-intelligence-row-top">
                                                                        <span>{actionLabel(action)}</span>
                                                                        <strong>{count}</strong>
                                                                    </div>
                                                                    <div className="batch-intelligence-bar">
                                                                        <div
                                                                            className="batch-intelligence-bar-fill"
                                                                            style={{ width: `${width}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                                </div>

                                            </div>


                                            <div className="batch-intelligence-card">

                                                <div className="batch-intelligence-title">
                                                    <ShieldCheck size={14} />
                                                    <span>WHY PAYMENTS WERE BLOCKED</span>
                                                </div>

                                                {batchBlockedReasonBreakdown.length > 0 ? (
                                                    <div className="batch-intelligence-list">
                                                        {batchBlockedReasonBreakdown.slice(0, 4).map(
                                                            ([reason, count]) => (
                                                                <div
                                                                    className="batch-blocked-reason-row"
                                                                    key={reason}
                                                                >
                                                                    <span>{reason}</span>
                                                                    <strong>{count}</strong>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="batch-intelligence-empty">
                                                        No payments were blocked in this batch.
                                                    </div>
                                                )}

                                            </div>

                                        </div>


                                        <div className="batch-payment-results">

                                            <div className="batch-payment-results-header">

                                                <div>
                                                    <span>
                                                        PAYMENT DECISIONS
                                                    </span>

                                                    <strong>
                                                        AI decision and policy outcome for every payment
                                                    </strong>
                                                </div>

                                                <span className="batch-payment-count">
                                                    {
                                                        batchResult.results.length
                                                    }
                                                    {" "}
                                                    payments
                                                </span>

                                            </div>


                                            <div className="batch-payment-table-wrap">

                                                <table className="batch-payment-table">

                                                    <thead>

                                                        <tr>
                                                            <th>Payment</th>
                                                            <th>Amount</th>
                                                            <th>AI action</th>
                                                            <th>Probability</th>
                                                            <th>Expected</th>
                                                            <th>Policy</th>
                                                            <th>Outcome</th>
                                                        </tr>

                                                    </thead>


                                                    <tbody>

                                                        {batchResult.results.map(
                                                            (
                                                                item
                                                            ) => {

                                                                const policyBlocked =
                                                                    item.policyDecision ===
                                                                    "BLOCKED";

                                                                const recovered =
                                                                    item.recovered;

                                                                return (

                                                                    <tr
                                                                        key={
                                                                            item.paymentId
                                                                        }
                                                                    >

                                                                        <td>

                                                                            <div className="batch-payment-id">
                                                                                {
                                                                                    item.paymentId
                                                                                }
                                                                            </div>

                                                                        </td>


                                                                        <td className="batch-payment-amount">

                                                                            {
                                                                                formatFullRupees(
                                                                                    item.amount
                                                                                )
                                                                            }

                                                                        </td>


                                                                        <td>

                                                                            <span className="batch-action-badge">
                                                                                {
                                                                                    actionLabel(
                                                                                        item.action
                                                                                    )
                                                                                }
                                                                            </span>

                                                                        </td>


                                                                        <td>

                                                                            {
                                                                                (
                                                                                    item.recoveryProbability *
                                                                                    100
                                                                                ).toFixed(
                                                                                    1
                                                                                )
                                                                            }%

                                                                        </td>


                                                                        <td>

                                                                            {
                                                                                formatRupees(
                                                                                    item.expectedRecovery
                                                                                )
                                                                            }

                                                                        </td>


                                                                        <td>

                                                                            <span
                                                                                className={
                                                                                    `batch-policy-badge ${
                                                                                        policyBlocked
                                                                                            ? "blocked"
                                                                                            : "approved"
                                                                                }`
                                                                            }>

                                                                                {
                                                                                    item.policyDecision
                                                                                }

                                                                            </span>

                                                                            {policyBlocked &&
                                                                                item.policyReasons?.length >
                                                                                    0 && (

                                                                                    <div className="batch-policy-reason">

                                                                                        {
                                                                                            item.policyReasons.join(
                                                                                                " • "
                                                                                            )
                                                                                        }

                                                                                    </div>

                                                                                )}

                                                                        </td>


                                                                        <td>

                                                                            <span
                                                                                className={
                                                                                    `batch-outcome-badge ${
                                                                                        recovered
                                                                                            ? "recovered"
                                                                                            : item.executionStatus ===
                                                                                                  "blocked"
                                                                                                ? "blocked"
                                                                                                : "failed"
                                                                                    }`
                                                                                }
                                                                            >

                                                                                {
                                                                                    recovered
                                                                                        ? "RECOVERED"
                                                                                        : item.executionStatus?.toUpperCase() ||
                                                                                          "NOT EXECUTED"
                                                                                }

                                                                            </span>


                                                                            {recovered &&
                                                                                item.amountRecovered >
                                                                                    0 && (

                                                                                    <div className="batch-recovered-amount">

                                                                                        {
                                                                                            formatFullRupees(
                                                                                                item.amountRecovered
                                                                                            )
                                                                                        }

                                                                                    </div>

                                                                                )}

                                                                        </td>

                                                                    </tr>

                                                                );

                                                            }
                                                        )}

                                                    </tbody>

                                                </table>

                                            </div>

                                        </div>

                                    </div>

                                )}


                                {/* =================================
                                    FAILURE PATTERNS
                                ================================= */}

                                <div className="merchant-detail-section">


                                    <div className="detail-section-title">
                                        FAILURE PATTERNS
                                    </div>


                                    <div className="pattern-grid">


                                        <div className="pattern-card">

                                            <span>
                                                PAYMENT METHODS
                                            </span>


                                            {
                                                merchantPayments &&
                                                Object.entries(
                                                    merchantPayments.methodBreakdown
                                                )
                                                    .sort(
                                                        (
                                                            [, a],
                                                            [, b]
                                                        ) =>
                                                            b.revenue -
                                                            a.revenue
                                                    )
                                                    .slice(
                                                        0,
                                                        4
                                                    )
                                                    .map(
                                                        (
                                                            [
                                                                method,
                                                                data
                                                            ]
                                                        ) => (

                                                            <div
                                                                className="pattern-row"
                                                                key={
                                                                    method
                                                                }
                                                            >

                                                                <span>

                                                                    {
                                                                        method.toUpperCase()
                                                                    }

                                                                </span>


                                                                <strong>

                                                                    {
                                                                        formatRupees(
                                                                            data.revenue
                                                                        )
                                                                    }

                                                                </strong>

                                                            </div>

                                                        )
                                                    )
                                            }

                                        </div>


                                        <div className="pattern-card">

                                            <span>
                                                FAILURE REASONS
                                            </span>


                                            {
                                                merchantPayments &&
                                                Object.entries(
                                                    merchantPayments.failureBreakdown
                                                )
                                                    .sort(
                                                        (
                                                            [, a],
                                                            [, b]
                                                        ) =>
                                                            b.revenue -
                                                            a.revenue
                                                    )
                                                    .slice(
                                                        0,
                                                        4
                                                    )
                                                    .map(
                                                        (
                                                            [
                                                                reason,
                                                                data
                                                            ]
                                                        ) => (

                                                            <div
                                                                className="pattern-row"
                                                                key={
                                                                    reason
                                                                }
                                                            >

                                                                <span>

                                                                    {
                                                                        reason.replaceAll(
                                                                            "_",
                                                                            " "
                                                                        )
                                                                    }

                                                                </span>


                                                                <strong>

                                                                    {
                                                                        formatRupees(
                                                                            data.revenue
                                                                        )
                                                                    }

                                                                </strong>

                                                            </div>

                                                        )
                                                    )
                                            }

                                        </div>

                                    </div>

                                </div>


                                {/* =================================
                                    AFFECTED PAYMENTS
                                ================================= */}

                                <div className="merchant-detail-section">


                                    <div className="detail-section-title">

                                        AFFECTED PAYMENTS


                                        <span>

                                            {
                                                merchantPayments?.payments.length ||
                                                0
                                            }

                                        </span>

                                    </div>


                                    <div className="affected-payments">


                                        {
                                            merchantPayments?.payments
                                                .slice(
                                                    0,
                                                    10
                                                )
                                                .map(
                                                    payment => (

                                                        <button
                                                            type="button"
                                                            className={
                                                                `affected-payment ${
                                                                    selectedMerchantPayment?.paymentId ===
                                                                    payment.paymentId
                                                                        ? "selected"
                                                                        : ""
                                                                }`
                                                            }
                                                            key={
                                                                payment.paymentId
                                                            }
                                                            onClick={() =>
                                                                selectMerchantPayment(
                                                                    payment
                                                                )
                                                            }
                                                        >


                                                            <div className="affected-payment-main">


                                                                <strong>

                                                                    {
                                                                        payment.paymentId
                                                                    }

                                                                </strong>


                                                                <small>

                                                                    {
                                                                        payment.method.toUpperCase()
                                                                    }

                                                                    {" · "}

                                                                    {
                                                                        payment.failureReason?.replaceAll(
                                                                            "_",
                                                                            " "
                                                                        )
                                                                    }

                                                                </small>

                                                            </div>


                                                            <strong>

                                                                {
                                                                    formatFullRupees(
                                                                        payment.amount
                                                                    )
                                                                }

                                                            </strong>

                                                        </button>

                                                    )
                                                )
                                        }

                                    </div>

                                </div>


                                {/* =================================
                                    SELECTED PAYMENT
                                ================================= */}

                                {selectedMerchantPayment && (

                                    <div className="merchant-payment-recovery">


                                        <div className="detail-section-title">

                                            AI PAYMENT RECOVERY

                                        </div>


                                        <div className="selected-payment-card">


                                            <div>

                                                <span>
                                                    SELECTED PAYMENT
                                                </span>


                                                <strong>

                                                    {
                                                        selectedMerchantPayment.paymentId
                                                    }

                                                </strong>

                                            </div>


                                            <div className="selected-payment-amount">

                                                {
                                                    formatFullRupees(
                                                        selectedMerchantPayment.amount
                                                    )
                                                }

                                            </div>

                                        </div>


                                        {!merchantRecommendation ? (

                                            <button
                                                className="analyze-button"
                                                onClick={
                                                    analyzeMerchantPayment
                                                }
                                                disabled={
                                                    merchantAnalyzing
                                                }
                                            >

                                                {merchantAnalyzing ? (

                                                    <>

                                                        <Loader2
                                                            size={16}
                                                            className="spin"
                                                        />

                                                        Analyzing...

                                                    </>

                                                ) : (

                                                    <>

                                                        <Bot
                                                            size={16}
                                                        />

                                                        Analyze with AI

                                                        <ArrowRight
                                                            size={15}
                                                        />

                                                    </>

                                                )}

                                            </button>

                                        ) : (

                                            <div className="merchant-ai-result">


                                                {/* AI RECOMMENDATION */}

                                                <div className="merchant-ai-recommendation">


                                                    <div>

                                                        <span>
                                                            RECOMMENDED ACTION
                                                        </span>


                                                        <strong>

                                                            {
                                                                actionLabel(
                                                                    merchantRecommendation.recommendedAction
                                                                )
                                                            }

                                                        </strong>

                                                    </div>


                                                    <div>

                                                        <span>
                                                            RECOVERY PROBABILITY
                                                        </span>


                                                        <strong>

                                                            {(
                                                                merchantRecommendation.recoveryProbability *
                                                                100
                                                            ).toFixed(1)}

                                                            %

                                                        </strong>

                                                    </div>

                                                </div>


                                                {/* EXPECTED VALUES */}

                                                <div className="merchant-ai-values">


                                                    <div>

                                                        <span>
                                                            EXPECTED RECOVERY
                                                        </span>


                                                        <strong>

                                                            {
                                                                formatRupees(
                                                                    merchantRecommendation.expectedRecovery
                                                                )
                                                            }

                                                        </strong>

                                                    </div>


                                                    <div>

                                                        <span>
                                                            EXPECTED NET
                                                        </span>


                                                        <strong>

                                                            {
                                                                formatRupees(
                                                                    merchantRecommendation.expectedNetRecovery
                                                                )
                                                            }

                                                        </strong>

                                                    </div>

                                                </div>


                                                {/* REASON */}

                                                <div className="decision-reason">

                                                    <Sparkles
                                                        size={14}
                                                    />

                                                    {
                                                        merchantRecommendation.reason
                                                    }

                                                </div>


                                                {/* EXECUTE */}

                                                {!merchantRecoveryResult && (

                                                    <button
                                                        className="execute-button"
                                                        onClick={
                                                            executeMerchantRecovery
                                                        }
                                                        disabled={
                                                            merchantExecuting
                                                        }
                                                    >

                                                        {merchantExecuting ? (

                                                            <>

                                                                <Loader2
                                                                    size={16}
                                                                    className="spin"
                                                                />

                                                                Executing recovery...

                                                            </>

                                                        ) : (

                                                            <>

                                                                <Zap
                                                                    size={16}
                                                                />

                                                                Execute approved recovery

                                                            </>

                                                        )}

                                                    </button>

                                                )}


                                                {/* =================================
                                                    CORRECTED RESULT
                                                ================================= */}

                                                {merchantRecoveryResult && (

                                                    <>

                                                    <div
                                                        className={
                                                            `merchant-execution-result ${
                                                                merchantRecoveryResult.execution?.success
                                                                    ? "success-result"
                                                                    : merchantRecoveryResult.policy.decision ===
                                                                        "BLOCKED"
                                                                        ? "blocked-result"
                                                                        : "failed-result"
                                                            }`
                                                        }
                                                    >

                                                        {
                                                            merchantRecoveryResult.execution?.success

                                                                ? (

                                                                    <CheckCircle2
                                                                        size={18}
                                                                    />

                                                                )

                                                                : merchantRecoveryResult.policy.decision ===
                                                                    "BLOCKED"

                                                                    ? (

                                                                        <ShieldCheck
                                                                            size={18}
                                                                        />

                                                                    )

                                                                    : (

                                                                        <XCircle
                                                                            size={18}
                                                                        />

                                                                    )
                                                        }


                                                        <div>

                                                            <strong>

                                                                {
                                                                    merchantRecoveryResult.execution?.success

                                                                        ? `${formatFullRupees(
                                                                            merchantRecoveryResult.execution.amountRecovered ||
                                                                            0
                                                                        )} recovered`

                                                                        : merchantRecoveryResult.policy.decision ===
                                                                            "BLOCKED"

                                                                            ? "Recovery blocked by policy"

                                                                            : "Recovery attempt failed"
                                                                }

                                                            </strong>


                                                            <span>

                                                                {
                                                                    merchantRecoveryResult.execution?.success

                                                                        ? `Payment ${merchantRecoveryResult.paymentId} was successfully recovered.`

                                                                        : merchantRecoveryResult.policy.decision ===
                                                                            "BLOCKED"

                                                                            ? merchantRecoveryResult.policy.reasons.join(
                                                                                " • "
                                                                            )

                                                                            : (
                                                                                merchantRecoveryResult.execution?.message ||
                                                                                "Payment was not recovered."
                                                                            )
                                                                }

                                                            </span>

                                                        </div>

                                                    </div>

                                                    {merchantPayments?.payments?.some(
                                                        payment =>
                                                            payment.paymentId !==
                                                            selectedMerchantPayment.paymentId
                                                    ) && (
                                                        <button
                                                            type="button"
                                                            className="next-payment-button"
                                                            onClick={
                                                                selectNextMerchantPayment
                                                            }
                                                        >
                                                            <ArrowRight
                                                                size={16}
                                                            />
                                                            Analyze next failed payment
                                                        </button>
                                                    )}

                                                    </>

                                                )}

                                            </div>

                                        )}

                                    </div>

                                )}

                            </>

                        )}

                    </aside>

                </div>

            )}

        </div>

    );

}


// =========================================
// METRIC CARD
// =========================================

function MetricCard({
    label,
    value,
    detail,
    icon,
    variant
}: {
    label: string;
    value: string;
    detail: string;
    icon: ReactNode;
    variant: string;
}) {

    return (

        <div
            className={
                `metric-card ${variant}`
            }
        >

            <div className="metric-top">

                <span>
                    {label}
                </span>


                <div className="metric-icon">
                    {icon}
                </div>

            </div>


            <div className="metric-value">
                {value}
            </div>


            <div className="metric-detail">

                <Clock3
                    size={13}
                />

                {detail}

            </div>

        </div>

    );

}


// =========================================
// MINI METRIC
// =========================================

function MiniMetric({
    icon,
    label,
    value
}: {
    icon: ReactNode;
    label: string;
    value: number | string;
}) {

    return (

        <div className="mini-metric">

            <div className="mini-icon">
                {icon}
            </div>


            <div>

                <span>
                    {label}
                </span>


                <strong>
                    {value}
                </strong>

            </div>

        </div>

    );

}


// =========================================
// PAYMENT DETAIL
// =========================================

function PaymentDetail({
    label,
    value,
    icon
}: {
    label: string;
    value: string;
    icon: ReactNode;
}) {

    return (

        <div className="payment-detail">

            <div className="payment-detail-icon">
                {icon}
            </div>


            <div>

                <span>
                    {label}
                </span>


                <strong>
                    {value}
                </strong>

            </div>

        </div>

    );

}


// =========================================
// PIPELINE STEP
// =========================================

function PipelineStep({
    number,
    title,
    description,
    icon
}: {
    number: string;
    title: string;
    description: string;
    icon: ReactNode;
}) {

    return (

        <div className="pipeline-step">

            <div className="pipeline-number">
                {number}
            </div>


            <div className="pipeline-icon">
                {icon}
            </div>


            <div className="pipeline-content">

                <div className="pipeline-title">

                    <strong>
                        {title}
                    </strong>


                    <CheckCircle2
                        size={14}
                    />

                </div>


                <p>
                    {description}
                </p>

            </div>

        </div>

    );

}


export default App;
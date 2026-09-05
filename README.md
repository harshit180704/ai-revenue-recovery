# AI Revenue Recovery

> **Razorpay Buildathon 2026 — Track 3: AI Revenue Recovery**

**An AI-powered revenue recovery agent that identifies revenue at risk, determines the best recovery intervention for each failed payment, enforces hard safety policies, executes approved recovery actions, and records the complete decision trail.**

## The idea

Payment failure is not the end of the recovery problem.

The difficult question is:

> **"What should we do next to maximize recoverable revenue without blindly retrying everything?"**

AI Revenue Recovery treats payment recovery as a **value-driven decision problem** rather than a fixed retry rule.

For every failed payment, the system:

**Detects → Attributes → Predicts → Optimizes → Controls → Executes → Measures → Audits**

---

## Why this matters

A fixed retry strategy treats every failed payment similarly.

But a ₹500 failed payment and a ₹40,000 failed payment should not necessarily receive the same intervention.

Likewise:

* an immediate retry may be appropriate for one failure,
* a delayed retry may be better for another,
* an alternate payment method may have higher recovery potential,
* and some payments should not be touched automatically at all.

The system therefore evaluates multiple possible interventions and estimates the recovery probability of each one.

---

# What the agent does

### 1. Detect revenue at risk

The system analyzes payment events and identifies:

* failed payments
* abandoned payments
* payment-method degradation
* bank-specific failure patterns
* merchant-level failure concentration
* recoverable revenue

It also attributes revenue impact to detected incidents.

### 2. Build recovery candidates

For each failed payment, the agent evaluates:

| Action             | Description                                     |
| ------------------ | ----------------------------------------------- |
| `RETRY_NOW`        | Attempt recovery immediately                    |
| `DELAYED_RETRY`    | Attempt recovery after a delay                  |
| `ALTERNATE_METHOD` | Attempt recovery through another payment method |
| `NO_ACTION`        | Do not automatically intervene                  |

### 3. Predict recovery probability

A Random Forest model estimates:

> **P(payment recovered | payment context, recovery action)**

The model considers:

* payment amount
* payment method
* bank
* device
* failure reason
* previous success rate
* previous failures
* customer age
* proposed recovery action

### 4. Optimize the intervention

The agent does not simply select the action with the highest probability.

It estimates:

```text
Expected Recovery
= Payment Amount × Recovery Probability
```

and:

```text
Expected Net Recovery
= Expected Recovery − Action Cost
```

The highest-value eligible action is selected.

---

# Safety architecture

## AI recommends. Policy decides. Executor acts.

The ML model **never receives direct authority to execute a payment recovery action**.

Every recommendation passes through a deterministic policy layer.

### Current automatic recovery controls

| Control                          |   Limit |
| -------------------------------- | ------: |
| Maximum automatic payment amount | ₹50,000 |
| Minimum recovery probability     |     60% |
| Maximum retries                  |       2 |
| Maximum automatic attempts       |       2 |
| Resolved incident                | Blocked |

A recommendation can therefore be rejected even when the AI recommends an action.

This creates a clear separation:

```text
AI Model
   ↓
Recommendation
   ↓
Deterministic Policy
   ↓
APPROVED / BLOCKED
   ↓
Executor
```

This makes the system bounded and auditable rather than allowing an AI model to directly mutate payment state.

---

# Merchant Revenue Intelligence

The system also operates at the **merchant level**, not only the individual-payment level.

For each merchant it surfaces:

* total transactions
* failed transactions
* failed revenue
* failure rate
* recoverable revenue
* revenue risk score
* dominant failure patterns
* affected payments

Merchants are prioritized by the amount of revenue that could potentially be recovered.

This allows an operator to move from:

> **"There are failed payments."**

to:

> **"Which merchant is currently exposed to the most recoverable revenue, and which payments should we act on?"**

---

# Autonomous Batch Recovery

A merchant can trigger a bounded recovery batch instead of manually processing payments one at a time.

The batch workflow:

```text
Merchant
   ↓
Find eligible failed payments
   ↓
Generate recovery candidates
   ↓
ML recovery prediction
   ↓
Expected-value optimization
   ↓
Policy validation
   ↓
Approved ─────────→ Execute
   │
   └──────────────→ Block + record reason
                         ↓
                    Batch summary
```

The batch response reports:

* payments evaluated
* approved actions
* blocked actions
* recovered payments
* revenue evaluated
* expected recovery
* actual simulated recovery
* recovery rate
* per-payment decisions
* policy reasons

---

# Auditability

Every recovery decision is recorded.

The audit trail captures:

* payment ID
* merchant ID
* incident ID
* selected action
* recovery probability
* expected recovery
* expected net recovery
* policy decision
* policy reasons
* execution status
* amount recovered
* timestamp

This makes it possible to trace:

```text
AI Recommendation
       ↓
Policy Decision
       ↓
Execution
       ↓
Outcome
       ↓
Recovered Revenue
```

---

# Machine Learning

The recovery model is implemented using:

* Python
* Scikit-learn
* Random Forest
* Joblib

The training pipeline uses **20,000 synthetic historical recovery records**.

### Model evaluation

| Metric    |      Score |
| --------- | ---------: |
| Accuracy  | **69.23%** |
| Precision | **63.82%** |
| Recall    | **50.76%** |
| ROC-AUC   | **0.7403** |

The model is used as a **decision-support component**. Its output is always subject to the deterministic recovery policy.

---

# Prototype execution

The recovery executor is currently simulated.

This allows the complete workflow to be demonstrated safely:

```text
Recommendation
      ↓
Policy
      ↓
Execution
      ↓
Recovery outcome
      ↓
Revenue measurement
```

The prototype does **not** claim that simulated recoveries represent real Razorpay production recovery.

A production integration would replace the executor with the appropriate Razorpay recovery/payment APIs while retaining the same decision, policy, and audit architecture.

---

# Technology

### Frontend

* React
* TypeScript
* Vite
* Lucide React

### Backend

* Node.js
* Express
* MongoDB
* Mongoose

### Machine Learning

* Python
* Scikit-learn
* Random Forest
* Joblib

---

# Architecture

```text
                    ┌─────────────────────┐
                    │    React Dashboard  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Express API     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Incident Engine   Revenue Intelligence   Batch Recovery
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Recovery Optimizer  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Python ML Model   │
                    │   Random Forest     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Policy Engine     │
                    │  Hard Safety Gates  │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                APPROVED                BLOCKED
                    │                     │
                    ▼                     ▼
               Executor              Audit Log
                    │
                    ▼
             Recovery Outcome
                    │
                    ▼
             Revenue Measurement
```

---

# Project structure

```text
ai-revenue-recovery/
│
├── backend/
│   ├── config/
│   │   └── db.js
│   │
│   ├── models/
│   │   ├── AuditLog.js
│   │   ├── Incident.js
│   │   ├── Merchant.js
│   │   ├── PaymentEvent.js
│   │   └── RecoveryAction.js
│   │
│   ├── routes/
│   │   └── incidentRoutes.js
│   │
│   ├── services/
│   │   ├── auditLogger.js
│   │   ├── batchRecovery.js
│   │   ├── incidentEngine.js
│   │   ├── merchantIntelligence.js
│   │   ├── recoveryExecutor.js
│   │   ├── recoveryOptimizer.js
│   │   ├── recoveryPolicy.js
│   │   ├── recoveryPredictor.js
│   │   ├── recoveryWorkflow.js
│   │   └── revenueAttribution.js
│   │
│   ├── server.js
│   ├── seed.js
│   ├── clearIncidents.js
│   └── benchmarkRecovery.js
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── style.css
│   └── package.json
│
├── ml/
│   ├── data/
│   │   ├── generate_training_data.py
│   │   └── recovery_training.csv
│   │
│   ├── models/
│   │   └── recovery_model.joblib
│   │
│   ├── predict.py
│   └── train_model.py
│
├── .gitignore
└── README.md
```

---

# Running locally

## 1. Clone

```bash
git clone https://github.com/harshit180704/ai-revenue-recovery.git
cd ai-revenue-recovery
```

## 2. Configure MongoDB

Create:

```text
backend/.env
```

Example:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
```

Do not commit the real `.env` file.

## 3. Install backend

```bash
cd backend
npm install
```

## 4. Start backend

```bash
npm start
```

## 5. Install frontend

Open another terminal:

```bash
cd frontend
npm install
```

## 6. Start frontend

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

---

# Recommended demo

The strongest demo sequence is:

```text
Dashboard
    ↓
Revenue at Risk
    ↓
Merchant Intelligence
    ↓
Select High-Risk Merchant
    ↓
View Failed Payments
    ↓
Select Payment
    ↓
Generate AI Recommendation
    ↓
Compare Recovery Actions
    ↓
Expected Recovery
    ↓
Policy Check
    ↓
APPROVED / BLOCKED
    ↓
Execute Recovery
    ↓
Recovery Outcome
    ↓
Run Batch Recovery
    ↓
Batch Summary
    ↓
Audit Trail
```

### Demo the safety gate

A particularly useful demonstration is to show both paths:

**Approved**

```text
AI Recommendation
      ↓
Recovery probability ≥ 60%
      ↓
Policy APPROVED
      ↓
Execute
```

**Blocked**

```text
AI Recommendation
      ↓
Recovery probability < 60%
      ↓
Policy BLOCKED
      ↓
No execution
      ↓
Reason recorded in audit trail
```

This demonstrates that the AI is not given unrestricted execution authority.

---

# Key design principle

The system is built around one principle:

> **AI recommends. Policy decides. Executor acts.**

The objective is not to retry every failed transaction.

The objective is to make **bounded, explainable, value-driven recovery decisions**, execute only approved interventions, and maintain a complete record of what happened.

---

# Prototype limitations

This repository is a hackathon prototype.

* Payment recovery execution is simulated.
* Training data is synthetic.
* Recovery probabilities are not calibrated against production Razorpay outcomes.
* Production deployment would require integration with real payment/recovery APIs and appropriate compliance controls.
* Benchmark simulation artifacts are retained in the repository but are not presented as real-world recovered revenue.

The architecture is designed so that the simulated components can be replaced with production integrations without changing the core decision/policy/audit flow.

---

# Built for

**Razorpay Buildathon 2026 — Track 3: AI Revenue Recovery**

**Core objective:**

> Detect revenue at risk → determine the right intervention → execute a bounded recovery workflow → measure the outcome → preserve an audit trail.



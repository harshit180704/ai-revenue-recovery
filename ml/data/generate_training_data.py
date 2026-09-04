import pandas as pd
import numpy as np
import os

np.random.seed(42)

ROWS = 20000

methods = ["upi", "card", "netbanking", "wallet"]

banks = [
    "HDFC",
    "SBI",
    "ICICI",
    "AXIS",
    "NONE"
]

failure_reasons = [
    "bank_timeout",
    "network_error",
    "authentication_failed",
    "insufficient_funds"
]

devices = [
    "android",
    "ios",
    "web"
]

actions = [
    "RETRY_NOW",
    "DELAYED_RETRY",
    "ALTERNATE_METHOD",
    "NO_ACTION"
]

rows = []

for _ in range(ROWS):

    amount = np.random.randint(100, 50000)

    method = np.random.choice(methods)

    if method == "upi":
        bank = np.random.choice(
            banks[:4]
        )
    else:
        bank = "NONE"

    device = np.random.choice(devices)

    failure_reason = np.random.choice(
        failure_reasons
    )

    previous_success_rate = np.random.uniform(
        0.2,
        1.0
    )

    previous_failures = np.random.randint(
        0,
        5
    )

    customer_age_days = np.random.randint(
        1,
        1000
    )

    action = np.random.choice(
        actions,
        p=[
            0.30,
            0.25,
            0.25,
            0.20
        ]
    )

    # ------------------------------------------------
    # Synthetic historical outcome
    # ------------------------------------------------

    probability = 0.45

    # Strong historical customer behavior
    probability += (
        previous_success_rate - 0.5
    ) * 0.45

    # Previous failures reduce probability
    probability -= (
        previous_failures * 0.07
    )

    # Customer maturity
    if customer_age_days > 180:
        probability += 0.08

    # Payment method effects
    if method == "upi":
        probability += 0.05

    elif method == "card":
        probability += 0.03

    elif method == "netbanking":
        probability -= 0.04

    # Failure reason effects
    if failure_reason == "network_error":
        probability += 0.08

    elif failure_reason == "bank_timeout":
        probability += 0.05

    elif failure_reason == "insufficient_funds":
        probability -= 0.18

    elif failure_reason == "authentication_failed":
        probability -= 0.12

    # Action effects
    if action == "RETRY_NOW":

        probability += 0.04

    elif action == "DELAYED_RETRY":

        probability += 0.10

    elif action == "ALTERNATE_METHOD":

        probability += 0.08

        if failure_reason in [
            "bank_timeout",
            "network_error"
        ]:
            probability += 0.08

    elif action == "NO_ACTION":

        probability -= 0.20

    # Large transactions are slightly harder
    if amount > 20000:
        probability -= 0.05

    probability = np.clip(
        probability,
        0.02,
        0.98
    )

    recovered = (
        np.random.random()
        < probability
    )

    rows.append({

        "amount": amount,

        "method": method,

        "bank": bank,

        "device": device,

        "failure_reason": failure_reason,

        "previous_success_rate":
            previous_success_rate,

        "previous_failures":
            previous_failures,

        "customer_age_days":
            customer_age_days,

        "action": action,

        "recovered":
            int(recovered)

    })


df = pd.DataFrame(rows)

output_dir = "ml/data"

os.makedirs(
    output_dir,
    exist_ok=True
)

output_file = (
    f"{output_dir}/recovery_training.csv"
)

df.to_csv(
    output_file,
    index=False
)

print(
    f"Generated {len(df)} historical recovery records."
)

print(
    f"Saved to {output_file}"
)

print(
    "\nRecovery distribution:"
)

print(
    df["recovered"].value_counts(
        normalize=True
    )
)
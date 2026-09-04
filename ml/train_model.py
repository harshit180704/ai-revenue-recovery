import pandas as pd
import numpy as np
import joblib
import os

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    precision_score,
    recall_score,
    roc_auc_score,
    accuracy_score
)


# ==========================================
# LOAD DATA
# ==========================================

DATA_PATH = "ml/data/recovery_training.csv"

df = pd.read_csv(DATA_PATH)

print(
    f"Loaded {len(df)} records."
)


# ==========================================
# FEATURES
# ==========================================

X = df.drop(
    columns=["recovered"]
)

y = df["recovered"]


categorical_features = [
    "method",
    "bank",
    "device",
    "failure_reason",
    "action"
]


numeric_features = [
    "amount",
    "previous_success_rate",
    "previous_failures",
    "customer_age_days"
]


# ==========================================
# PREPROCESSING
# ==========================================

preprocessor = ColumnTransformer(

    transformers=[

        (
            "categorical",

            OneHotEncoder(
                handle_unknown="ignore"
            ),

            categorical_features
        ),

        (
            "numeric",

            "passthrough",

            numeric_features
        )

    ]
)


# ==========================================
# MODEL
# ==========================================

model = RandomForestClassifier(

    n_estimators=200,

    max_depth=12,

    min_samples_leaf=5,

    random_state=42,

    n_jobs=-1
)


pipeline = Pipeline([

    (
        "preprocessor",
        preprocessor
    ),

    (
        "model",
        model
    )

])


# ==========================================
# TRAIN / TEST SPLIT
# ==========================================

X_train, X_test, y_train, y_test = \
    train_test_split(

        X,
        y,

        test_size=0.20,

        random_state=42,

        stratify=y

    )


print(
    f"Training records: {len(X_train)}"
)

print(
    f"Test records: {len(X_test)}"
)


# ==========================================
# TRAIN
# ==========================================

print(
    "\nTraining recovery model..."
)

pipeline.fit(
    X_train,
    y_train
)


# ==========================================
# EVALUATION
# ==========================================

predictions = pipeline.predict(
    X_test
)

probabilities = pipeline.predict_proba(
    X_test
)[:, 1]


accuracy = accuracy_score(
    y_test,
    predictions
)

precision = precision_score(
    y_test,
    predictions
)

recall = recall_score(
    y_test,
    predictions
)

auc = roc_auc_score(
    y_test,
    probabilities
)


print("\n========== MODEL EVALUATION ==========")

print(
    f"Accuracy : {accuracy:.4f}"
)

print(
    f"Precision: {precision:.4f}"
)

print(
    f"Recall   : {recall:.4f}"
)

print(
    f"ROC-AUC  : {auc:.4f}"
)

print(
    "======================================"
)


# ==========================================
# SAVE MODEL
# ==========================================

model_dir = "ml/models"

os.makedirs(
    model_dir,
    exist_ok=True
)

model_path = (
    f"{model_dir}/recovery_model.joblib"
)

joblib.dump(
    pipeline,
    model_path
)

print(
    f"\nModel saved to {model_path}"
)
import sys
import json
import joblib
import pandas as pd


MODEL_PATH = "ml/models/recovery_model.joblib"


def load_model():
    return joblib.load(MODEL_PATH)


def predict_recovery(model, data):

    df = pd.DataFrame([data])

    probability = model.predict_proba(df)[0][1]

    return {
        "recoveryProbability": round(
            float(probability),
            4
        )
    }


def predict_batch(model, data):

    df = pd.DataFrame(data)

    probabilities = model.predict_proba(df)[:, 1]

    return [
        {
            "recoveryProbability": round(
                float(probability),
                4
            )
        }
        for probability in probabilities
    ]


def main():

    try:

        input_data = sys.stdin.read()

        data = json.loads(input_data)

        # Load model ONCE
        model = load_model()

        # Single prediction
        if isinstance(data, dict):

            result = predict_recovery(
                model,
                data
            )

        # Batch prediction
        elif isinstance(data, list):

            result = predict_batch(
                model,
                data
            )

        else:

            raise ValueError(
                "Input must be a JSON object or array"
            )

        print(
            json.dumps(result)
        )

    except Exception as error:

        print(
            json.dumps({
                "error": str(error)
            })
        )

        sys.exit(1)


if __name__ == "__main__":
    main()
import sys
import json
import joblib
import pandas as pd


MODEL_PATH = "ml/models/recovery_model.joblib"


def predict_recovery(data):

    model = joblib.load(MODEL_PATH)

    # Convert input into a DataFrame
    df = pd.DataFrame([data])

    # Predict probability of recovery
    probability = model.predict_proba(df)[0][1]

    return {
        "recoveryProbability": round(
            float(probability),
            4
        )
    }


def main():

    try:

        # Read JSON from Node.js
        input_data = sys.stdin.read()

        data = json.loads(input_data)

        result = predict_recovery(data)

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
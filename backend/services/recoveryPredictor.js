const { spawn } = require("child_process");
const path = require("path");

function predictRecovery(paymentData) {

    return new Promise((resolve, reject) => {

        // Project root
        const projectRoot =
            path.join(__dirname, "..", "..");

        // Absolute path to predict.py
        const pythonScript =
            path.join(
                projectRoot,
                "ml",
                "predict.py"
            );

        console.log(
            "Running ML model:",
            pythonScript
        );

        const python =
            spawn("python", [
                pythonScript
            ], {
                cwd: projectRoot
            });


        let output = "";
        let errorOutput = "";


        // Send payment data to Python
        python.stdin.write(
            JSON.stringify(paymentData)
        );

        python.stdin.end();


        // Receive Python output
        python.stdout.on(
            "data",
            (data) => {

                output +=
                    data.toString();

            }
        );


        // Receive Python errors
        python.stderr.on(
            "data",
            (data) => {

                errorOutput +=
                    data.toString();

            }
        );


        // Python process finished
        python.on(
            "close",
            (code) => {

                if (code !== 0) {

                    return reject(
                        new Error(
                            errorOutput ||
                            `ML process exited with code ${code}`
                        )
                    );

                }


                try {

                    const result =
                        JSON.parse(
                            output.trim()
                        );


                    if (result.error) {

                        return reject(
                            new Error(
                                result.error
                            )
                        );

                    }


                    resolve(result);

                } catch (error) {

                    reject(
                        new Error(
                            `Invalid ML response: ${output}`
                        )
                    );

                }

            }
        );


        // Handle process errors
        python.on(
            "error",
            (error) => {

                reject(error);

            }
        );

    });

}


module.exports =
    predictRecovery;
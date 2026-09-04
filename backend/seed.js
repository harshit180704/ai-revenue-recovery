require("dotenv").config();

const connectDB = require("./config/db");

const generateData =
    require("./utils/seedData");

const createIncidents =
    require("./utils/incidentSimulator");

async function start() {

    try {

        await connectDB();

        await generateData();

        await createIncidents();

        console.log(
            "Database and incidents created successfully."
        );

        process.exit(0);

    } catch (error) {

        console.error(
            "Seeding failed:",
            error.message
        );

        process.exit(1);
    }
}

start();
require("dotenv").config();

const connectDB =
    require("./config/db");

const Incident =
    require("./models/Incident");

async function clear() {

    await connectDB();

    await Incident.deleteMany({});

    console.log(
        "All incidents cleared."
    );

    process.exit(0);
}

clear();
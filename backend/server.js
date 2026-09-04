const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const incidentRoutes =
    require("./routes/incidentRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use(
    "/api/incidents",
    incidentRoutes
);

connectDB();

app.get("/", (req, res) => {

    res.json({
        message: "Revenue Intelligence API is running"
    });

});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});
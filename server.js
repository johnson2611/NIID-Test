const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.NIID_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("NIID Database connection error:", err.message);
  } else {
    console.log("NIID Database connected successfully");
    release();
  }
});

app.post("/api/v2/vehicle/lookup", async (req, res) => {
  console.log("Request body:", req.body);

  const plateNumber =
    req.body?.plateNumber || req.body?.plateNo || req.body?.registration_number;
  const token = req.body?.token || req.body?.apiKey;

  if (!plateNumber) {
    console.log("Missing plateNumber in request");
    return res.status(400).json({
      status: "error",
      message: "Missing plateNumber in request body",
      code: "MISSING_FIELD",
      receivedBody: req.body,
    });
  }

  console.log(`NIID request received for: ${plateNumber}`);

  if (!token) {
    console.log("Missing API token");
    return res.status(401).json({
      status: "error",
      message: "Missing access token",
      code: "MISSING_TOKEN",
    });
  }

  if (token !== process.env.API_KEY) {
    console.log("Invalid API token");
    return res.status(401).json({
      status: "error",
      message: "Invalid access token",
      code: "AUTH_FAILED",
    });
  }

  try {
    const result = await pool.query(
      `SELECT registration_number, chassis_id, engine_id, manufacturer, 
              model, body_color, manufacture_year, status
       FROM niid_vehicles 
       WHERE registration_number = $1`,
      [plateNumber.toUpperCase()],
    );

    if (result.rows.length > 0) {
      const v = result.rows[0];
      console.log(`NIID found vehicle: ${plateNumber}`);

      res.json({
        status: "success",
        data: {
          registration: v.registration_number,
          chassis: v.chassis_id,
          engine: v.engine_id,
          make: v.manufacturer,
          model: v.model,
          color: v.body_color,
          year: v.manufacture_year,
          verificationStatus: v.status,
        },
        meta: {
          source: "NIID",
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] || null,
        },
      });
    } else {
      console.log(`NIID vehicle not found: ${plateNumber}`);
      res.status(404).json({
        status: "error",
        message: "Vehicle record not found in NIID database",
        code: "VEHICLE_NOT_FOUND",
      });
    }
  } catch (error) {
    console.error("NIID database error:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "NIID Service Running",
    timestamp: new Date().toISOString(),
    database: pool.options.database,
  });
});

app.listen(PORT, () => {
  console.log(`NIID Mock Service Running`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/api/v2/vehicle/lookup`);
  console.log(`Health: http://localhost:${PORT}/health\n`);
});

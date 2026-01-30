import express, { application } from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.route.js";
import fundRoutes from "./routes/fund.route.js";
import payeeRoutes from "./routes/payee.route.js";
import disbursementRoutes from "./routes/disbursement.route.js";
import logRoutes from "./routes/log.route.js";
import reportRoutes from "./routes/report.route.js";
import systemRoutes from "./routes/system.route.js";

import { app, server } from "./lib/socket.js";

dotenv.config();

//* PORT
const PORT = process.env.PORT;

//* CORS Configuration - Allow frontend to communicate with backend
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

//* APPLICATION STARTUP PROCESS
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

//* ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/fund", fundRoutes);
app.use("/api/payee", payeeRoutes);
app.use("/api/disbursement", disbursementRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/system", systemRoutes);

server.listen(PORT, () => {
  console.log("server is running on port: " + PORT);
});

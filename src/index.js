import express, { application } from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import path from "path";

import authRoutes from "./routes/auth.route.js";
import fundRoutes from "./routes/fund.route.js";
import payeeRoutes from "./routes/payee.route.js";
import disbursementRoutes from "./routes/disbursement.route.js";
import logRoutes from "./routes/log.route.js";
import reportRoutes from "./routes/report.route.js";
import systemRoutes from "./routes/system.route.js";
import ledgerRoutes from "./routes/ledger.route.js";
import notifRoutes from "./routes/notification.route.js";

import { app, server } from "./lib/socket.js";
import { initScheduler } from "./lib/scheduler.js";

dotenv.config();

//* PORT
const PORT = process.env.PORT;
const __dirname = path.resolve();

//* CORS Configuration - Allow frontend to communicate with backend
app.use(
  cors({
    origin: (origin, callback) => {
      // In development, restrict to known dev origins
      if (process.env.NODE_ENV !== "production") {
        const allowed = ["http://localhost:5173", "http://127.0.0.1:5173"];
        if (!origin || allowed.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      }
      // In production, nginx proxies /api/* so the browser request is
      // same-origin. Reflect whatever origin is sent (or allow no-origin
      // requests from same-origin / server-to-server calls).
      return callback(null, true);
    },
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
app.use("/api/ledger", ledgerRoutes);
app.use("/api/notif", notifRoutes);

//* Start Scheduler
initScheduler();

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../ecash-frontend/dist")));

  app.get("/{*splat}", (req, res) => {
    res.sendFile(
      path.join(__dirname, "../ecash-frontend", "dist", "index.html"),
    );
  });
}

server.listen(PORT, () => {
  console.log("server is running on port: " + PORT);
});

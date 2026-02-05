import express from "express";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";
import { getServerTime } from "../controllers/system.controller.js";

const router = express.Router();

router.get(
  "/getTime",
  protectRoute,
  authorize(["STAFF", "ADMIN", "USER"]),
  getServerTime,
);

export default router;

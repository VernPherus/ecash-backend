import express from "express";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";
import {
  getServerTime,
  runMonthlyMaintenance,
} from "../controllers/system.controller.js";

const router = express.Router();

router.get(
  "/getTime",
  protectRoute,
  authorize(["STAFF", "ADMIN", "USER"]),
  getServerTime,
);

router.get(
  "/maintenance",
  protectRoute,
  authorize(["ADMIN"]),   
  runMonthlyMaintenance,
);

export default router;

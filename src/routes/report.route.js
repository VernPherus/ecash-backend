import express from "express";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";
import {
  generateDebitReport,
  generateCheckReport,
} from "../controllers/report.controller.js";

const router = express.Router();

router.get(
  "/debit",
  protectRoute,
  authorize(["USER", "STAFF", "ADMIN"]),
  generateDebitReport,
);
router.get(
  "/check",
  protectRoute,
  authorize(["USER", "STAFF", "ADMIN"]),
  generateCheckReport,
);

export default router;

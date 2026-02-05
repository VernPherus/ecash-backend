import express from "express";
import {
  createLedger,
  updateLedger,
  disableLedger,
  getLedgers,
} from "../controllers/ledger.controller.js";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/create",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  createLedger,
);

router.put(
  "/update/:id",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  updateLedger,
);

router.put(
  "/disable/:id",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  disableLedger,
);

router.get("/get", protectRoute, authorize(["ADMIN", "STAFF"]), getLedgers);

export default router;

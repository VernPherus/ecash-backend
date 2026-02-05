import express from "express";
import {
  newPayee,
  listPayee,
  showPayee,
  editPayee,
  removePayee,
} from "../controllers/payee.controller.js";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * * PAYEE ROUTES
 */
router.post("/newPayee", protectRoute, authorize(["STAFF", "ADMIN"]), newPayee);

router.get(
  "/listPayee",
  protectRoute,
  authorize(["USER", "STAFF", "ADMIN"]),
  listPayee,
);
router.get(
  "/showPayee/:id",
  protectRoute,
  authorize(["STAFF", "ADMIN", "USER"]),
  showPayee,
);

router.put(
  "/editPayee/:id",
  protectRoute,
  authorize(["STAFF", "ADMIN"]),
  editPayee,
);
router.put(
  "/removePayee/:id",
  protectRoute,
  authorize(["STAFF", "ADMIN"]),
  removePayee,
);

export default router;

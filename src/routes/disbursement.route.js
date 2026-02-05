import express from "express";
import {
  storeRec,
  displayRec,
  showRec,
  editRec,
  approveRec,
  removeRec,
  generateLDDAPCode,
} from "../controllers/disbursement.controller.js";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * * DISBURSEMENT ROUTES
 */

/**
 * DISPLAY RECORDS SAMPLE
 * GET /api/disbursement/display?page=1&limit=10&search=acme&status=PENDING&startDate=2024-01-01
 */
router.get(
  "/display",
  protectRoute,
  authorize(["USER", "ADMIN", "STAFF"]),
  displayRec,
);

router.get(
  "/show/:id",
  protectRoute,
  authorize(["USER", "ADMIN", "STAFF"]),
  showRec,
);

router.get(
  "/genlddapcode",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  generateLDDAPCode,
);

router.post("/store", protectRoute, authorize(["ADMIN", "STAFF"]), storeRec);

router.put(
  "/editRec/:id",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  editRec,
);
router.put(
  "/approve/:id",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  approveRec,
);
router.put(
  "/delete/:id",
  protectRoute,
  authorize(["ADMIN", "STAFF"]),
  removeRec,
);

export default router;

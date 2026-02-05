import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../controllers/notification.controller.js";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/get",
  protectRoute,
  authorize(["USER", "STAFF", "ADMIN"]),
  getNotifications,
);

router.put(
  "/markRead/:id",
  protectRoute,
  authorize(["USER", "STAFF", "ADMIN"]),
  markAsRead,
);

router.put(
  "/markAll",
  protectRoute,
  authorize(["USER", "STAFF", "ADMIN"]),
  markAllAsRead,
);

export default router;

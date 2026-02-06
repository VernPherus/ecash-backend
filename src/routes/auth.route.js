import express from "express";
import {
  signup,
  login,
  logout,
  showUsers,
  editUser,
  grantAdmin,
  checkAuth,
  resetPassword,
  updateProfile,
  deactivateUser,
} from "../controllers/auth.controller.js";
import { protectRoute, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * * AUTHENTICATION ROUTES
 */

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.put("/resetPassword", resetPassword);

router.get("/check", protectRoute, checkAuth);

router.get("/showUsers", protectRoute, authorize(["ADMIN"]), showUsers);

router.put("/editUser/:id", protectRoute, authorize(["ADMIN"]), editUser);
router.put("/updateProfile", protectRoute, updateProfile);
router.put("/grantAdmin/:id", protectRoute, authorize(["ADMIN"]), grantAdmin);
router.put(
  "/deactivate/:id",
  protectRoute,
  authorize(["ADMIN"]),
  deactivateUser,
);

export default router;

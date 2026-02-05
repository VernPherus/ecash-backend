import { prisma } from "./prisma.js";
import { io } from "./socket.js";

/**
 * * NOTIFY USER: Send notification to a specific user
 */
export const notifyUser = async (
  userId,
  title,
  message,
  type = "INFO",
  link = null,
) => {
  try {
    const notif = await prisma.notification.create({
      data: {
        userId: Number(userId),
        title,
        message,
        type,
        link,
      },
    });

    // Real-time emit to specific user room (if rooms are set up) or broadcast update
    // Assuming frontend listens to "notification_received"
    io.emit(`notification_user_${userId}`, notif);

    return notif;
  } catch (error) {
    console.error("Failed to notify user:", error);
  }
};

/**
 * * BROADCAST NOTIFICATION: Send to ALL users (e.g., New Fund Created)
 */
export const broadcastNotification = async (
  title,
  message,
  type = "INFO",
  link = null,
) => {
  try {
    // 1. Get all active user IDs
    const users = await prisma.user.findMany({
      select: { id: true },
    });

    if (users.length === 0) return;

    // 2. Prepare data for bulk insert
    const notifications = users.map((user) => ({
      userId: user.id,
      title,
      message,
      type,
      link,
    }));

    // 3. Bulk Create
    await prisma.notification.createMany({
      data: notifications,
    });

    // 4. Emit global event
    io.emit("notification_broadcast", { title, message, type });
  } catch (error) {
    console.error("Failed to broadcast notification:", error);
  }
};

/**
 * * NOTIFY ROLES: Send to specific roles (e.g., Admins/Staff for Approvals)
 */
export const notifyRoles = async (
  roles = [],
  title,
  message,
  type = "INFO",
  link = null,
) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: roles } },
      select: { id: true },
    });

    if (users.length === 0) return;

    const notifications = users.map((user) => ({
      userId: user.id,
      title,
      message,
      type,
      link,
    }));

    await prisma.notification.createMany({
      data: notifications,
    });

    // Notify clients to refresh
    io.emit("notification_role_update", { roles });
  } catch (error) {
    console.error("Failed to notify roles:", error);
  }
};

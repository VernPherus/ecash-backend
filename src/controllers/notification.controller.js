import { prisma } from "../lib/prisma.js";
import { broadcastNotification, notifyRoles } from "../lib/notification.js";

/**
 * * GET NOTIFICATIONS: Fetch notifications for the logged-in user
 */
export const getNotifications = async (req, res) => {
  const userId = req.user.id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [total, notifications] = await prisma.$transaction([
      prisma.notification.count({ where: { userId } }),
      prisma.notification.findMany({
        where: { userId },
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.status(200).json({
      data: notifications,
      unreadCount,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * MARK AS READ: Mark a specific notification as read
 */
export const markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    await prisma.notification.updateMany({
      where: {
        id: Number(id),
        userId: userId, // Ensure ownership
      },
      data: { isRead: true },
    });

    res.status(200).json({ message: "Marked as read." });
  } catch (error) {
    console.error("Error marking notification:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * MARK ALL AS READ: Mark all user's notifications as read
 */
export const markAllAsRead = async (req, res) => {
  const userId = req.user.id;

  try {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.status(200).json({ message: "All notifications marked as read." });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * TRIGGER MONTHLY AUDIT NOTIFICATION
 * Can be called by Admin manually or via a cron job script.
 */
export const triggerMonthlyAuditNotif = async (req, res) => {
  try {
    const date = new Date();
    const month = date.toLocaleString("default", { month: "long" });
    const year = date.getFullYear();

    const title = `Monthly Audit Reminder: ${month} ${year}`;
    const message = `The monthly audit period for ${month} has begun. Please review all ledgers and disbursements.`;

    // Notify ALL staff and admins
    await notifyRoles(["ADMIN", "STAFF"], title, message, "WARNING");

    res.status(200).json({ message: "Monthly audit notifications sent." });
  } catch (error) {
    console.error("Error sending audit notifs:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

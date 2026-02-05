import { prisma } from "../lib/prisma.js";

/**
 * * GET SYSTEM LOGS: Display system logs for admin dashboard
 * @param {*} req
 * @param {*} res
 */
export const getSystemLogs = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const { search, startDate, endDate } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { log: { contains: search, mode: "insensitive" } },
        { user: { username: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else if (startDate) {
      where.createdAt = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      where.createdAt = {
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    const [total, logs] = await prisma.$transaction([
      prisma.logs.count({ where }),
      prisma.logs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { username: true, email: true, role: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    res.status(200).json({
      data: logs,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.log("Error in getSystemLogs controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

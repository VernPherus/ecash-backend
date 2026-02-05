import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../lib/utils.js";
import { Role } from "../lib/constants.js";
import { sentOtpEmail } from "../lib/mail.js";
import crypto from "crypto";

/**
 ** SIGNUP: Create a user and store into database
 * @param {object} req
 * @param {object} res
 */
export const signup = async (req, res) => {
  const { username, firstName, lastName, email, password } = req.body;

  try {
    //* Check for empty fields
    if (!username || !firstName || !lastName || !email) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be atleast 6 characters." });
    }

    //* Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    //* Password hashing
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    //* Database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create User
      const newUser = await tx.user.create({
        data: {
          username,
          firstName,
          lastName,
          email,
          password: hashedPassword,
        },
      });

      // Create log
      await tx.logs.create({
        data: {
          userId: newUser.id,
          log: `New user registration: ${username}`,
        },
      });

      return newUser;
    });

    if (result) {
      res.status(201).json({
        message: "New user created",
        username: result.username,
      });
    }
  } catch (error) {
    console.log("Error in signup controller: " + error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * UPDATE USER PROFILE: Allows for name update
 * TODO: Add update password capabilities
 * @param {*} req
 * @param {*} res
 */
export const updateProfile = async (req, res) => {
  const { id } = req.params;
  const { username, firstName, lastName } = req.body;

  try {
    // Validation
    const dataToUpdate = {};
    if (username) dataToUpdate.username = username;
    if (firstName) dataToUpdate.firstName = firstName;
    if (lastName) dataToUpdate.lastName = lastName;

    // Update user
    const updatedUser = await prisma.user.update({
      where: {
        id: id,
      },
      data: dataToUpdate,
    });

    // Return
    res
      .status(200)
      .json({ message: "Profile updated successfully", updatedUser });
  } catch (error) {
    console.log("Error in updateProfile controller: " + error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * LOGIN:
 * @param {*} req
 * @param {*} res
 */
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    //* Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    //* Check for password
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    generateToken(user.id, res);

    res.status(200).json({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.log("Error in login controller: " + error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * LOGOUT:
 * @param {*} req
 * @param {*} res
 */
export const logout = (req, res) => {
  try {
    const isDev = process.env.NODE_ENV !== "production";
    res.cookie("jwt", "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: isDev ? "lax" : "strict",
      secure: !isDev,
    });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in the logout controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * SHOW USERS: Displays all users
 * @param {*} req
 * @param {*} res
 */
export const showUsers = async (req, res) => {
  try {
    const allUsers = await prisma.user.findMany({ where: { isActive: true } });
    res.status(201).json({
      allUsers,
    });
  } catch (error) {
    console.log("Error in signup controller: " + error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * GRANT ADMIN: Updates user role to admin
 * @param {*} req
 * @param {*} res
 */
export const grantAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const promoteUser = await prisma.user.update({
      where: { id: id },
      data: {
        role: Role.ADMIN,
      },
    });

    res.status(200).json({
      message: "User has been granted admin privileges.",
      promoteUser,
    });
  } catch (error) {
    console.log("Error in grandAdmin controller: " + error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * CHECK AUTH: Checks if current user is authenticated
 * @param {*} req
 * @param {*} res
 */
export const checkAuth = async (req, res) => {
  try {
    // req.user is set by the protectRoute middleware
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.log("Error in checkAuth controller: " + error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * RESET PASSWORD: Send an otp through email and reset the user's password
 * @param {*} req
 * @param {*} res
 */
export const resetPassword = async (req, res) => {
  const { email, newPass, confPass, otp } = req.body;

  try {
    // Request OTP
    if (email && !otp && !newPass) {
      const user = await prisma.user.findUnique({ where: { email } });

      // Do not reveal if user exists
      if (!user) {
        return res
          .status(200)
          .json({ message: "If email exists, OTP has been sent." });
      }

      // Generate otp
      const generateOtp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Set to 10 minutes

      // Save to database:
      await prisma.oTP.create({
        data: {
          email,
          otp: generateOtp,
          expiresAt,
          isUsed: false,
        },
      });

      // Send email
      const emailSent = await sentOtpEmail(email, generateOtp);

      if (!emailSent) {
        return res.status(500).json({ message: "Error sending email service" });
      }

      return res.status(200).json({ messag: "OTP sent to your email." });
    }

    // validation
    if (!email || !newPass || !confPass || !otp) {
      return res.status(500).json({ message: "All fields required" });
    }

    if (newPass !== confPass) {
      return res
        .status(500)
        .json({ message: "New Password does not match password confirmation" });
    }

    // Confirm OTP
    const otpRecord = await prisma.oTP.findFirst({
      where: {
        email,
        otp,
        isUsed: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    if (new Date() > otpRecord.expiresAt) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one" });
    }

    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Update password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPass, salt);

    const updatedPassword = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
      },
    });

    // Return
    res
      .status(200)
      .json({ message: "Password update successful", updatedPassword });
  } catch (error) {
    console.log("Error in the resetPassword controller: " + error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * REMOVE USER
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const removeUser = async (req, res) => {
  const { id } = req.params;

  try {
    const userId = parseInt(id);

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const deactivatedUser = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        throw new Error("User not found");
      }

      if (existingUser.isActive === false) {
        throw new Error("User is already deactivated");
      }

      return await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
      });
    });

    return res.status(200).json({
      message: "User deactivated successfully",
      user: deactivatedUser,
    });
  } catch (error) {
    console.log("Error in removeUser controller: " + error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

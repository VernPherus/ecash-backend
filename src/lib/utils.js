import jwt from "jsonwebtoken";

export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  const isDev = process.env.NODE_ENV !== "production";
  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",  // lax works for HTTP; strict would also work but lax is safe
    secure: false,    // must be false for plain HTTP (no HTTPS on this deployment)
  });

  return token;
};

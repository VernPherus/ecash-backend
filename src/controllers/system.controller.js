import { getSystemTimeDetails } from "../lib/time.js";

export const getServerTime = async (req, res) => {
  try {
    const timeDetails = getSystemTimeDetails();
    res.status(200).json(timeDetails);
  } catch (error) {
    console.log("Error in getServerTime controller: " + error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

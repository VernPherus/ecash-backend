import {
  startOfMonth,
  startOfQuarter,
  startOfYear,
  getQuarter,
  isSameDay,
} from "date-fns";

/**
 * * CENTRALIZED TIME CONFIGURATION
 */
export const getSystemDate = () => {
  return new Date();
};

/**
 * GET SYSTEM TIME DETAILS
 * @returns 
 */
export const getSystemTimeDetails = () => {
  const now = getSystemDate();

  return {
    currentDate: now,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: getQuarter(now),
    timeStamp: now.getTime(),

    isStartOfMonth: now.getDate() === 1,
    isStartOfQuarter: isSameDay(now, startOfQuarter(now)),
    isStartofYear: isSameDay(now, startOfYear(now)),
  };
};

/**
 * 
 * @returns 
 */
export const getActiveResetTargets = () => {
  const { isStartOfMonth, isStartOfQuarter, isStartOfYear } =
    getSystemTimeDetails();

  const targets = [];

  // If it's the 1st of the month, MONTHLY funds reset
  if (isStartOfMonth) targets.push("MONTHLY");

  // If it's the 1st of Jan, Apr, Jul, Oct, QUARTERLY funds reset
  if (isStartOfQuarter) targets.push("QUARTERLY");

  // If it's Jan 1st, YEARLY funds reset
  if (isStartOfYear) targets.push("YEARLY");

  return targets;
};
/**
 * Convert a datetime-local string (browser timezone) to UTC ISO string for storage
 * @param datetimeLocal - String from datetime-local input (e.g., "2024-12-25T14:00")
 * @returns ISO string in UTC (e.g., "2024-12-25T19:00:00Z")
 */
export function datetimeLocalToUTC(datetimeLocal: string): string {
  // Create a date assuming the string is in UTC (this is what JavaScript does)
  const assumedUTC = new Date(datetimeLocal);
  
  // Get the browser's timezone offset in milliseconds
  const offset = new Date().getTimezoneOffset() * 60000;
  
  // Adjust: add the offset to convert from "assumed UTC" to actual UTC
  const actualUTC = new Date(assumedUTC.getTime() + offset);
  
  return actualUTC.toISOString();
}

/**
 * Convert a UTC Date to datetime-local string for display in datetime-local input
 * @param utcDate - Date object or ISO string in UTC
 * @returns datetime-local string (e.g., "2024-12-25T14:00")
 */
export function utcToDatetimeLocal(utcDate: Date | string): string {
  const date = new Date(utcDate);
  
  // Get the browser's timezone offset in milliseconds
  const offset = date.getTimezoneOffset() * 60000;
  
  // Subtract the offset to convert from UTC to local timezone
  const localDate = new Date(date.getTime() - offset);
  
  // Return in datetime-local format (YYYY-MM-DDTHH:mm)
  return localDate.toISOString().slice(0, 16);
}

/**
 * Format a UTC Date for display in calendar (24-hour format with local timezone)
 * @param utcDate - Date object or ISO string in UTC
 * @returns Formatted time string (e.g., "14:00")
 */
export function formatUTCToLocalTime(utcDate: Date | string): string {
  const date = new Date(utcDate);
  
  // Get the browser's timezone offset in milliseconds
  const offset = date.getTimezoneOffset() * 60000;
  
  // Convert to local timezone
  const localDate = new Date(date.getTime() - offset);
  
  // Extract hours and minutes
  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const minutes = String(localDate.getUTCMinutes()).padStart(2, "0");
  
  return `${hours}:${minutes}`;
}

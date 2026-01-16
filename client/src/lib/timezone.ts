/**
 * Convert a datetime-local string (browser timezone) to UTC ISO string for storage
 * @param datetimeLocal - String from datetime-local input (e.g., "2024-12-25T14:00")
 * @returns ISO string in UTC (e.g., "2024-12-25T13:00:00Z" for UTC+1 timezone)
 */
export function datetimeLocalToUTC(datetimeLocal: string): string {
  // JavaScript interprets datetime-local strings as LOCAL time (not UTC)
  const localDate = new Date(datetimeLocal);
  
  // getTimezoneOffset() returns minutes (negative for timezones ahead of UTC)
  // For UTC+1: returns -60 minutes = -3600000 ms
  // To convert local to UTC: subtract the offset
  const offsetMs = localDate.getTimezoneOffset() * 60000;
  const utcDate = new Date(localDate.getTime() - offsetMs);
  
  return utcDate.toISOString();
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

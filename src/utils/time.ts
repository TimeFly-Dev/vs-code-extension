/**
 * Formats seconds into a human-readable time representation
 * @param seconds - The number of seconds
 * @returns A formatted string like "5m" or "2h 30m"
 */
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/**
 * Checks if the day has changed
 * @param storedDate - The previously stored date string
 * @returns True if the day has changed, false otherwise
 */
export const hasDayChanged = (storedDate: string | undefined): boolean => {
  const today = new Date().toDateString();
  return storedDate !== today;
};

/**
 * Gets the current date as a string
 * @returns The current date as a string
 */
export const getCurrentDateString = (): string => new Date().toDateString();

/**
 * Calculates the elapsed time between two timestamps
 * @param start - The start timestamp
 * @param end - The end timestamp
 * @returns The elapsed time in milliseconds
 */
export const calculateElapsedTime = (start: number, end: number): number => Math.max(0, end - start);

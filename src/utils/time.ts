/**
 * Formats a time in seconds to a human-readable string
 * @param seconds - The time in seconds
 * @returns A formatted string (e.g., "1h 30m")
 */
export const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

/**
 * Calculates the elapsed time between two timestamps
 * @param start - The start timestamp
 * @param end - The end timestamp
 * @returns The elapsed time in milliseconds
 */
export const calculateElapsedTime = (start: number, end: number): number => {
  return Math.max(0, end - start)
}

/**
 * Checks if the day has changed since the stored date
 * @param storedDate - The stored date string (YYYY-MM-DD)
 * @returns True if the day has changed, false otherwise
 */
export const hasDayChanged = (storedDate?: string): boolean => {
  if (!storedDate) {
    return true
  }

  const currentDate = getCurrentDateString()
  return currentDate !== storedDate
}

/**
 * Gets the current date as a string (YYYY-MM-DD)
 * @returns The current date string
 */
export const getCurrentDateString = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

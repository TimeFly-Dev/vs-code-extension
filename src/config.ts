/**
 * Configuration for the TimeFly extension
 */
export const CONFIG = {
  // API endpoint for syncing pulses
  API_ENDPOINT: 'http://localhost:3000/sync',

  // Authentication settings
  AUTH: {
    // URL for the authentication page
    LOGIN_URL: 'https://www.timefly.dev/auth',

    // Local storage key for the access token
    TOKEN_KEY: 'timefly.accessToken',

    // Local storage key for the refresh token
    REFRESH_TOKEN_KEY: 'timefly.refreshToken',
  },

  // Sync settings
  SYNC: {
    // Interval between sync attempts in milliseconds (30 minutes)
    INTERVAL: 30 * 60 * 1000,

    // Maximum number of retry attempts
    MAX_RETRY_ATTEMPTS: 3,

    // Initial backoff time in milliseconds
    INITIAL_BACKOFF: 1000,
  },
}

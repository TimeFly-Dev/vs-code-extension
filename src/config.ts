/**
 * Configuration for the TimeFly extension
 */
export const CONFIG = {
  // API endpoint for syncing pulses (default, can be overridden in settings)
  BASE_URL: 'https://timefly-backend-vqmqhm-51360a-152-53-254-214.traefik.me',

  // API Key settings
  API_KEY: {
    // Local storage key for the API key
    KEY_STORAGE: 'timefly.apiKey',
  },

  // Sync settings
  SYNC: {
    // Interval between sync attempts in milliseconds (30 minutes)
    INTERVAL: 30 * 60 * 1000,

    // Maximum number of retry attempts
    MAX_RETRY_ATTEMPTS: 1,

    // Initial backoff time in milliseconds
    INITIAL_BACKOFF: 1000,
  },
}

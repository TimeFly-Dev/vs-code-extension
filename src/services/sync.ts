import type { Pulse, AggregatedPulse, StorageService } from '../types'
import { CONFIG } from '../config'
import * as vscode from 'vscode'
import { logger } from '../utils/logger'

// Define the response type
interface SyncResponse {
  success: boolean
  message: string
  syncedCount?: number
  errors?: string[]
}

/**
 * Gets the API key from VSCode global state
 * @returns A promise that resolves to the API key or null if not found
 */
const getApiKey = async (context: vscode.ExtensionContext): Promise<string | null> => {
  try {
    const apiKey = context.globalState.get(CONFIG.API_KEY.KEY_STORAGE) as string | undefined

    if (!apiKey) {
      logger.warn('No API key found in storage')
      return null
    }

    // Log the first few characters of the API key for debugging
    logger.info(`Retrieved API key from storage: ${apiKey.substring(0, 8)}...`)

    // Validate that it looks like an API key
    const apiKeyRegex = /^[0-9a-f]{32,}$/i
    if (!apiKeyRegex.test(apiKey)) {
      logger.warn(`Invalid API key format in storage: ${apiKey.substring(0, 8)}...`)
      return null
    }

    return apiKey
  } catch (error) {
    logger.error('Error getting API key:', error)
    return null
  }
}

/**
 * Shows API key notification to the user
 */
const showApiKeyNotification = () => {
  vscode.window.showWarningMessage('TimeFly needs an API key to sync your data.', 'Add API Key').then(selection => {
    if (selection === 'Add API Key') {
      vscode.commands.executeCommand('timefly.addApiKey')
    }
  })
}

/**
 * Syncs pulses and aggregated pulses to the backend
 * @param pulses - The pulses to sync
 * @param aggregatedPulses - The aggregated pulses to sync
 * @param context - The VSCode extension context
 * @returns A promise that resolves to true if sync was successful
 * @throws Error if sync fails
 */
const syncToBackend = async (
  pulses: ReadonlyArray<Pulse>,
  aggregatedPulses: ReadonlyArray<AggregatedPulse>,
  context: vscode.ExtensionContext,
): Promise<boolean> => {
  // Get the API endpoint from configuration or use the default
  const config = vscode.workspace.getConfiguration('timefly')
  const apiEndpoint = config.get<string>('apiEndpoint', CONFIG.API_ENDPOINT)

  // Get API key
  const apiKey = await getApiKey(context)

  if (!apiKey) {
    logger.warn('No valid API key found, showing notification')
    showApiKeyNotification()
    return false
  }

  try {
    logger.info(`Syncing to backend: ${apiEndpoint}`)
    logger.info(`Using API key: ${apiKey.substring(0, 8)}...`)
    logger.info(`Syncing ${pulses.length} pulses and ${aggregatedPulses.length} aggregated pulses`)

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        data: [...pulses, ...aggregatedPulses],
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })

    if (!response.ok) {
      let errorDetails = `Status: ${response.status} ${response.statusText}`

      try {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const errorJson = await response.json()
          errorDetails += `, Details: ${JSON.stringify(errorJson)}`
        } else {
          const text = await response.text()
          const preview = text.substring(0, 100) + (text.length > 100 ? '...' : '')
          errorDetails += `, Response: ${preview}`
        }
      } catch (parseError) {
        errorDetails += ', Could not parse response'
      }

      logger.error(`Sync failed: ${errorDetails}`)
      throw new Error(`Sync failed: ${errorDetails}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await response.text()
      const preview = text.substring(0, 100) + (text.length > 100 ? '...' : '')
      logger.error(`Expected JSON response but got: ${contentType}, Preview: ${preview}`)
      throw new Error(`Expected JSON response but got: ${contentType}, Preview: ${preview}`)
    }

    const result = (await response.json()) as SyncResponse

    if (!result.success) {
      logger.error(`API returned error: ${result.message}`)
      throw new Error(`API returned error: ${result.message}`)
    }

    logger.info(`Sync successful: ${result.message}`)
    return true
  } catch (error) {
    logger.error('Error during sync:', error)
    throw error
  }
}

/**
 * Performs synchronization of pending pulses and aggregated pulses
 * @param storageService - The storage service
 * @param context - The VSCode extension context
 * @returns A promise that resolves when sync is complete
 */
const performSync = (storageService: StorageService, context: vscode.ExtensionContext): Promise<void> => {
  const pendingPulses = storageService.getPendingPulses()
  const aggregatedPulses = storageService.getAggregatedPulses()

  if (pendingPulses.length === 0 && aggregatedPulses.length === 0) {
    logger.info('No pending pulses to sync')
    return Promise.resolve()
  }

  // Check if we have an API key before attempting to sync
  return getApiKey(context).then(apiKey => {
    if (!apiKey) {
      logger.warn('No valid API key found for sync')
      showApiKeyNotification()
      return storageService.updateSyncStatus({
        isOnline: false,
        apiStatus: 'error',
        lastSyncTime: Date.now(),
        nextSyncTime: Date.now() + CONFIG.SYNC.INTERVAL,
        pendingPulses: pendingPulses.length + aggregatedPulses.length,
      })
    }

    // We have an API key, proceed with sync
    const attemptSync = (retryCount: number): Promise<void> =>
      syncToBackend(pendingPulses, aggregatedPulses, context)
        .then(success => {
          if (success) {
            logger.info('Sync successful, clearing synced pulses')
            return Promise.all([
              storageService.clearSyncedPulses(pendingPulses),
              storageService.clearSyncedAggregatedPulses(aggregatedPulses),
            ]).then(() => {
              const now = Date.now()
              return storageService.updateSyncStatus({
                lastSyncTime: now,
                nextSyncTime: now + CONFIG.SYNC.INTERVAL,
                syncCount: (storageService.getSyncStatus().syncCount || 0) + 1,
                isOnline: true,
                apiStatus: 'ok',
                pendingPulses: 0,
              })
            })
          }

          logger.error('Sync failed without specific error')
          throw new Error('Sync failed without specific error')
        })
        .catch(error => {
          if (retryCount < CONFIG.SYNC.MAX_RETRY_ATTEMPTS) {
            const backoffTime = Math.pow(2, retryCount) * CONFIG.SYNC.INITIAL_BACKOFF
            logger.info(
              `Retrying sync in ${backoffTime}ms (attempt ${retryCount + 1} of ${CONFIG.SYNC.MAX_RETRY_ATTEMPTS})`,
            )
            return new Promise(resolve => setTimeout(() => resolve(attemptSync(retryCount + 1)), backoffTime))
          }

          // Propagate the error to the caller
          logger.error(`Max retry attempts (${CONFIG.SYNC.MAX_RETRY_ATTEMPTS}) reached, giving up`)
          throw error
        })

    return attemptSync(0).catch(error => {
      // Update sync status to reflect the failure
      logger.error('Sync failed after all retry attempts:', error)
      return storageService
        .updateSyncStatus({
          isOnline: false,
          apiStatus: 'error',
          lastSyncTime:
            storageService.getSyncStatus().lastSyncTime > 0 ? storageService.getSyncStatus().lastSyncTime : Date.now(),
          nextSyncTime: Date.now() + CONFIG.SYNC.INTERVAL,
          pendingPulses: pendingPulses.length + aggregatedPulses.length,
        })
        .then(() => {
          // Re-throw the error to be handled by the caller
          throw error
        })
    })
  })
}

/**
 * Creates a sync service for synchronizing pulses with the backend
 * @param storageService - The storage service
 * @param context - The VSCode extension context
 * @returns a sync service instance
 */
export const createSyncService = (storageService: StorageService, context: vscode.ExtensionContext) => {
  let syncInterval: NodeJS.Timeout | null = null
  let syncEnabled = true

  // Try to sync any pending pulses on startup
  const syncOnStartup = () => {
    const pendingPulses = storageService.getPendingPulses()
    const aggregatedPulses = storageService.getAggregatedPulses()

    if (pendingPulses.length > 0 || aggregatedPulses.length > 0) {
      logger.info('Pending pulses found on startup, attempting sync')
      return performSync(storageService, context).catch(error => {
        logger.error('Error during startup sync:', error)
      })
    }

    return Promise.resolve()
  }

  // Execute sync on startup
  syncOnStartup()

  return {
    syncPulses: () => {
      if (!syncEnabled) {
        logger.warn('Sync is disabled, skipping manual sync')
        vscode.window.showWarningMessage('TimeFly: Sync is currently disabled. Enable it in settings.')
        return Promise.reject(new Error('Sync is disabled'))
      }

      logger.info('Manual sync requested')
      return performSync(storageService, context)
    },

    scheduleSync: () => {
      if (syncInterval) {
        logger.info('Sync already scheduled, skipping')
        return
      }

      logger.info('Scheduling regular sync')
      // Don't wait for the first sync to complete
      performSync(storageService, context).catch(error => {
        logger.error('Error during initial scheduled sync:', error)
      })

      syncInterval = setInterval(() => {
        if (!syncEnabled) {
          logger.debug('Sync disabled, skipping scheduled sync')
          return
        }

        logger.info('Running scheduled sync')
        performSync(storageService, context).catch(error => {
          logger.error('Error during scheduled sync:', error)
        })
      }, CONFIG.SYNC.INTERVAL)
    },

    stopSync: () => {
      if (syncInterval) {
        logger.info('Stopping scheduled sync')
        clearInterval(syncInterval)
        syncInterval = null
      }

      // Only perform final sync if sync is enabled
      if (syncEnabled) {
        logger.info('Performing final sync before stopping')
        return performSync(storageService, context).catch(error => {
          logger.error('Error during final sync:', error)
        })
      }

      return Promise.resolve()
    },

    getSyncInfo: () => {
      const status = storageService.getSyncStatus()
      const pendingPulses = storageService.getPendingPulses().length
      const pendingAggregatedPulses = storageService.getAggregatedPulses().length

      // Ensure we never return invalid dates (0 timestamp)
      if (status.lastSyncTime <= 0) {
        status.lastSyncTime = 0
      }

      if (status.nextSyncTime <= 0) {
        status.nextSyncTime = Date.now() + CONFIG.SYNC.INTERVAL
      }

      // Update pending pulses count (include both types)
      status.pendingPulses = pendingPulses + pendingAggregatedPulses

      return {
        ...status,
        syncEnabled,
      }
    },

    enableSync: () => {
      syncEnabled = true
      logger.info('Sync enabled')
      vscode.window.showInformationMessage('TimeFly: Sync enabled')
    },

    disableSync: () => {
      syncEnabled = false
      logger.info('Sync disabled')
      vscode.window.showInformationMessage('TimeFly: Sync disabled')
    },

    isSyncEnabled: () => syncEnabled,
  }
}

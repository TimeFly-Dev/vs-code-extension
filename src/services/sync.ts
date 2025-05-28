import type { Pulse, AggregatedPulse, StorageService } from '../types'
import { CONFIG } from '../config'
import * as vscode from 'vscode'
import { logger } from '../utils/logger'

const IS_DEV = process.env.NODE_ENV === 'development' || process.env.VSCODE_DEBUG_MODE === 'true';

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
      if (IS_DEV) logger.warn('No API key found in storage')
      return null
    }

    // Log the first few characters of the API key for debugging
    if (IS_DEV) logger.info(`Retrieved API key from storage: ${apiKey.substring(0, 8)}...`)

    // Validate that it looks like an API key
    const apiKeyRegex = /^[0-9a-f]{32,}$/i
    if (!apiKeyRegex.test(apiKey)) {
      if (IS_DEV) logger.warn(`Invalid API key format in storage: ${apiKey.substring(0, 8)}...`)
      return null
    }

    return apiKey
  } catch (error) {
    if (IS_DEV) logger.error('Error getting API key:', error)
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
const MAX_BATCH_SIZE = 3000 // Maximum number of items per sync batch
const SYNC_TIMEOUT_MS = 30000 // 30 seconds timeout for each sync request

const syncBatch = async (
  batchData: ReadonlyArray<Pulse | AggregatedPulse>,
  apiEndpoint: string,
  apiKey: string,
): Promise<boolean> => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey || '',
      },
      body: JSON.stringify({
        data: batchData,
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

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

      if (IS_DEV) logger.error(`Sync batch failed: ${errorDetails}`)
      return false
    }

    const result = (await response.json()) as SyncResponse
    if (!result.success) {
      if (IS_DEV) logger.error(`API returned error: ${result.message}`)
      return false
    }

    return true
  } catch (error) {
    if (IS_DEV) logger.error('Error during sync batch:', error)
    return false
  }
}

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
    if (IS_DEV) logger.warn('No valid API key found, showing notification')
    showApiKeyNotification()
    return false
  }

  // Combine and sort items by time to ensure consistent batching
  const allItems = [...pulses, ...aggregatedPulses].sort((a, b) => 
    'time' in a && 'time' in b ? a.time - b.time : 
    'start_time' in a && 'start_time' in b ? a.start_time - b.start_time : 0
  )

  // Sync in batches
  let successfulSync = true
  for (let i = 0; i < allItems.length; i += MAX_BATCH_SIZE) {
    const batch = allItems.slice(i, i + MAX_BATCH_SIZE)
    
    if (IS_DEV) logger.info(`Syncing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}: ${batch.length} items`)
    
    const batchSuccess = await syncBatch(batch, apiEndpoint, apiKey || '')
    
    if (!batchSuccess) {
      successfulSync = false
      break
    }
  }

  return successfulSync
}

/**
 * Performs synchronization of pending pulses and aggregated pulses
 * @param storageService - The storage service
 * @param context - The VSCode extension context
 * @returns A promise that resolves when sync is complete
 */
let isSyncing = false;

const performSync = (storageService: StorageService, context: vscode.ExtensionContext): Promise<void> => {
  if (isSyncing) {
    if (IS_DEV) logger.info('Sync already in progress, skipping concurrent sync');
    return Promise.resolve();
  }
  isSyncing = true;
  // Check day change before syncing
  return storageService
    .saveTodayTotal(storageService.getTodayTotal())
    .then(() => {
      const pendingPulses = storageService.getPendingPulses();
      const aggregatedPulses = storageService.getAggregatedPulses();
      if (pendingPulses.length === 0 && aggregatedPulses.length === 0) {
        if (IS_DEV) logger.info('No pending pulses to sync');
        isSyncing = false;
        return Promise.resolve();
      }
      return getApiKey(context).then(apiKey => {
        if (!apiKey) {
          if (IS_DEV) logger.warn('No valid API key found for sync');
          showApiKeyNotification();
          isSyncing = false;
          return storageService.updateSyncStatus({
            isOnline: false,
            apiStatus: 'error',
            lastSyncTime: Date.now(),
            nextSyncTime: Date.now() + CONFIG.SYNC.INTERVAL,
            pendingPulses: pendingPulses.length + aggregatedPulses.length,
          });
        }
        const attemptSync = (retryCount: number): Promise<void> =>
          syncToBackend(pendingPulses, aggregatedPulses, context)
            .then(success => {
              if (success) {
                if (IS_DEV) logger.info('Sync successful, clearing synced pulses');
                return Promise.all([
                  storageService.clearSyncedPulses(pendingPulses),
                  storageService.clearSyncedAggregatedPulses(aggregatedPulses),
                ]).then(() => {
                  const now = Date.now();
                  return storageService.updateSyncStatus({
                    lastSyncTime: now,
                    nextSyncTime: now + CONFIG.SYNC.INTERVAL,
                    syncCount: (storageService.getSyncStatus().syncCount || 0) + 1,
                    isOnline: true,
                    apiStatus: 'ok',
                    pendingPulses: 0,
                  });
                });
              }
              if (IS_DEV) logger.error('Sync failed without specific error');
              throw new Error('Sync failed without specific error');
            })
            .catch(error => {
              if (retryCount < CONFIG.SYNC.MAX_RETRY_ATTEMPTS) {
                const backoffTime = Math.pow(2, retryCount) * CONFIG.SYNC.INITIAL_BACKOFF;
                if (IS_DEV) logger.info(
                  `Retrying sync in ${backoffTime}ms (attempt ${retryCount + 1} of ${CONFIG.SYNC.MAX_RETRY_ATTEMPTS})`,
                );
                return new Promise(resolve => setTimeout(() => resolve(attemptSync(retryCount + 1)), backoffTime));
              }
              if (IS_DEV) logger.error(`Max retry attempts (${CONFIG.SYNC.MAX_RETRY_ATTEMPTS}) reached, giving up`);
              throw error;
            });
        return attemptSync(0)
          .catch(error => {
            if (IS_DEV) logger.error('Sync failed after all retry attempts:', error);
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
                throw error;
              });
          })
          .finally(() => {
            isSyncing = false;
          });
      });
    })
    .catch(e => {
      isSyncing = false;
      throw e;
    });
};

/**
 * Creates a sync service for synchronizing pulses with the backend
 * @param storageService - The storage service
 * @param context - The VSCode extension context
 * @returns a sync service instance
 */
export const createSyncService = (storageService: StorageService, context: vscode.ExtensionContext) => {
  let syncInterval: NodeJS.Timeout | null = null

  // Try to sync any pending pulses on startup
  const syncOnStartup = () => {
    const pendingPulses = storageService.getPendingPulses()
    const aggregatedPulses = storageService.getAggregatedPulses()

    if (pendingPulses.length > 0 || aggregatedPulses.length > 0) {
      if (IS_DEV) logger.info('Pending pulses found on startup, attempting sync')
      return performSync(storageService, context).catch(error => {
        if (IS_DEV) logger.error('Error during startup sync:', error)
      })
    }

    return Promise.resolve()
  }

  // Execute sync on startup
  syncOnStartup()

  return {
    syncPulses: () => {
      if (IS_DEV) logger.info('Sync requested')
      return performSync(storageService, context)
    },

    scheduleSync: () => {
      if (syncInterval) {
        if (IS_DEV) logger.info('Sync already scheduled, skipping')
        return
      }

      if (IS_DEV) logger.info('Scheduling regular sync')
      // Don't wait for the first sync to complete
      performSync(storageService, context).catch(error => {
        if (IS_DEV) logger.error('Error during initial scheduled sync:', error)
      })

      syncInterval = setInterval(() => {
        if (IS_DEV) logger.info('Running scheduled sync')
        performSync(storageService, context).catch(error => {
          if (IS_DEV) logger.error('Error during scheduled sync:', error)
        })
      }, CONFIG.SYNC.INTERVAL)
    },

    stopSync: () => {
      if (syncInterval) {
        if (IS_DEV) logger.info('Stopping scheduled sync')
        clearInterval(syncInterval)
        syncInterval = null
      }

      if (IS_DEV) logger.info('Performing final sync before stopping')
      return performSync(storageService, context).catch(error => {
        if (IS_DEV) logger.error('Error during final sync:', error)
      })
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
      }
    },
  }
}

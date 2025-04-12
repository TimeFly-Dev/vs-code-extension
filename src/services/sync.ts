import type { Pulse, AggregatedPulse, StorageService } from '../types'
import { logger } from '../utils/logger'
import { CONFIG } from '../config'
import * as vscode from 'vscode'
import { getExtensionContext } from '../commands/auth'

// Create a module-specific logger
const syncLogger = logger.createChildLogger('Sync')

// Define the response type
interface SyncResponse {
  success: boolean
  message: string
  syncedCount?: number
  errors?: string[]
}

/**
 * Gets the authentication token from VSCode secrets
 * @returns A promise that resolves to the token or null if not found
 */
const getAuthToken = async (): Promise<string | null> => {
  try {
    // If not found in VSCode secrets, check if we have it in global state
    const context = getExtensionContext()
    if (context) {
      const token = context.globalState.get(CONFIG.AUTH.TOKEN_KEY) as string | undefined
      if (token) {
        syncLogger.debug('Found authentication token in global state')
        return token
      }
    }

    return null
  } catch (error) {
    syncLogger.error('Error getting auth token:', error)
    return null
  }
}

/**
 * Shows authentication notification to the user
 */
const showAuthNotification = () => {
  vscode.window.showWarningMessage('TimeFly needs authentication to sync your data.', 'Login').then(selection => {
    if (selection === 'Login') {
      vscode.env.openExternal(vscode.Uri.parse(CONFIG.AUTH.LOGIN_URL))
      // Also show the authentication panel
      vscode.commands.executeCommand('timefly.authenticate')
    }
  })
}

/**
 * Syncs pulses and aggregated pulses to the backend
 * @param pulses - The pulses to sync
 * @param aggregatedPulses - The aggregated pulses to sync
 * @returns A promise that resolves to true if sync was successful
 */
const syncToBackend = async (
  pulses: ReadonlyArray<Pulse>,
  aggregatedPulses: ReadonlyArray<AggregatedPulse>,
): Promise<boolean> => {
  syncLogger.debug(
    `Syncing ${pulses.length} pulses and ${aggregatedPulses.length} aggregated pulses to ${CONFIG.API_ENDPOINT}`,
  )

  // Get authentication token
  const token = await getAuthToken()

  if (!token) {
    syncLogger.warn('No authentication token found')
    showAuthNotification()
    return false
  }

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: [...pulses, ...aggregatedPulses], // Send both types of pulses
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
        end: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })

    if (!response.ok) {
      throw new Error(`Sync failed with status: ${response.status}`)
    }

    const result = (await response.json()) as SyncResponse
    syncLogger.info(`Successfully synced ${result.syncedCount || pulses.length + aggregatedPulses.length} items`)
    return true
  } catch (error) {
    syncLogger.error('Sync failed:', error)
    return false
  }
}

/**
 * Performs synchronization of pending pulses and aggregated pulses
 * @param storageService - The storage service
 * @returns A promise that resolves when sync is complete
 */
const performSync = (storageService: StorageService): Promise<void> => {
  const pendingPulses = storageService.getPendingPulses()
  const aggregatedPulses = storageService.getAggregatedPulses()

  if (pendingPulses.length === 0 && aggregatedPulses.length === 0) {
    syncLogger.debug('No pulses to sync')
    return Promise.resolve()
  }

  syncLogger.debug(`Attempting to sync ${pendingPulses.length} pulses and ${aggregatedPulses.length} aggregated pulses`)

  // Check if we have a token before attempting to sync
  return getAuthToken().then(token => {
    if (!token) {
      syncLogger.warn('No authentication token found, skipping sync')
      showAuthNotification()
      return storageService.updateSyncStatus({
        isOnline: false,
        apiStatus: 'error',
        lastSyncTime: Date.now(),
        nextSyncTime: Date.now() + CONFIG.SYNC.INTERVAL,
        pendingPulses: pendingPulses.length + aggregatedPulses.length,
      })
    }

    // We have a token, proceed with sync
    const attemptSync = (retryCount: number): Promise<void> =>
      syncToBackend(pendingPulses, aggregatedPulses).then(success => {
        if (success) {
          return Promise.all([
            storageService.clearSyncedPulses(pendingPulses),
            storageService.clearSyncedAggregatedPulses(aggregatedPulses),
          ]).then(() => {
            const now = Date.now()
            syncLogger.info(`Sync successful, next sync in ${CONFIG.SYNC.INTERVAL / 60000} minutes`)
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

        if (retryCount < CONFIG.SYNC.MAX_RETRY_ATTEMPTS) {
          const backoffTime = Math.pow(2, retryCount) * CONFIG.SYNC.INITIAL_BACKOFF
          syncLogger.warn(`Sync attempt ${retryCount + 1} failed, retrying in ${backoffTime / 1000}s`)
          return new Promise(resolve => setTimeout(() => resolve(attemptSync(retryCount + 1)), backoffTime))
        }

        syncLogger.error(`Sync failed after ${CONFIG.SYNC.MAX_RETRY_ATTEMPTS} attempts`)
        return storageService.updateSyncStatus({
          isOnline: false,
          apiStatus: 'error',
          // Keep the existing timestamps if they're valid, otherwise use current time
          lastSyncTime:
            storageService.getSyncStatus().lastSyncTime > 0 ? storageService.getSyncStatus().lastSyncTime : Date.now(),
          nextSyncTime: Date.now() + CONFIG.SYNC.INTERVAL,
          pendingPulses: pendingPulses.length + aggregatedPulses.length,
        })
      })

    return attemptSync(0)
  })
}

/**
 * Creates a sync service for synchronizing pulses with the backend
 * @param storageService - The storage service
 * @returns A sync service instance
 */
export const createSyncService = (storageService: StorageService) => {
  let syncInterval: NodeJS.Timeout | null = null

  // Try to sync any pending pulses on startup
  const syncOnStartup = () => {
    syncLogger.info('Checking for pending pulses on startup')
    const pendingPulses = storageService.getPendingPulses()
    const aggregatedPulses = storageService.getAggregatedPulses()

    if (pendingPulses.length > 0 || aggregatedPulses.length > 0) {
      syncLogger.info(
        `Found ${pendingPulses.length} pending pulses and ${aggregatedPulses.length} aggregated pulses from previous session, attempting to sync`,
      )
      return performSync(storageService)
    }

    return Promise.resolve()
  }

  // Execute sync on startup
  syncOnStartup()

  return {
    syncPulses: () => {
      syncLogger.debug('Manual sync triggered')
      return performSync(storageService)
    },

    scheduleSync: () => {
      if (syncInterval) {
        syncLogger.debug('Sync already scheduled, skipping')
        return
      }

      syncLogger.info(`Scheduling sync every ${CONFIG.SYNC.INTERVAL / 60000} minutes`)
      performSync(storageService)

      syncInterval = setInterval(() => {
        syncLogger.debug('Running scheduled sync')
        performSync(storageService)
      }, CONFIG.SYNC.INTERVAL)
    },

    stopSync: () => {
      if (syncInterval) {
        syncLogger.info('Stopping scheduled sync')
        clearInterval(syncInterval)
        syncInterval = null
      }

      // Perform one final sync before stopping
      syncLogger.info('Performing final sync before stopping')
      return performSync(storageService)
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

      return status
    },
  }
}

// Export the type
export type { SyncService } from '../types'

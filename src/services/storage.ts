import type * as vscode from 'vscode'
import type { Pulse, SyncStatus } from '../types'
import { hasDayChanged, getCurrentDateString } from '../utils/time'
import { updateObject } from '../utils/functional'
import { logger } from '../utils/logger'

const PENDING_PULSES_KEY = 'timefly.pendingPulses'
const TODAY_TOTAL_KEY = 'timefly.todayTotal'
const LAST_SYNC_KEY = 'timefly.lastSync'
const TODAY_DATE_KEY = 'timefly.todayDate'
const SYNC_STATUS_KEY = 'timefly.syncStatus'

// Create a module-specific logger
const storageLogger = logger.createChildLogger('Storage')

/**
 * Resets daily counters in storage
 * @param storage - The VSCode storage
 * @returns A promise that resolves when the update is complete
 */
const resetDailyCounters = (storage: vscode.Memento): Promise<void> => {
  storageLogger.debug('Resetting daily counters')
  return Promise.all([storage.update(TODAY_TOTAL_KEY, 0), storage.update(TODAY_DATE_KEY, getCurrentDateString())]).then(
    () => undefined,
  )
}

/**
 * Checks if the day has changed and resets counters if needed
 * @param storage - The VSCode storage
 * @returns A promise that resolves when the check is complete
 */
const checkDayChange = (storage: vscode.Memento): Promise<void> => {
  const storedDate = storage.get<string>(TODAY_DATE_KEY)
  const currentDate = getCurrentDateString()

  if (hasDayChanged(storedDate)) {
    storageLogger.info(`Day changed from ${storedDate || 'unknown'} to ${currentDate}`)
    return resetDailyCounters(storage)
  }

  return Promise.resolve()
}

/**
 * Creates a storage service for persisting pulse data
 * @param storage - The VSCode storage
 * @returns A storage service instance
 */
export const createStorageService = (storage: vscode.Memento) => {
  // Check day change on initialization
  checkDayChange(storage).catch(error =>
    storageLogger.error('Error checking day change during initialization', error),
  )

  return {
    savePulses: (pulses: ReadonlyArray<Pulse>): Promise<void> => {
      const existing = storage.get<Pulse[]>(PENDING_PULSES_KEY) || []
      storageLogger.debug(`Saving ${pulses.length} pulses, existing: ${existing.length}`)

      // Remove content field before saving to reduce storage size
      const pulsesToSave = pulses.map(pulse => {
        const { content, ...pulseWithoutContent } = pulse
        return pulseWithoutContent
      })

      return Promise.resolve(storage.update(PENDING_PULSES_KEY, [...existing, ...pulsesToSave]))
    },

    getPendingPulses: (): ReadonlyArray<Pulse> => {
      const pulses = storage.get<Pulse[]>(PENDING_PULSES_KEY) || []
      storageLogger.debug(`Retrieved ${pulses.length} pending pulses`)
      return pulses
    },

    clearSyncedPulses: (syncedPulses: ReadonlyArray<Pulse>): Promise<void> => {
      const pending = storage.get<Pulse[]>(PENDING_PULSES_KEY) || []
      const syncedIds = new Set(syncedPulses.map(p => p.time))
      const remaining = pending.filter(p => !syncedIds.has(p.time))
      storageLogger.debug(`Clearing ${syncedPulses.length} synced pulses, remaining: ${remaining.length}`)
      return Promise.resolve(storage.update(PENDING_PULSES_KEY, remaining))
    },

    saveTodayTotal: (total: number): Promise<void> => {
      storageLogger.debug(`Saving today's total: ${total}ms`)
      return checkDayChange(storage).then(() => Promise.resolve(storage.update(TODAY_TOTAL_KEY, total)))
    },

    getTodayTotal: (): number => {
      // Check day change but don't wait for the promise
      checkDayChange(storage).catch(error => storageLogger.error('Error checking day change', error))
      const total = storage.get<number>(TODAY_TOTAL_KEY) || 0
      storageLogger.debug(`Retrieved today's total: ${total}ms`)
      return total
    },

    getLastSyncTime: (): number => {
      const time = storage.get<number>(LAST_SYNC_KEY) || 0
      storageLogger.debug(`Retrieved last sync time: ${new Date(time).toISOString()}`)
      return time
    },

    setLastSyncTime: (time: number): Promise<void> => {
      storageLogger.debug(`Setting last sync time: ${new Date(time).toISOString()}`)
      return Promise.resolve(storage.update(LAST_SYNC_KEY, time))
    },

    getSyncStatus: (): SyncStatus => {
      const defaultStatus: SyncStatus = {
        lastSyncTime: 0,
        nextSyncTime: Date.now() + 30 * 60 * 1000, // Default to 30 minutes from now
        syncCount: 0,
        isOnline: true,
        apiStatus: 'unknown',
        pendingPulses: 0,
      }

      const status = storage.get<SyncStatus>(SYNC_STATUS_KEY) || defaultStatus
      
      // Ensure pendingPulses is initialized
      if (status.pendingPulses === undefined) {
        status.pendingPulses = 0
      }
      
      storageLogger.debug(`Retrieved sync status: ${JSON.stringify(status)}`)
      return status
    },

    updateSyncStatus: (status: Partial<SyncStatus>): Promise<void> => {
      const currentStatus = storage.get<SyncStatus>(SYNC_STATUS_KEY) || {
        lastSyncTime: 0,
        nextSyncTime: Date.now() + 30 * 60 * 1000,
        syncCount: 0,
        isOnline: true,
        apiStatus: 'unknown',
        pendingPulses: 0,
      }

      storageLogger.debug(`Updating sync status: ${JSON.stringify(status)}`)
      return Promise.resolve(storage.update(SYNC_STATUS_KEY, updateObject(currentStatus, status)))
    },
  }
}

// Export the type
export type { StorageService } from '../types'

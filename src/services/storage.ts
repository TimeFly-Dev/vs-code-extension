import type * as vscode from 'vscode'
import type { Pulse, SyncStatus, AggregatedPulse } from '../types'
import { hasDayChanged, getCurrentDateString } from '../utils/time'
import { updateObject } from '../utils/functional'

const PENDING_PULSES_KEY = 'timefly.pendingPulses'
const AGGREGATED_PULSES_KEY = 'timefly.aggregatedPulses'
const TODAY_TOTAL_KEY = 'timefly.todayTotal'
const LAST_SYNC_KEY = 'timefly.lastSync'
const TODAY_DATE_KEY = 'timefly.todayDate'
const SYNC_STATUS_KEY = 'timefly.syncStatus'
const LAST_UPDATE_KEY = 'timefly.lastUpdate'

const IS_DEV = process.env.NODE_ENV === 'development' || process.env.VSCODE_DEBUG_MODE === 'true';

/**
 * Resets daily counters in storage
 * @param storage - The VSCode storage
 * @returns A promise that resolves when the update is complete
 */
const resetDailyCounters = (storage: vscode.Memento): Promise<void> => {
  return Promise.all([
    storage.update(TODAY_TOTAL_KEY, 0),
    storage.update(TODAY_DATE_KEY, getCurrentDateString()),
    storage.update(LAST_UPDATE_KEY, Date.now()),
  ]).then(() => undefined)
}

/**
 * Checks if the day has changed and resets counters if needed
 * @param storage - The VSCode storage
 * @returns A promise that resolves when the check is complete
 */
const checkDayChange = (storage: vscode.Memento): Promise<void> => {
  const storedDate = storage.get<string>(TODAY_DATE_KEY)

  if (hasDayChanged(storedDate)) {
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
  checkDayChange(storage).catch(error => { if (IS_DEV) console.error('Error checking day change during initialization', error); });

  // Set up polling to check for updates from other instances
  let lastKnownUpdate = storage.get<number>(LAST_UPDATE_KEY) || 0

  // Poll for changes every 5 seconds
  const pollInterval = setInterval(() => {
    const currentUpdate = storage.get<number>(LAST_UPDATE_KEY) || 0

    // If another instance has updated the total time, refresh our local cache
    if (currentUpdate > lastKnownUpdate) {
      lastKnownUpdate = currentUpdate
    }
  }, 5000)

  return {
    savePulses: (pulses: ReadonlyArray<Pulse>): Promise<void> => {
      return checkDayChange(storage).then(() => {
        const existing = storage.get<Pulse[]>(PENDING_PULSES_KEY) || []

        // Remove content field before saving to reduce storage size
        const pulsesToSave = pulses.map(pulse => {
          const { content, ...pulseWithoutContent } = pulse
          return pulseWithoutContent
        })

        return storage.update(PENDING_PULSES_KEY, [...existing, ...pulsesToSave])
      })
    },

    getPendingPulses: (): ReadonlyArray<Pulse> => {
      const pulses = storage.get<Pulse[]>(PENDING_PULSES_KEY) || []
      return pulses
    },

    clearSyncedPulses: (syncedPulses: ReadonlyArray<Pulse>): Promise<void> => {
      const pending = storage.get<Pulse[]>(PENDING_PULSES_KEY) || []
      const syncedIds = new Set(syncedPulses.map(p => p.time))
      const remaining = pending.filter(p => !syncedIds.has(p.time))
      return Promise.resolve(storage.update(PENDING_PULSES_KEY, remaining))
    },

    saveAggregatedPulses: (pulses: ReadonlyArray<AggregatedPulse>): Promise<void> => {
      return checkDayChange(storage).then(() => {
        const existing = storage.get<AggregatedPulse[]>(AGGREGATED_PULSES_KEY) || []
        return storage.update(AGGREGATED_PULSES_KEY, [...existing, ...pulses])
      })
    },

    getAggregatedPulses: (): ReadonlyArray<AggregatedPulse> => {
      const pulses = storage.get<AggregatedPulse[]>(AGGREGATED_PULSES_KEY) || []
      return pulses
    },

    clearSyncedAggregatedPulses: (syncedPulses: ReadonlyArray<AggregatedPulse>): Promise<void> => {
      const pending = storage.get<AggregatedPulse[]>(AGGREGATED_PULSES_KEY) || []
      const syncedIds = new Set(syncedPulses.map(p => p.start_time))
      const remaining = pending.filter(p => !syncedIds.has(p.start_time))
      return Promise.resolve(storage.update(AGGREGATED_PULSES_KEY, remaining))
    },

    saveTodayTotal: (total: number): Promise<void> => {
      return checkDayChange(storage).then(() => {
        const currentTotal = storage.get<number>(TODAY_TOTAL_KEY) || 0

        // Only update if the new total is greater than the current total
        // This prevents race conditions between instances
        if (total > currentTotal) {
          // Update the last update timestamp to notify other instances
          const now = Date.now()
          lastKnownUpdate = now

          return Promise.all([storage.update(TODAY_TOTAL_KEY, total), storage.update(LAST_UPDATE_KEY, now)]).then(
            () => undefined,
          )
        }

        return Promise.resolve()
      })
    },

    getTodayTotal: (): number => {
      // Check day change but don't wait for the promise
      checkDayChange(storage).catch(error => { if (IS_DEV) console.error('Error checking day change', error); });

      // Always get the latest value from storage
      const total = storage.get<number>(TODAY_TOTAL_KEY) || 0
      return total
    },

    getLastSyncTime: (): number => {
      const time = storage.get<number>(LAST_SYNC_KEY) || 0
      return time
    },

    setLastSyncTime: (time: number): Promise<void> => {
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

      return Promise.resolve(storage.update(SYNC_STATUS_KEY, updateObject(currentStatus, status)))
    },

    dispose: (): void => {
      clearInterval(pollInterval)
    },
  }
}

// Export the type
export type { StorageService } from '../types'

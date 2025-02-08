import type { Heartbeat } from '../types'
import type { StorageService } from './storage'

const SYNC_INTERVAL = 30 * 60 * 1000 // 30 minutes
const MAX_RETRY_ATTEMPTS = 3

const syncToBackend = (heartbeats: Heartbeat[], apiEndpoint: string): Promise<boolean> =>
  fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(heartbeats),
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Sync failed with status: ${response.status}`)
      }
      return true
    })
    .catch(error => {
      console.error('Sync failed:', error)
      return false
    })

const performSync = (storageService: StorageService, apiEndpoint: string): Promise<void> =>
  Promise.resolve(storageService.getPendingHeartbeats()).then(pendingHeartbeats => {
    if (pendingHeartbeats.length === 0) {
      return Promise.resolve()
    }

    const attemptSync = (retryCount: number): Promise<void> =>
      syncToBackend(pendingHeartbeats, apiEndpoint).then(success => {
        if (success) {
          return storageService.clearSyncedHeartbeats(pendingHeartbeats).then(() => {
            const now = Date.now()
            return storageService.updateSyncStatus({
              lastSyncTime: now,
              nextSyncTime: now + SYNC_INTERVAL,
              syncCount: (storageService.getSyncStatus().syncCount || 0) + 1,
              isOnline: true,
              apiStatus: 'ok',
            })
          })
        }

        if (retryCount < MAX_RETRY_ATTEMPTS) {
          return new Promise(resolve =>
            setTimeout(() => resolve(attemptSync(retryCount + 1)), Math.pow(2, retryCount) * 1000),
          )
        }

        return storageService.updateSyncStatus({
          isOnline: false,
          apiStatus: 'error',
        })
      })

    return attemptSync(0)
  })

export const createSyncService = (storageService: StorageService, apiEndpoint: string) => {
  let syncInterval: NodeJS.Timeout | null = null

  return {
    syncHeartbeats: () => performSync(storageService, apiEndpoint),

    scheduleSync: () => {
      if (syncInterval) {
        return
      }

      performSync(storageService, apiEndpoint)

      syncInterval = setInterval(() => {
        performSync(storageService, apiEndpoint)
      }, SYNC_INTERVAL)
    },

    stopSync: () => {
      if (syncInterval) {
        clearInterval(syncInterval)
        syncInterval = null
      }
    },

    getSyncInfo: () => storageService.getSyncStatus(),
  }
}

export type SyncService = ReturnType<typeof createSyncService>


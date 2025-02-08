import type * as vscode from 'vscode'
import type { Heartbeat } from '../types'

const PENDING_HEARTBEATS_KEY = 'timefly.pendingHeartbeats'
const TODAY_TOTAL_KEY = 'timefly.todayTotal'
const LAST_SYNC_KEY = 'timefly.lastSync'
const TODAY_DATE_KEY = 'timefly.todayDate'
const SYNC_STATUS_KEY = 'timefly.syncStatus'

type SyncStatus = {
  lastSyncTime: number
  nextSyncTime: number
  syncCount: number
  isOnline: boolean
  apiStatus: 'ok' | 'error' | 'unknown'
}

const checkDayChange = (storage: vscode.Memento): boolean => {
  const today = new Date().toDateString()
  const storedDate = storage.get<string>(TODAY_DATE_KEY)

  if (storedDate !== today) {
    storage.update(TODAY_TOTAL_KEY, 0)
    storage.update(TODAY_DATE_KEY, today)
    return true
  }
  return false
}

export const createStorageService = (storage: vscode.Memento) => ({
  saveHeartbeats: (heartbeats: Heartbeat[]): Promise<void> => {
    const existing = storage.get<Heartbeat[]>(PENDING_HEARTBEATS_KEY) || []
    return Promise.resolve(storage.update(PENDING_HEARTBEATS_KEY, [...existing, ...heartbeats]))
  },

  getPendingHeartbeats: (): Heartbeat[] => storage.get<Heartbeat[]>(PENDING_HEARTBEATS_KEY) || [],

  clearSyncedHeartbeats: (syncedHeartbeats: Heartbeat[]): Promise<void> => {
    const pending = storage.get<Heartbeat[]>(PENDING_HEARTBEATS_KEY) || []
    const syncedIds = new Set(syncedHeartbeats.map(h => h.time))
    const remaining = pending.filter(h => !syncedIds.has(h.time))
    return Promise.resolve(storage.update(PENDING_HEARTBEATS_KEY, remaining))
  },

  saveTodayTotal: (total: number): Promise<void> => {
    checkDayChange(storage)
    return Promise.resolve(storage.update(TODAY_TOTAL_KEY, total))
  },

  getTodayTotal: (): number => {
    checkDayChange(storage)
    return storage.get<number>(TODAY_TOTAL_KEY) || 0
  },

  getLastSyncTime: (): number => storage.get<number>(LAST_SYNC_KEY) || 0,

  setLastSyncTime: (time: number): Promise<void> => Promise.resolve(storage.update(LAST_SYNC_KEY, time)),

  getSyncStatus: (): SyncStatus =>
    storage.get<SyncStatus>(SYNC_STATUS_KEY) || {
      lastSyncTime: 0,
      nextSyncTime: 0,
      syncCount: 0,
      isOnline: true,
      apiStatus: 'unknown',
    },

  updateSyncStatus: (status: Partial<SyncStatus>): Promise<void> => {
    const currentStatus = storage.get<SyncStatus>(SYNC_STATUS_KEY) || {
      lastSyncTime: 0,
      nextSyncTime: 0,
      syncCount: 0,
      isOnline: true,
      apiStatus: 'unknown',
    }
    return Promise.resolve(storage.update(SYNC_STATUS_KEY, { ...currentStatus, ...status }))
  },
})

export type StorageService = ReturnType<typeof createStorageService>


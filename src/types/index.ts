/**
 * Represents the current activity state of the user
 */
export type ActivityState = 'coding' | 'debugging'

/**
 * Type of entity being tracked
 */
export type EntityType = 'file' | 'app' | 'domain'

/**
 * Represents a single tracking pulse
 */
export interface Pulse {
  entity: string
  type: EntityType
  state: ActivityState
  time: number
  project?: string
  project_root_count: number
  branch?: string
  language?: string
  dependencies?: string
  machine_name_id: string
  line_additions?: number
  line_deletions?: number
  lines: number
  lineno?: number
  cursorpos?: number
  is_write: boolean
  content?: string
}

/**
 * Summary of pulses for reporting
 */
export interface PulseSummary {
  data: ReadonlyArray<Pulse | AggregatedPulse>
  start: string
  end: string
  timezone: string
}

/**
 * Represents an aggregated pulse for more efficient storage
 */
export interface AggregatedPulse {
  entity: string
  type: EntityType
  state: ActivityState
  start_time: number
  end_time: number
  project?: string
  branch?: string
  language?: string
  dependencies?: string
  machine_name_id: string
  line_additions: number
  line_deletions: number
  lines: number
  is_write: boolean
}

/**
 * Status of synchronization with backend
 */
export interface SyncStatus {
  lastSyncTime: number
  nextSyncTime: number
  syncCount: number
  isOnline: boolean
  apiStatus: 'ok' | 'error' | 'unknown'
  pendingPulses: number
}

/**
 * System information collected for each pulse
 */
export interface SystemInfo {
  machineId: string
  timezone: string
  dependencies: string
  branch: string
}

/**
 * Immutable context for pulse tracking
 */
export interface PulseContext {
  readonly pulses: ReadonlyArray<Pulse>
  readonly aggregatedPulses: ReadonlyArray<AggregatedPulse>
  readonly todayTotal: number
  readonly lastFileContent: string
  readonly lastActivityTime: number
  readonly lastAggregationTime: number
  readonly lastPulse?: Pulse
  readonly isActive: boolean
  readonly activeStartTime: number
}

/**
 * Activity information for debugging
 */
export interface ActivityInfo {
  lastActivityTime: number
  isActive: boolean
  idleThreshold: number
  activeStartTime: number
  activeEntity?: string
  activeState?: ActivityState
}

/**
 * Storage service interface
 */
export interface StorageService {
  savePulses: (pulses: ReadonlyArray<Pulse>) => Promise<void>
  getPendingPulses: () => ReadonlyArray<Pulse>
  clearSyncedPulses: (syncedPulses: ReadonlyArray<Pulse>) => Promise<void>
  saveAggregatedPulses: (pulses: ReadonlyArray<AggregatedPulse>) => Promise<void>
  getAggregatedPulses: () => ReadonlyArray<AggregatedPulse>
  clearSyncedAggregatedPulses: (syncedPulses: ReadonlyArray<AggregatedPulse>) => Promise<void>
  saveTodayTotal: (total: number) => Promise<void>
  getTodayTotal: () => number
  getLastSyncTime: () => number
  setLastSyncTime: (time: number) => Promise<void>
  getSyncStatus: () => SyncStatus
  updateSyncStatus: (status: Partial<SyncStatus>) => Promise<void>
  dispose: () => void
}

/**
 * Sync service interface
 */
export interface SyncService {
  syncPulses: () => Promise<void>
  scheduleSync: () => void
  stopSync: () => Promise<void>
  getSyncInfo: () => SyncStatus
}

/**
 * System service interface
 */
export interface SystemService {
  getSystemInfo: (filePath: string) => Promise<SystemInfo>
}

/**
 * Pulse service interface
 */
export interface PulseService {
  trackActivity: (editor: import('vscode').TextEditor | undefined, state: ActivityState) => Promise<void>
  getPulseSummary: () => PulseSummary
  getTodayTotal: () => string
  getSyncInfo: () => SyncStatus
  isActive: () => boolean
  getActivityInfo: () => ActivityInfo
  dispose: () => void
}

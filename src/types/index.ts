import type * as vscode from 'vscode'

export type ActivityCategory =
  | 'coding'
  | 'building'
  | 'indexing'
  | 'debugging'
  | 'browsing'
  | 'running tests'
  | 'writing tests'
  | 'manual testing'
  | 'writing docs'
  | 'code reviewing'
  | 'communicating'
  | 'researching'
  | 'learning'
  | 'designing'

export type EntityType = 'file' | 'app' | 'domain'

export interface Heartbeat {
  entity: string
  type: EntityType
  category: ActivityCategory
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
}

export interface HeartbeatSummary {
  data: (Heartbeat | AggregatedHeartbeat)[]
  start: string
  end: string
  timezone: string
}

export interface AggregatedHeartbeat {
  entity: string
  type: EntityType
  category: ActivityCategory
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

export interface HeartbeatStore {
  heartbeats: Heartbeat[]
  aggregatedHeartbeats: AggregatedHeartbeat[]
  todayTotal: number
  lastFileContent: string
  lastActivityTime: number
  lastAggregationTime: number
  lastHeartbeat?: Heartbeat
  isActive: boolean
  activeStartTime: number
}

export interface SystemService {
  getMachineId(): string
  getTimezone(): string
  getProjectDependencies(filePath: string): Promise<string>
  getGitBranch(filePath: string): Promise<string>
}

export interface HeartbeatService {
  trackActivity(editor: vscode.TextEditor | undefined, category: ActivityCategory): Promise<void>
  getHeartbeatSummary(): HeartbeatSummary
  getTodayTotal(): string
}

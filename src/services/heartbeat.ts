import * as vscode from 'vscode'
import * as path from 'path'
import type {
  Heartbeat,
  HeartbeatStore,
  HeartbeatSummary,
  ActivityCategory,
  AggregatedHeartbeat,
} from '../types'
import { systemService } from './system'
import { formatTime } from '../utils/time'
import type { StorageService } from './storage'
import type { SyncService } from './sync'

const IDLE_THRESHOLD = 120000 // 2 minutes in milliseconds
const AGGREGATION_INTERVAL = 30000 // 30 seconds

const calculateLineChanges = (oldContent: string, newContent: string) => {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  return {
    additions: Math.max(newLines.length - oldLines.length, 0),
    deletions: Math.max(oldLines.length - newLines.length, 0),
  }
}

const createHeartbeat = (
  editor: vscode.TextEditor,
  category: ActivityCategory,
  lastFileContent: string,
): Promise<Heartbeat> => {
  const document = editor.document
  const position = editor.selection.active
  const filePath = document.fileName
  const currentContent = document.getText()

  const lineChanges = calculateLineChanges(lastFileContent, currentContent)

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const projectRootCount = workspaceFolder 
    ? workspaceFolder.uri.fsPath.split(path.sep).length 
    : 0

  return Promise.all([
    systemService.getProjectDependencies(filePath),
    systemService.getGitBranch(filePath),
  ]).then(([dependencies, branch]) => ({
    entity: filePath,
    type: 'file',
    category,
    time: Date.now(),
    project: workspaceFolder?.name,
    project_root_count: projectRootCount,
    branch,
    language: document.languageId,
    dependencies,
    machine_name_id: systemService.getMachineId(),
    line_additions: lineChanges.additions,
    line_deletions: lineChanges.deletions,
    lines: document.lineCount,
    lineno: position.line + 1,
    cursorpos: position.character + 1,
    is_write: document.isDirty,
  }))
}

const updateStore = (store: HeartbeatStore, heartbeat: Heartbeat): HeartbeatStore => {
  const now = Date.now()
  const timeSinceLastActivity = now - store.lastActivityTime

  const isActive = timeSinceLastActivity <= IDLE_THRESHOLD
  const todayTotal = isActive
    ? store.todayTotal + timeSinceLastActivity
    : store.todayTotal

  return {
    ...store,
    heartbeats: [...store.heartbeats, heartbeat],
    todayTotal,
    lastActivityTime: now,
    isActive,
    activeStartTime: isActive ? (store.isActive ? store.activeStartTime : now) : 0,
    lastFileContent: heartbeat.entity === store.heartbeats[store.heartbeats.length - 1]?.entity
      ? store.lastFileContent
      : '',
    lastAggregationTime: now - store.lastAggregationTime >= AGGREGATION_INTERVAL
      ? now
      : store.lastAggregationTime,
  }
}

const aggregateHeartbeats = (store: HeartbeatStore): HeartbeatStore => {
  if (store.heartbeats.length === 0) {return store}

  const latestHeartbeat = store.heartbeats[store.heartbeats.length - 1]
  const firstHeartbeat = store.heartbeats[0]

  const aggregatedHeartbeat: AggregatedHeartbeat = {
    entity: latestHeartbeat.entity,
    type: latestHeartbeat.type,
    category: latestHeartbeat.category,
    start_time: firstHeartbeat.time,
    end_time: latestHeartbeat.time,
    project: latestHeartbeat.project,
    branch: latestHeartbeat.branch,
    language: latestHeartbeat.language,
    dependencies: latestHeartbeat.dependencies,
    machine_name_id: latestHeartbeat.machine_name_id,
    line_additions: store.heartbeats.reduce((sum, hb) => sum + (hb.line_additions || 0), 0),
    line_deletions: store.heartbeats.reduce((sum, hb) => sum + (hb.line_deletions || 0), 0),
    lines: latestHeartbeat.lines,
    is_write: latestHeartbeat.is_write,
  }

  return {
    ...store,
    aggregatedHeartbeats: [...store.aggregatedHeartbeats, aggregatedHeartbeat],
    heartbeats: [],
  }
}

export const createHeartbeatService = (storageService: StorageService, syncService: SyncService) => {
  const store: HeartbeatStore = {
    heartbeats: [],
    aggregatedHeartbeats: [],
    todayTotal: storageService.getTodayTotal(),
    lastFileContent: '',
    lastActivityTime: Date.now(),
    lastAggregationTime: Date.now(),
    isActive: false,
    activeStartTime: 0,
  }

  return {
    trackActivity: (editor: vscode.TextEditor | undefined, category: ActivityCategory): Promise<void> => {
      if (!editor) {return Promise.resolve()}

      return createHeartbeat(editor, category, store.lastFileContent)
        .then(heartbeat => {
          const updatedStore = updateStore(store, heartbeat)
          Object.assign(store, updatedStore)

          return storageService.saveHeartbeats([heartbeat])
            .then(() => storageService.saveTodayTotal(store.todayTotal))
        })
        .then(() => {
          if (store.lastAggregationTime !== store.lastActivityTime) {
            const aggregatedStore = aggregateHeartbeats(store)
            Object.assign(store, aggregatedStore)
          }
        })
    },

    getHeartbeatSummary: (): HeartbeatSummary => {
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)

      return {
        data: [...store.aggregatedHeartbeats, ...store.heartbeats],
        start: startOfDay.toISOString(),
        end: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    },

    getTodayTotal: (): string => {
      const total = store.isActive
        ? store.todayTotal + (Date.now() - store.lastActivityTime)
        : store.todayTotal

      return formatTime(Math.floor(total / 1000))
    },

    getSyncInfo: syncService.getSyncInfo,

    dispose: syncService.stopSync,
  }
}

export type HeartbeatService = ReturnType<typeof createHeartbeatService>

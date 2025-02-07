import * as vscode from 'vscode'
import * as path from 'path'
import {
  Heartbeat,
  HeartbeatStore,
  HeartbeatSummary,
  ActivityCategory,
  AggregatedHeartbeat,
  HeartbeatService,
  SystemService,
} from '../types'
import { systemService } from './system'
import { formatTime } from '../utils/time'

const IDLE_THRESHOLD = 120000 // 2 minutes in milliseconds
const AGGREGATION_INTERVAL = 30000 // 30 seconds

let store: HeartbeatStore = {
  heartbeats: [],
  aggregatedHeartbeats: [],
  todayTotal: 0,
  lastFileContent: '',
  lastActivityTime: Date.now(),
  lastAggregationTime: Date.now(),
  isActive: false,
  activeStartTime: 0,
}

const calculateLineChanges = (oldContent: string, newContent: string) => {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  return {
    additions: Math.max(newLines.length - oldLines.length, 0),
    deletions: Math.max(oldLines.length - newLines.length, 0),
  }
}

const createHeartbeat = async (
  editor: vscode.TextEditor,
  category: ActivityCategory,
  systemService: SystemService,
): Promise<Heartbeat> => {
  const document = editor.document
  const position = editor.selection.active
  const filePath = document.fileName
  const currentContent = document.getText()

  const lineChanges = calculateLineChanges(store.lastFileContent || '', currentContent)

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const projectRootCount = workspaceFolder 
    ? workspaceFolder.uri.fsPath.split(path.sep).length 
    : 0

  const [dependencies, branch] = await Promise.all([
    systemService.getProjectDependencies(filePath),
    systemService.getGitBranch(filePath),
  ])

  store.lastFileContent = currentContent

  return {
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
  }
}

const updateStore = (newHeartbeat: Heartbeat) => {
  const now = Date.now()
  const timeSinceLastActivity = now - store.lastActivityTime

  if (timeSinceLastActivity <= IDLE_THRESHOLD) {
    if (!store.isActive) {
      store.isActive = true
      store.activeStartTime = now
    }
    // Update todayTotal continuously
    store.todayTotal += timeSinceLastActivity
  } else {
    if (store.isActive) {
      store.isActive = false
    }
  }

  store.lastActivityTime = now
  store.heartbeats.push(newHeartbeat)

  if (now - store.lastAggregationTime >= AGGREGATION_INTERVAL) {
    aggregateHeartbeats()
    store.lastAggregationTime = now
  }
}

const aggregateHeartbeats = () => {
  if (store.heartbeats.length === 0) {return}

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

  store.aggregatedHeartbeats.push(aggregatedHeartbeat)
  store.heartbeats = []
}

const trackActivity = async (editor: vscode.TextEditor | undefined, category: ActivityCategory) => {
  if (!editor) {
    return
  }

  const heartbeat = await createHeartbeat(editor, category, systemService)
  updateStore(heartbeat)
}

const getHeartbeatSummary = (): HeartbeatSummary => {
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  return {
    data: [...store.aggregatedHeartbeats, ...store.heartbeats],
    start: startOfDay.toISOString(),
    end: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

const getTodayTotal = (): string => {
  let total = store.todayTotal

  // If currently active, add the time since last activity
  if (store.isActive) {
    total += Date.now() - store.lastActivityTime
  }

  return formatTime(Math.floor(total / 1000)) // Convert milliseconds to seconds
}

export const heartbeatService: HeartbeatService = {
  trackActivity,
  getHeartbeatSummary,
  getTodayTotal,
}

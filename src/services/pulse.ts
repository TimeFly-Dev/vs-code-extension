import * as vscode from 'vscode'
import * as path from 'path'
import type { Pulse, PulseContext, PulseSummary, ActivityState, AggregatedPulse, ActivityInfo } from '../types'
import type { StorageService } from '../types'
import type { SyncService } from '../types'
import type { SystemService } from '../types'
import { formatTime, calculateElapsedTime } from '../utils/time'
import { updateObject, appendToArray, pipe, when } from '../utils/functional'
import { logger } from '../utils/logger'

const IDLE_THRESHOLD = 120000 // 2 minutes in milliseconds
const AGGREGATION_INTERVAL = 30000 // 30 seconds
const STORAGE_SYNC_INTERVAL = 10000 // 10 seconds - how often to check global storage

/**
 * Calculates line changes between two content strings
 * @param oldContent - The old content
 * @param newContent - The new content
 * @returns An object with additions and deletions
 */
const calculateLineChanges = (oldContent: string, newContent: string) => {
  if (!oldContent || oldContent === newContent) {
    return { additions: 0, deletions: 0 }
  }

  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // Simple line count difference
  const lineDiff = newLines.length - oldLines.length

  if (lineDiff > 0) {
    return { additions: lineDiff, deletions: 0 }
  } else if (lineDiff < 0) {
    return { additions: 0, deletions: Math.abs(lineDiff) }
  }

  // If line count is the same but content is different, do a more detailed analysis
  // Count changed lines
  let additions = 0
  let deletions = 0

  // Use a simple LCS (Longest Common Subsequence) approach
  const oldLineSet = new Set(oldLines)
  const newLineSet = new Set(newLines)

  // Lines in new but not in old
  for (const line of newLines) {
    if (!oldLineSet.has(line)) {
      additions++
    }
  }

  // Lines in old but not in new
  for (const line of oldLines) {
    if (!newLineSet.has(line)) {
      deletions++
    }
  }

  // If we detected changes but they cancel out, ensure we report at least one change
  if (additions === deletions && additions > 0) {
    return { additions: 1, deletions: 1 }
  }

  return { additions, deletions }
}

/**
 * Creates a pulse from editor state
 * @param editor - The VSCode text editor
 * @param state - The activity state
 * @param lastFileContent - The last file content
 * @param systemService - The system service
 * @returns A promise that resolves to a pulse
 */
const createPulse = async (
  editor: vscode.TextEditor,
  state: ActivityState,
  lastFileContent: string,
  systemService: SystemService,
): Promise<Pulse> => {
  const document = editor.document
  const position = editor.selection.active
  const filePath = document.fileName
  const currentContent = document.getText()

  // Only calculate line changes if we have previous content for this file
  const lineChanges =
    lastFileContent && filePath === document.fileName
      ? calculateLineChanges(lastFileContent, currentContent)
      : { additions: 0, deletions: 0 }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const projectRootCount = workspaceFolder ? workspaceFolder.uri.fsPath.split(path.sep).length : 0

  const systemInfo = await systemService.getSystemInfo(filePath)

  return {
    entity: filePath,
    type: 'file',
    state,
    time: Date.now(),
    project: workspaceFolder?.name,
    project_root_count: projectRootCount,
    branch: systemInfo.branch,
    language: document.languageId,
    dependencies: systemInfo.dependencies,
    machine_name_id: systemInfo.machineId,
    line_additions: lineChanges.additions,
    line_deletions: lineChanges.deletions,
    lines: document.lineCount,
    lineno: position.line + 1,
    cursorpos: position.character + 1,
    is_write: document.isDirty,
    content: currentContent, // Add the content to the pulse
  }
}

/**
 * Updates the pulse context with a new pulse
 * @param context - The current pulse context
 * @param pulse - The new pulse
 * @returns An updated pulse context
 */
const updateContext = (context: PulseContext, pulse: Pulse): PulseContext => {
  const now = Date.now()
  const timeSinceLastActivity = calculateElapsedTime(context.lastActivityTime, now)
  const isActive = timeSinceLastActivity <= IDLE_THRESHOLD

  // Only add to today's total if we're active and within the idle threshold
  const todayTotal = isActive ? context.todayTotal + timeSinceLastActivity : context.todayTotal

  const shouldAggregate = now - context.lastAggregationTime >= AGGREGATION_INTERVAL

  // Store the current file content for the next comparison
  const lastFileContent =
    pulse.entity === context.lastPulse?.entity ? pulse.content || context.lastFileContent : pulse.content || ''

  return updateObject(context, {
    pulses: appendToArray(context.pulses, pulse),
    todayTotal,
    lastActivityTime: now,
    isActive,
    activeStartTime: isActive ? (context.isActive ? context.activeStartTime : now) : 0,
    lastFileContent,
    lastAggregationTime: shouldAggregate ? now : context.lastAggregationTime,
    lastPulse: pulse,
  })
}

/**
 * Aggregates pulses into a single aggregated pulse
 * @param context - The pulse context
 * @returns An updated pulse context with aggregated pulses
 */
const aggregatePulses = (context: PulseContext): PulseContext => {
  if (context.pulses.length === 0) {
    return context
  }

  const latestPulse = context.pulses[context.pulses.length - 1]
  const firstPulse = context.pulses[0]

  const aggregatedPulse: AggregatedPulse = {
    entity: latestPulse.entity,
    type: latestPulse.type,
    state: latestPulse.state,
    start_time: firstPulse.time,
    end_time: latestPulse.time,
    project: latestPulse.project,
    branch: latestPulse.branch,
    language: latestPulse.language,
    dependencies: latestPulse.dependencies,
    machine_name_id: latestPulse.machine_name_id,
    line_additions: context.pulses.reduce((sum, p) => sum + (p.line_additions || 0), 0),
    line_deletions: context.pulses.reduce((sum, p) => sum + (p.line_deletions || 0), 0),
    lines: latestPulse.lines,
    is_write: latestPulse.is_write,
  }

  return updateObject(context, {
    aggregatedPulses: appendToArray(context.aggregatedPulses, aggregatedPulse),
    pulses: [] as ReadonlyArray<Pulse>,
  })
}

/**
 * Checks if pulses should be aggregated
 * @param context - The pulse context
 * @returns True if pulses should be aggregated
 */
const shouldAggregate = (context: PulseContext): boolean => context.lastAggregationTime !== context.lastActivityTime

/**
 * Creates a pulse service for tracking coding activity
 * @param storageService - The storage service
 * @param syncService - The sync service
 * @param systemService - The system service
 * @returns A pulse service instance
 */
export const createPulseService = (
  storageService: StorageService,
  syncService: SyncService,
  systemService: SystemService,
) => {
  // Initialize context with values from storage
  let currentContext: PulseContext = {
    pulses: [],
    aggregatedPulses: [],
    todayTotal: storageService.getTodayTotal(),
    lastFileContent: '',
    lastActivityTime: Date.now(),
    lastAggregationTime: Date.now(),
    isActive: false,
    activeStartTime: 0,
  }

  let storageCheckInterval: NodeJS.Timeout | null = null;
  let isPaused = false;
  let lastActiveTime = Date.now();
  const INACTIVITY_LIMIT = 60 * 60 * 1000; // 1 hora

  function startStorageCheck() {
    if (storageCheckInterval) return;
    storageCheckInterval = setInterval(() => {
      const storedTotal = storageService.getTodayTotal();
      if (storedTotal > currentContext.todayTotal) {
        currentContext = updateObject(currentContext, {
          todayTotal: storedTotal,
        });
      }
    }, STORAGE_SYNC_INTERVAL);
  }

  function stopStorageCheck() {
    if (storageCheckInterval) {
      clearInterval(storageCheckInterval);
      storageCheckInterval = null;
    }
  }

  // Arranca el timer al inicio
  startStorageCheck();

  // Monitoriza actividad para pausar/reanudar el timer
  function handleActivity() {
    lastActiveTime = Date.now();
    if (isPaused) {
      startStorageCheck();
      isPaused = false;
    }
  }

  // Hook en trackActivity para detectar actividad
  const originalTrackActivity = async (editor: vscode.TextEditor | undefined, state: ActivityState): Promise<void> => {
    handleActivity();
    if (!editor) {
      return Promise.resolve();
    }
    try {
      const pulse = await createPulse(editor, state, currentContext.lastFileContent, systemService);
      currentContext = pipe(
        currentContext,
        ctx => updateContext(ctx, pulse),
        when(shouldAggregate, aggregatePulses),
      );
      await storageService.savePulses([pulse]);
      if (currentContext.aggregatedPulses.length > 0) {
        await storageService.saveAggregatedPulses(currentContext.aggregatedPulses);
        currentContext = updateObject(currentContext, {
          aggregatedPulses: [] as ReadonlyArray<AggregatedPulse>,
        });
      }
      await storageService.saveTodayTotal(currentContext.todayTotal);
      return Promise.resolve();
    } catch (error) {
      logger.error('Error tracking activity', error);
      return Promise.reject(error);
    }
  };

  // Reemplaza el método por el nuevo
  const pulseService = {
    trackActivity: originalTrackActivity,

    /**
     * Gets a summary of pulses
     * @returns A pulse summary
     */
    getPulseSummary: (): PulseSummary => {
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)

      // Combine aggregated pulses and current pulses
      const allPulses = [...currentContext.aggregatedPulses, ...currentContext.pulses]

      // Also include pulses from storage to ensure consistency
      const storedPulses = storageService.getPendingPulses()
      const storedAggregatedPulses = storageService.getAggregatedPulses()

      // Create a set of pulse times we already have to avoid duplicates
      const existingPulseTimes = new Set(allPulses.map(p => ('time' in p ? p.time : p.start_time)))

      // Add stored pulses that aren't already in our list
      const uniqueStoredPulses = storedPulses.filter(p => !existingPulseTimes.has(p.time))

      // Add stored aggregated pulses
      const uniqueStoredAggregatedPulses = storedAggregatedPulses.filter(p => !existingPulseTimes.has(p.start_time))

      // Combine all pulses
      const combinedPulses = [...allPulses, ...uniqueStoredPulses, ...uniqueStoredAggregatedPulses]

      return {
        data: combinedPulses,
        start: startOfDay.toISOString(),
        end: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    },

    /**
     * Gets the total time spent today
     * @returns A formatted string of total time
     */
    getTodayTotal: (): string => {
      // First, check if there's a newer value in storage
      const storedTotal = storageService.getTodayTotal()
      if (storedTotal > currentContext.todayTotal) {
        currentContext = updateObject(currentContext, {
          todayTotal: storedTotal,
        })
      }

      // Only add the time elapsed since the last activity if the user is active
      // If the user is inactive, simply return the accumulated total
      const now = Date.now()
      const timeSinceLastActivity = now - currentContext.lastActivityTime
      const isCurrentlyActive = currentContext.isActive && timeSinceLastActivity <= IDLE_THRESHOLD

      const total = isCurrentlyActive
        ? currentContext.todayTotal + calculateElapsedTime(currentContext.lastActivityTime, now)
        : currentContext.todayTotal

      return formatTime(Math.floor(total / 1000))
    },

    /**
     * Checks if the user is currently active
     * @returns True if the user is active, false otherwise
     */
    isActive: (): boolean => {
      const now = Date.now()
      const timeSinceLastActivity = now - currentContext.lastActivityTime
      return currentContext.isActive && timeSinceLastActivity <= IDLE_THRESHOLD
    },

    /**
     * Gets detailed activity information for debugging
     * @returns Activity information
     */
    getActivityInfo: (): ActivityInfo => {
      return {
        lastActivityTime: currentContext.lastActivityTime,
        isActive: currentContext.isActive && Date.now() - currentContext.lastActivityTime <= IDLE_THRESHOLD,
        idleThreshold: IDLE_THRESHOLD,
        activeStartTime: currentContext.activeStartTime,
        activeEntity: currentContext.lastPulse?.entity,
        activeState: currentContext.lastPulse?.state,
      }
    },

    getSyncInfo: syncService.getSyncInfo,
    storageService,
    dispose: (): void => {
      stopStorageCheck();
      clearInterval(inactivityInterval);
      syncService.stopSync();
    },
  }

  // Timer para pausar el storageCheckInterval si hay inactividad
  const inactivityInterval = setInterval(() => {
    if (Date.now() - lastActiveTime > INACTIVITY_LIMIT && !isPaused) {
      stopStorageCheck();
      isPaused = true;
    }
  }, 60000); // Chequea cada minuto

  return pulseService
}

export type { PulseService } from '../types'

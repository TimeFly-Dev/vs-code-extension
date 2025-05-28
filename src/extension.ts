import * as vscode from 'vscode'
import { createPulseService } from './services/pulse'
import { createStorageService } from './services/storage'
import { createSyncService } from './services/sync'
import { createSystemService } from './services/system'
import { createStatusBarItem, updateStatusBar } from './ui/statusBar'
import { registerApiKeyCommands } from './commands/apiKey'
import type { ActivityState } from './types'


const IDLE_CHECK_INTERVAL = 60000 // Check for idle every minute
const STATUS_BAR_UPDATE_INTERVAL = 1000 // Update status bar every second
const ACTIVITY_THRESHOLD = 2000 // Minimum time between activity updates (2 seconds)
const IDLE_THRESHOLD = 120000 // 2 minutes in milliseconds

/**
 * Detects the current activity state
 * @param editor - The VSCode text editor
 * @returns The detected activity state
 */
const detectState = (editor: vscode.TextEditor | undefined): ActivityState => {
  if (!editor) {
    return 'coding' // Default to coding
  }

  // If there's an active debug session, consider it debugging
  return vscode.debug.activeDebugSession ? 'debugging' : 'coding'
}

// Variable to store services for external access
let globalSyncService: any = null
let globalPulseService: any = null

// Track if the extension has been activated
let isActivated = false

let statusInterval: NodeJS.Timeout | null = null;
let idleInterval: NodeJS.Timeout | null = null;
let isPaused = false;
let lastActiveTime = Date.now();
const INACTIVITY_LIMIT = 60 * 60 * 1000; // 1 hora
let statusBarItem: vscode.StatusBarItem | null = null;

function startIntervals() {
  if (!idleInterval) {
    idleInterval = setInterval(() => {
      if (!globalPulseService.isActive() && statusBarItem) {
        updateStatusBar(statusBarItem, globalPulseService);
      }
    }, IDLE_CHECK_INTERVAL);
  }
  if (!statusInterval) {
    statusInterval = setInterval(() => {
      if (statusBarItem) {
        updateStatusBar(statusBarItem, globalPulseService);
      }
    }, STATUS_BAR_UPDATE_INTERVAL);
  }
}

function stopIntervals() {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

/**
 * Activates the extension
 * @param context - The VSCode extension context
 */
export function activate (context: vscode.ExtensionContext): any {
  // Prevent multiple activations
  if (isActivated) {
    return {
      getSyncService: () => globalSyncService,
      getPulseService: () => globalPulseService,
    }
  }

  isActivated = true

  try {
    statusBarItem = createStatusBarItem();
    context.subscriptions.push(statusBarItem);

    // Initialize services
    const storageService = createStorageService(context.globalState)
    const syncService = createSyncService(storageService, context)
    const systemService = createSystemService()
    const pulseService = createPulseService(storageService, syncService, systemService)

    globalSyncService = syncService
    globalPulseService = pulseService

    // Register API key commands
    registerApiKeyCommands(context)

    // Start sync scheduling
    syncService.scheduleSync()

    // Update the trackEditorActivity function to properly handle idle time
    const trackEditorActivity = (() => {
      let lastActivityTime = Date.now()
      let idleTimeoutId: NodeJS.Timeout | null = null

      return (editor: vscode.TextEditor | undefined) => {
        const now = Date.now()
        if (now - lastActivityTime < ACTIVITY_THRESHOLD) {
          return Promise.resolve()
        }
        lastActivityTime = now

        // Clear any existing idle timeout
        if (idleTimeoutId) {
          clearTimeout(idleTimeoutId)
        }

        // Set a new idle timeout
        idleTimeoutId = setTimeout(() => {
          // After IDLE_THRESHOLD, mark as inactive
          if (statusBarItem) {
            updateStatusBar(statusBarItem, pulseService)
          }
          idleTimeoutId = null
        }, IDLE_THRESHOLD)

        const state = detectState(editor)
        return pulseService.trackActivity(editor, state).then(() => {
          if (statusBarItem) {
            updateStatusBar(statusBarItem, pulseService)
          }
        })
      }
    })()

    // Track when the active editor changes
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        trackEditorActivity(editor)
      }),
    )

    // Track when text changes in the editor
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
          trackEditorActivity(vscode.window.activeTextEditor)
        }
      }),
    )

    // Track when the cursor position changes
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(event => {
        trackEditorActivity(event.textEditor)
      }),
    )

    // Track when a debug session starts or ends
    context.subscriptions.push(
      vscode.debug.onDidStartDebugSession(() => {
        trackEditorActivity(vscode.window.activeTextEditor)
      }),
      vscode.debug.onDidTerminateDebugSession(() => {
        trackEditorActivity(vscode.window.activeTextEditor)
      }),
    )

    // Initial activity tracking
    if (statusBarItem) {
      trackEditorActivity(vscode.window.activeTextEditor)
    }

    // Set up idle checking
    startIntervals()

    // Timer to pause intervals if there is inactivity
    const inactivityInterval = setInterval(() => {
      if (Date.now() - lastActiveTime > INACTIVITY_LIMIT && !isPaused) {
        stopIntervals()
        isPaused = true
      }
    }, 60000) // Check every minute

    // Sync is always active, no manual sync command needed

    // Register command to toggle sync
    context.subscriptions.push(
      // Sync is always active, removed toggle command
    )

    // Clean up on deactivation
    context.subscriptions.push({
      dispose: () => {
        stopIntervals()
        clearInterval(inactivityInterval)
        pulseService.dispose()
        storageService.dispose()
        isActivated = false
      },
    })

    return {
      getSyncService: () => globalSyncService,
      getPulseService: () => globalPulseService,
    }
  } catch (error) {
    vscode.window.showErrorMessage('Error activating TimeFly extension')
    isActivated = false
    return {}
  }
}

/**
 * Deactivates the extension
 */
export function deactivate (): void {
  isActivated = false
}

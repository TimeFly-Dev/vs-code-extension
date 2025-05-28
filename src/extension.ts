import * as vscode from 'vscode'
import { createPulseService } from './services/pulse'
import { createStorageService } from './services/storage'
import { createSyncService } from './services/sync'
import { createSystemService } from './services/system'
import { createStatusBarItem, updateStatusBar } from './ui/statusBar'
import { registerApiKeyCommands } from './commands/apiKey'
import type { ActivityState } from './types'
import { getIDEType, IDEType } from './utils/ide'
import { logger } from './utils/logger'

const IDLE_CHECK_INTERVAL = 60000 // Check for idle every minute
const STATUS_BAR_UPDATE_INTERVAL = 1000 // Update status bar every second
const ACTIVITY_THRESHOLD = 2000 // Minimum time between activity updates (2 seconds)
const IDLE_THRESHOLD = 120000 // 2 minutes in milliseconds
const IS_DEV = process.env.NODE_ENV === 'development' || process.env.VSCODE_DEBUG_MODE === 'true';

/**
 * Detects the current activity state.
 * Uses VSCode API to detect Cursor AI panel and debugging state.
 * @param editor - The VSCode text editor
 * @returns The detected activity state
 */
const detectState = (editor: vscode.TextEditor | undefined): ActivityState => {
  // Improved debugging detection: only if there is an active debug session and the editor belongs to a workspace file
  if (vscode.debug.activeDebugSession && editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) {
    return 'debugging';
  }

  return 'coding';
}

// Variable to store services for external access
let globalSyncService: any = null
let globalPulseService: any = null
let globalIDEType: IDEType = 'unknown';

// Track if the extension has been activated
let isActivated = false

let statusInterval: NodeJS.Timeout | null = null;
let idleInterval: NodeJS.Timeout | null = null;
let isPaused = false;
let lastActiveTime = Date.now();
const INACTIVITY_LIMIT = 60 * 60 * 1000; // 1 hora
let statusBarItem: vscode.StatusBarItem | null = null;

function startIntervals () {
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

function stopIntervals () {
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
  // Detect IDE at activation
  globalIDEType = getIDEType();
  if (IS_DEV) {
    logger.info(`[TimeFly] Detected IDE: ${globalIDEType}`);
  }

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

    // Register command to show sync details
    context.subscriptions.push(
      vscode.commands.registerCommand('timefly.showSyncDetails', () => {
        const syncInfo = globalPulseService?.getSyncInfo?.();
        if (!syncInfo) {
          vscode.window.showInformationMessage('No sync info available.');
          return;
        }
        if (syncInfo.apiStatus === 'ok') {
          vscode.env.openExternal(vscode.Uri.parse('https://timefly.dev'));
        } else {
          let errorMsg = `Sync Error: Could not connect to server.\nPending: ${syncInfo.pendingPulses}`;
          if (syncInfo.lastError) {
            errorMsg += `\n\nDetails: ${syncInfo.lastError}`;
          }
          vscode.window.showErrorMessage(
            errorMsg,
            'View on Web',
            'Retry Sync',
            'Clear Data'
          ).then(selection => {
            if (selection === 'View on Web') {
              vscode.env.openExternal(vscode.Uri.parse('https://timefly.dev'));
            } else if (selection === 'Retry Sync') {
              vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Retrying sync...' }, async () => {
                try {
                  await globalSyncService?.syncPulses?.();
                  vscode.window.showInformationMessage('Sync retried successfully!');
                } catch (err) {
                  vscode.window.showErrorMessage('Retry failed: ' + (err instanceof Error ? err.message : String(err)));
                }
              });
            } else if (selection === 'Clear Data') {
              vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Clearing all TimeFly data...' }, async () => {
                try {
                  const storage = globalPulseService?.storageService;
                  if (storage) {
                    logger.info('[TimeFly] Clearing all data from storage...');
                    await storage.clearAllData();
                    logger.info('[TimeFly] All data cleared!');
                    vscode.window.showInformationMessage('All TimeFly data cleared!');
                  } else {
                    vscode.window.showErrorMessage('Could not clear data: storage service not available.');
                  }
                } catch (err) {
                  logger.error('[TimeFly] Clear data failed:', err);
                  vscode.window.showErrorMessage('Clear data failed: ' + (err instanceof Error ? err.message : String(err)));
                }
              });
            }
          });
        }
      })
    );

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

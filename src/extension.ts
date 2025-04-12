import * as vscode from 'vscode'
import { createPulseService } from './services/pulse'
import { createStorageService } from './services/storage'
import { createSyncService } from './services/sync'
import { createSystemService } from './services/system'
import { createStatusBarItem, updateStatusBar } from './ui/statusBar'
import { registerDebugCommands } from './commands/debug'
import { logger } from './utils/logger'
import type { ActivityState } from './types'
import { registerAuthCommands } from './commands/auth'

const IDLE_CHECK_INTERVAL = 60000 // Check for idle every minute
const STATUS_BAR_UPDATE_INTERVAL = 1000 // Update status bar every second
const ACTIVITY_THRESHOLD = 2000 // Minimum time between activity updates (2 seconds)
// Update the IDLE_THRESHOLD to 2 minutes in milliseconds
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

// Variable para almacenar los servicios para acceso externo
let globalSyncService: any = null
let globalPulseService: any = null

/**
 * Activates the extension
 * @param context - The VSCode extension context
 */
export function activate (context: vscode.ExtensionContext): any {
  logger.info('Activating TimeFly extension')

  // Check if debug mode is enabled via configuration
  const config = vscode.workspace.getConfiguration('timefly')
  const debugMode = config.get<boolean>('debugMode', false)

  if (debugMode) {
    logger.setLevel('debug')
    logger.enable()
    logger.debug('Debug mode enabled')
  }

  try {
    const statusBarItem = createStatusBarItem()
    context.subscriptions.push(statusBarItem)
    logger.debug('Status bar item created')

    // Initialize services
    const storageService = createStorageService(context.globalState)
    const syncService = createSyncService(storageService)
    const systemService = createSystemService()
    const pulseService = createPulseService(storageService, syncService, systemService)
    logger.debug('Services initialized')

    globalSyncService = syncService
    globalPulseService = pulseService

    // Register commands
    registerDebugCommands(context, pulseService)
    registerAuthCommands(context)

    // Start sync scheduling
    syncService.scheduleSync()
    logger.debug('Sync scheduled')

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
          logger.debug('User became inactive due to idle timeout')
          updateStatusBar(statusBarItem, pulseService)
          idleTimeoutId = null
        }, IDLE_THRESHOLD)

        const state = detectState(editor)
        logger.debug(`Activity detected: ${state}`)
        return pulseService.trackActivity(editor, state).then(() => {
          updateStatusBar(statusBarItem, pulseService)
        })
      }
    })()

    // Track when the active editor changes
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        logger.debug('Editor changed')
        trackEditorActivity(editor)
      }),
    )

    // Track when text changes in the editor
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
          logger.debug('Document changed')
          trackEditorActivity(vscode.window.activeTextEditor)
        }
      }),
    )

    // Track when the cursor position changes
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(event => {
        logger.debug('Selection changed')
        trackEditorActivity(event.textEditor)
      }),
    )

    // Track when a debug session starts or ends
    context.subscriptions.push(
      vscode.debug.onDidStartDebugSession(() => {
        logger.debug('Debug session started')
        trackEditorActivity(vscode.window.activeTextEditor)
      }),
      vscode.debug.onDidTerminateDebugSession(() => {
        logger.debug('Debug session ended')
        trackEditorActivity(vscode.window.activeTextEditor)
      }),
    )

    // Initial activity tracking
    trackEditorActivity(vscode.window.activeTextEditor)
    logger.debug('Initial activity tracked')

    // Update the idleInterval to use a more functional approach
    // Replace the idleInterval setup with this
    const setupIdleCheck = () => {
      logger.debug('Setting up idle time checking')
      return setInterval(() => {
        if (!pulseService.isActive()) {
          logger.debug('User is idle, updating status')
          updateStatusBar(statusBarItem, pulseService)
        }
      }, IDLE_CHECK_INTERVAL)
    }

    const idleInterval = setupIdleCheck()

    // Update status bar more frequently
    const statusInterval = setInterval(() => {
      updateStatusBar(statusBarItem, pulseService)
    }, STATUS_BAR_UPDATE_INTERVAL)

    // Register command to toggle debug mode
    context.subscriptions.push(
      vscode.commands.registerCommand('timefly.toggleDebugMode', () => {
        const newDebugMode = !debugMode
        config.update('debugMode', newDebugMode, vscode.ConfigurationTarget.Global)

        if (newDebugMode) {
          logger.setLevel('debug')
          logger.enable()
          logger.info('Debug mode enabled')
          vscode.window.showInformationMessage('TimeFly: Debug mode enabled')
        } else {
          logger.setLevel('info')
          logger.info('Debug mode disabled')
          vscode.window.showInformationMessage('TimeFly: Debug mode disabled')
        }
      }),
    )

    // Register command to sync now
    context.subscriptions.push(
      vscode.commands.registerCommand('timefly.syncNow', () => {
        logger.info('Manual sync triggered via command')
        syncService
          .syncPulses()
          .then(() => {
            vscode.window.showInformationMessage('TimeFly: Sync completed')
          })
          .catch(error => {
            logger.error('Error during manual sync', error)
            vscode.window.showErrorMessage('TimeFly: Sync failed')
          })
      }),
    )

    // Clean up on deactivation
    context.subscriptions.push({
      dispose: () => {
        clearInterval(idleInterval)
        clearInterval(statusInterval)
        pulseService.dispose()
        logger.debug('Intervals and services disposed')
      },
    })

    logger.info('TimeFly extension activated successfully')

    return {
      getSyncService: () => globalSyncService,
      getPulseService: () => globalPulseService,
    }
  } catch (error) {
    logger.error('Error activating TimeFly extension', error)
    void vscode.window.showErrorMessage('Error activating TimeFly extension')
    return {}
  }
}

/**
 * Deactivates the extension
 */
export function deactivate (): void {
  logger.info('TimeFly extension deactivated')
}
import * as vscode from 'vscode'
import { createHeartbeatService } from './services/heartbeat'
import { createStorageService } from './services/storage'
import { createSyncService } from './services/sync'
import { createStatusBarItem, updateStatusBar } from './ui/statusBar'
import { registerDebugCommands } from './commands/debug'
import type { ActivityCategory } from './types'

const IDLE_CHECK_INTERVAL = 60000 // Check for idle every minute
const STATUS_BAR_UPDATE_INTERVAL = 1000 // Update status bar every second
const ACTIVITY_THRESHOLD = 2000 // Minimum time between activity updates (2 seconds)

// TODO: Replace with actual API endpoint
const API_ENDPOINT = 'https://api.example.com/heartbeats'

const detectCategory = (editor: vscode.TextEditor | undefined): ActivityCategory =>
  !editor
    ? 'browsing'
    : editor.document.fileName.toLowerCase().includes('test')
      ? 'writing tests'
      : editor.document.fileName.toLowerCase().includes('readme') ||
          editor.document.fileName.toLowerCase().includes('.md')
        ? 'writing docs'
        : editor.document.fileName.toLowerCase().includes('.git')
          ? 'code reviewing'
          : 'coding'

export function activate (context: vscode.ExtensionContext): void {
  console.log('Activating TimeFly extension')

  try {
    const statusBarItem = createStatusBarItem()
    context.subscriptions.push(statusBarItem)

    // Initialize services
    const storageService = createStorageService(context.globalState)
    const syncService = createSyncService(storageService, API_ENDPOINT)
    const heartbeatService = createHeartbeatService(storageService, syncService)

    // Register debug commands
    registerDebugCommands(context, heartbeatService)

    // Start sync scheduling
    syncService.scheduleSync()

    const trackEditorActivity = (() => {
      const lastActivityTime = { current: Date.now() }
      return (editor: vscode.TextEditor | undefined) => {
        const now = Date.now()
        if (now - lastActivityTime.current < ACTIVITY_THRESHOLD) {
          return Promise.resolve()
        }
        lastActivityTime.current = now

        const category = detectCategory(editor)
        return heartbeatService.trackActivity(editor, category).then(() => {
          updateStatusBar(statusBarItem, heartbeatService)
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

    // Initial activity tracking
    trackEditorActivity(vscode.window.activeTextEditor)

    // Check for idle time every minute
    const idleInterval = setInterval(() => {
      trackEditorActivity(vscode.window.activeTextEditor)
    }, IDLE_CHECK_INTERVAL)

    // Update status bar more frequently
    const statusInterval = setInterval(() => {
      updateStatusBar(statusBarItem, heartbeatService)
    }, STATUS_BAR_UPDATE_INTERVAL)

    // Clean up on deactivation
    context.subscriptions.push({
      dispose: () => {
        clearInterval(idleInterval)
        clearInterval(statusInterval)
        heartbeatService.dispose()
      },
    })

    console.log('TimeFly extension activated successfully')
  } catch (error) {
    console.error('Error activating TimeFly extension:', error)
    void vscode.window.showErrorMessage('Error activating TimeFly extension')
  }
}

export function deactivate (): void {
  console.log('TimeFly extension deactivated')
}


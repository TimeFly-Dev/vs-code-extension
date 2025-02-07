import * as vscode from 'vscode'
import { heartbeatService } from './services/heartbeat'
import { createStatusBarItem, updateStatusBar } from './ui/statusBar'
import { registerDebugCommands } from './commands/debug'
import type { ActivityCategory } from './types'

const IDLE_CHECK_INTERVAL = 60000 // Check for idle every minute
const STATUS_BAR_UPDATE_INTERVAL = 1000 // Update status bar every second
const ACTIVITY_THRESHOLD = 2000 // Minimum time between activity updates (2 seconds)

let lastActivityTime = Date.now()

const detectCategory = (editor: vscode.TextEditor | undefined): ActivityCategory => {
  if (!editor) {return 'browsing'}

  const fileName = editor.document.fileName.toLowerCase()
  if (fileName.includes('test')) {return 'writing tests'}
  if (fileName.includes('readme') || fileName.includes('.md')) {return 'writing docs'}
  if (fileName.includes('.git')) {return 'code reviewing'}
  return 'coding'
}

export function activate (context: vscode.ExtensionContext) {
  const statusBarItem = createStatusBarItem()
  context.subscriptions.push(statusBarItem)

  registerDebugCommands(context, heartbeatService)

  const trackEditorActivity = async (editor: vscode.TextEditor | undefined) => {
    const now = Date.now()
    if (now - lastActivityTime < ACTIVITY_THRESHOLD) {
      return // Throttle activity tracking
    }
    lastActivityTime = now

    const category = detectCategory(editor)
    await heartbeatService.trackActivity(editor, category)
    updateStatusBar(heartbeatService)
  }

  // Track when the active editor changes
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(trackEditorActivity))

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

  // Check for idle time every minute
  setInterval(() => {
    trackEditorActivity(vscode.window.activeTextEditor)
  }, IDLE_CHECK_INTERVAL)

  // Update status bar more frequently
  setInterval(() => updateStatusBar(heartbeatService), STATUS_BAR_UPDATE_INTERVAL)

  // Initial activity tracking
  trackEditorActivity(vscode.window.activeTextEditor)
}

export function deactivate () {}


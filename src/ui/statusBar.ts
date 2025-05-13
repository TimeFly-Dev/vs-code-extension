import * as vscode from 'vscode'
import type { PulseService } from '../types'

/**
 * Creates a status bar item for displaying coding time
 * @returns A VSCode status bar item
 */
export const createStatusBarItem = (): vscode.StatusBarItem => {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
  statusBarItem.name = 'TimeFly'
  statusBarItem.text = '$(clock) 0m'
  statusBarItem.tooltip = 'Time spent coding today'
  // Removed clickable command
  statusBarItem.show()
  return statusBarItem
}

/**
 * Updates the status bar with current coding time and sync status
 * @param statusBarItem - The status bar item
 * @param pulseService - The pulse service
 */
export const updateStatusBar = (statusBarItem: vscode.StatusBarItem, pulseService: PulseService): void => {
  const total = pulseService.getTodayTotal()
  const syncInfo = pulseService.getSyncInfo()

  // Base text is always the time
  let text = `$(clock) ${total}`

  // Add sync status indicator
  if (syncInfo.pendingPulses > 0) {
    text += ` $(sync~spin) ${syncInfo.pendingPulses}` // Pending pulses with count
  } else if (syncInfo.apiStatus === 'error') {
    text += ' $(error)' // Error indicator
  } else if (syncInfo.isOnline) {
    text += ' $(cloud)' // Online indicator
  }

  statusBarItem.text = text

  // Update tooltip with more detailed information
  const isActive = pulseService.isActive()
  let tooltip = `Time spent coding today: ${total}\nStatus: ${isActive ? 'Active' : 'Inactive'}`

  // Add sync information to tooltip
  tooltip += `\nLast Sync: ${syncInfo.lastSyncTime > 0 ? new Date(syncInfo.lastSyncTime).toLocaleTimeString() : 'Never'}`
  tooltip += `\nNext Sync: ${new Date(syncInfo.nextSyncTime).toLocaleTimeString()}`
  tooltip += `\nPending Items: ${syncInfo.pendingPulses}`

  if (syncInfo.apiStatus === 'error') {
    tooltip += '\n\nSync Error: Could not connect to server'
  }

  tooltip += '\n\nClick to view sync details'

  statusBarItem.tooltip = tooltip
}

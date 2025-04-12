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
  statusBarItem.show()
  return statusBarItem
}

/**
 * Updates the status bar with current coding time
 * @param statusBarItem - The status bar item
 * @param pulseService - The pulse service
 */
export const updateStatusBar = (statusBarItem: vscode.StatusBarItem, pulseService: PulseService): void => {
  const total = pulseService.getTodayTotal()
  statusBarItem.text = `$(clock) ${total}`

  // Update tooltip with more detailed information
  const isActive = pulseService.isActive()
  statusBarItem.tooltip = `Time spent coding today: ${total}\nStatus: ${isActive ? 'Active' : 'Inactive'}`
}

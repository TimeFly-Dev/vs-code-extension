import * as vscode from 'vscode'
import type { HeartbeatService } from '../types'

let statusBarItem: vscode.StatusBarItem

export const createStatusBarItem = (): vscode.StatusBarItem => {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
  statusBarItem.name = 'TimeFly'
  statusBarItem.text = '$(clock) 0m'
  statusBarItem.tooltip = 'Time spent coding today'
  statusBarItem.show()
  return statusBarItem
}

export const updateStatusBar = (heartbeatService: HeartbeatService): void => {
  const total = heartbeatService.getTodayTotal()
  statusBarItem.text = `$(clock) ${total}`
}


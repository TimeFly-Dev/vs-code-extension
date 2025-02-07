import * as vscode from 'vscode'
import type { HeartbeatService } from '../types'

const showHeartbeats = async (heartbeatService: HeartbeatService): Promise<void> => {
  const summary = heartbeatService.getHeartbeatSummary()

  const document = await vscode.workspace.openTextDocument({
    content: JSON.stringify(summary, null, 2),
    language: 'json',
  })

  await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  })
}

const exportHeartbeats = async (heartbeatService: HeartbeatService): Promise<void> => {
  const summary = heartbeatService.getHeartbeatSummary()

  const uri = await vscode.window.showSaveDialog({
    filters: { JSON: ['json'] },
    defaultUri: vscode.Uri.file('timefly-heartbeats.json'),
  })

  if (uri) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(summary, null, 2)))
    await vscode.window.showInformationMessage(`Heartbeats exported to ${uri.fsPath}`)
  }
}

export const registerDebugCommands = (context: vscode.ExtensionContext, heartbeatService: HeartbeatService): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand('timefly.showHeartbeats', () => showHeartbeats(heartbeatService)),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('timefly.exportHeartbeats', () => exportHeartbeats(heartbeatService)),
  )
}


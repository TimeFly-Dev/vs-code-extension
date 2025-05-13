import * as vscode from 'vscode'
import { CONFIG } from '../config'
import { logger } from '../utils/logger'

/**
 * Saves the API key to VSCode global state
 * @param apiKey - The API key
 * @param context - The VSCode extension context
 * @returns A promise that resolves when the API key is saved
 */
const saveApiKey = async (apiKey: string, context: vscode.ExtensionContext): Promise<void> => {
  try {
    // Validate that the input looks like an API key (hexadecimal string)
    // This helps prevent saving email addresses or other invalid values
    const apiKeyRegex = /^[0-9a-f]{32,}$/i
    if (!apiKeyRegex.test(apiKey)) {
      logger.warn(`Invalid API key format: ${apiKey.substring(0, 8)}...`)
      throw new Error('Invalid API key format. Please enter a valid API key (hexadecimal string).')
    }

    logger.info(`Saving API key: ${apiKey.substring(0, 8)}...`)
    await context.globalState.update(CONFIG.API_KEY.KEY_STORAGE, apiKey)
    logger.info('API key saved successfully')

    // Show success message and trigger a sync
    vscode.window.showInformationMessage('TimeFly: API key saved successfully! Syncing data...')

    // Execute the syncNow command registered in extension.ts
    vscode.commands.executeCommand('timefly.syncNow')
  } catch (error) {
    logger.error('Failed to save API key:', error)
    throw error
  }
}

/**
 * Handles the API key input
 * @param context - The VSCode extension context
 * @returns A promise that resolves when API key input is complete
 */
const handleApiKeyInput = async (context: vscode.ExtensionContext): Promise<void> => {
  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your TimeFly API key',
    placeHolder: 'API key (hexadecimal string, 32+ characters)',
    validateInput: (value: string) => {
      const apiKeyRegex = /^[0-9a-f]{32,}$/i
      if (!value.trim()) {
        return 'API key cannot be empty'
      }
      if (!apiKeyRegex.test(value)) {
        return 'Invalid API key format. Please enter a valid API key (hexadecimal string).'
      }
      return null
    },
  })

  if (apiKey) {
    try {
      await saveApiKey(apiKey, context)
      vscode.window.showInformationMessage('TimeFly: API key saved successfully!')
    } catch (error) {
      vscode.window.showErrorMessage(`TimeFly: Failed to save API key - ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * Registers API key commands
 * @param context - The VSCode extension context
 */
export const registerApiKeyCommands = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(vscode.commands.registerCommand('timefly.addApiKey', () => handleApiKeyInput(context)))

  // Add keys to sync
  context.globalState.setKeysForSync([CONFIG.API_KEY.KEY_STORAGE])
}

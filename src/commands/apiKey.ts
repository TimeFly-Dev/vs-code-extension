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
  const panel = vscode.window.createWebviewPanel('timeflyApiKey', 'TimeFly API Key', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TimeFly API Key</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          text-align: center;
        }
        h1 {
          margin-bottom: 20px;
        }
        .button {
          display: inline-block;
          padding: 10px 20px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          margin-top: 20px;
        }
        .button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .info {
          margin-top: 20px;
          padding: 10px;
          background-color: var(--vscode-inputValidation-infoBackground);
          border: 1px solid var(--vscode-inputValidation-infoBorder);
          border-radius: 4px;
        }
        input {
          width: 100%;
          padding: 8px;
          margin-top: 10px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
        }
        .status {
          margin-top: 10px;
          padding: 8px;
          border-radius: 4px;
          display: none;
        }
        .success {
          background-color: var(--vscode-testing-iconPassed);
          color: var(--vscode-editor-background);
        }
        .error {
          background-color: var(--vscode-testing-iconFailed);
          color: var(--vscode-editor-background);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>TimeFly API Key</h1>
        <p>Enter your TimeFly API key to sync your data:</p>
        <div class="info">
          <p>You can find your API key in your TimeFly user profile.</p>
          <p><strong>Important:</strong> Enter the API key, not your email address.</p>
          <input type="text" id="apiKeyInput" placeholder="Enter your API key here (hexadecimal string)">
          <button id="saveApiKey" class="button" style="margin-top: 10px;">Save API Key</button>
          <div id="status" class="status"></div>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('saveApiKey').addEventListener('click', () => {
          const apiKey = document.getElementById('apiKeyInput').value.trim();
          if (apiKey) {
            // Basic validation on the client side
            const apiKeyRegex = /^[0-9a-f]{32,}$/i;
            if (!apiKeyRegex.test(apiKey)) {
              const status = document.getElementById('status');
              status.textContent = 'Invalid API key format. Please enter a valid API key (hexadecimal string).';
              status.className = 'status error';
              status.style.display = 'block';
              return;
            }
            
            vscode.postMessage({
              type: 'saveApiKey',
              apiKey: apiKey
            });
            
            // Show saving status
            const status = document.getElementById('status');
            status.textContent = 'Saving API key...';
            status.className = 'status';
            status.style.display = 'block';
          }
        });
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          const status = document.getElementById('status');
          
          if (message.type === 'saveSuccess') {
            status.textContent = 'API key saved successfully! You can close this window.';
            status.className = 'status success';
            status.style.display = 'block';
            
            // Clear the input
            document.getElementById('apiKeyInput').value = '';
            
            // Close the panel after 3 seconds
            setTimeout(() => {
              vscode.postMessage({ type: 'close' });
            }, 3000);
          } else if (message.type === 'saveError') {
            status.textContent = 'Error saving API key: ' + message.error;
            status.className = 'status error';
            status.style.display = 'block';
          }
        });
      </script>
    </body>
    </html>
  `

  panel.webview.onDidReceiveMessage(
    async message => {
      if (message.type === 'saveApiKey') {
        try {
          await saveApiKey(message.apiKey, context)

          // Send success message back to webview
          panel.webview.postMessage({ type: 'saveSuccess' })

          // Close the panel after a delay
          setTimeout(() => {
            panel.dispose()
          }, 3000)
        } catch (error) {
          // Send error message back to webview
          panel.webview.postMessage({
            type: 'saveError',
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          vscode.window.showErrorMessage('TimeFly: Failed to save API key')
        }
      } else if (message.type === 'close') {
        panel.dispose()
      }
    },
    undefined,
    context.subscriptions,
  )
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

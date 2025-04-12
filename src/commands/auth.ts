import * as vscode from 'vscode'
import { CONFIG } from '../config'
import { logger } from '../utils/logger'

// Create a module-specific logger
const authLogger = logger.createChildLogger('Auth')

// Use a global variable to store the context
let extensionContext: vscode.ExtensionContext | null = null

/**
 * Gets the extension context
 * @returns The extension context
 */
export const getExtensionContext = (): vscode.ExtensionContext | null => {
  return extensionContext
}

/**
 * Saves the authentication token to VSCode secrets
 * @param token - The authentication token
 * @param context - The VSCode extension context
 * @returns A promise that resolves when the token is saved
 */
const saveAuthToken = async (token: string, context: vscode.ExtensionContext): Promise<void> => {
  try {
    await context.globalState.update(CONFIG.AUTH.TOKEN_KEY, token)
    authLogger.info('Authentication token saved successfully')

    // Show success message and trigger a sync
    vscode.window.showInformationMessage('TimeFly: Authentication successful! Syncing data...')
    
    // Ejecutar el comando syncNow que está registrado en extension.ts
    vscode.commands.executeCommand('timefly.syncNow')
  } catch (error) {
    authLogger.error('Error saving authentication token:', error)
    throw error
  }
}

/**
 * Handles the authentication callback
 * @param context - The VSCode extension context
 * @returns A promise that resolves when authentication is complete
 */
const handleAuthCallback = async (context: vscode.ExtensionContext): Promise<void> => {
  const panel = vscode.window.createWebviewPanel('timeflyAuth', 'TimeFly Authentication', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TimeFly Authentication</title>
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
        <h1>TimeFly Authentication</h1>
        <p>Click the button below to authenticate with TimeFly:</p>
        <a href="${CONFIG.AUTH.LOGIN_URL}" class="button" target="_blank">Login with Google</a>
        <div class="info">
          <p>After logging in, you will receive an access token. Copy and paste it here:</p>
          <input type="text" id="tokenInput" placeholder="Paste your access token here">
          <button id="saveToken" class="button" style="margin-top: 10px;">Save Token</button>
          <div id="status" class="status"></div>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('saveToken').addEventListener('click', () => {
          const token = document.getElementById('tokenInput').value.trim();
          if (token) {
            vscode.postMessage({
              type: 'saveToken',
              token: token
            });
            
            // Show saving status
            const status = document.getElementById('status');
            status.textContent = 'Saving token...';
            status.className = 'status';
            status.style.display = 'block';
          }
        });
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          const status = document.getElementById('status');
          
          if (message.type === 'saveSuccess') {
            status.textContent = 'Token saved successfully! You can close this window.';
            status.className = 'status success';
            status.style.display = 'block';
            
            // Clear the input
            document.getElementById('tokenInput').value = '';
            
            // Close the panel after 3 seconds
            setTimeout(() => {
              vscode.postMessage({ type: 'close' });
            }, 3000);
          } else if (message.type === 'saveError') {
            status.textContent = 'Error saving token: ' + message.error;
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
      if (message.type === 'saveToken') {
        try {
          await saveAuthToken(message.token, context)

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

          vscode.window.showErrorMessage('TimeFly: Failed to save authentication token')
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
 * Registers authentication commands
 * @param context - The VSCode extension context
 */
export const registerAuthCommands = (context: vscode.ExtensionContext): void => {
  authLogger.debug('Registering authentication commands')

  // Store the context in the global variable
  extensionContext = context

  context.subscriptions.push(vscode.commands.registerCommand('timefly.authenticate', () => handleAuthCallback(context)))

  // Add keys to sync
  context.globalState.setKeysForSync([CONFIG.AUTH.TOKEN_KEY])

  authLogger.info('Authentication commands registered successfully')
}

import * as vscode from 'vscode'
import type { HeartbeatService } from '../services/heartbeat'

const calculateTotalHeartbeats = (summary: any): number => summary.data.length

const formatTimeRange = (start: string, end: string): string => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  return `${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`
}

const getWebviewContent = (summary: any, isDark: boolean): string => {
  const totalHeartbeats = calculateTotalHeartbeats(summary)
  const timeRange = formatTimeRange(summary.start, summary.end)

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TimeFly Heartbeats</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/${isDark ? 'github-dark' : 'github'}.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/languages/json.min.js"></script>
      <style>
        body {
          padding: 16px;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
        }
        .container {
          max-width: 100%;
          margin: 0 auto;
        }
        .header {
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .title {
          margin: 0;
          color: var(--vscode-foreground);
          font-size: 1.5em;
        }
        .subtitle {
          margin: 8px 0 0 0;
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
        }
        pre {
          margin: 0;
          padding: 16px;
          border-radius: 6px;
          background-color: var(--vscode-textBlockQuote-background);
          overflow: auto;
          max-height: calc(100vh - 300px);
        }
        code {
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
          padding: 16px;
          border-radius: 6px;
          background-color: var(--vscode-textBlockQuote-background);
        }
        .stat-item {
          padding: 8px;
        }
        .stat-label {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
          margin-bottom: 4px;
        }
        .stat-value {
          font-size: 1.2em;
          font-weight: bold;
          color: var(--vscode-textLink-foreground);
        }
        .timestamp {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
          margin-top: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="title">TimeFly Heartbeats</h1>
          <p class="subtitle">Tracking your coding activity</p>
        </div>
        
        <div class="stats">
          <div class="stat-item">
            <div class="stat-label">Total Heartbeats</div>
            <div class="stat-value">${totalHeartbeats}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Time Range</div>
            <div class="stat-value">${timeRange}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Timezone</div>
            <div class="stat-value">${summary.timezone}</div>
          </div>
        </div>

        <pre><code class="language-json">${JSON.stringify(summary, null, 2)}</code></pre>
        
        <p class="timestamp">Last updated: ${new Date().toLocaleString()}</p>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        let scrollPosition = 0;
        
        hljs.highlightAll();
        
        document.querySelector('pre').addEventListener('scroll', (e) => {
          scrollPosition = e.target.scrollTop;
        });

        const updateContent = () => {
          vscode.postMessage({ type: 'refresh' });
        };

        const updateInterval = setInterval(updateContent, 5000);

        window.addEventListener('message', (event) => {
          const message = event.data;
          if (message.type === 'update') {
            const totalHeartbeats = message.data.data.length;
            document.querySelector('.stat-value').textContent = totalHeartbeats;
            
            const preElement = document.querySelector('pre code');
            preElement.textContent = JSON.stringify(message.data, null, 2);
            hljs.highlightElement(preElement);
            
            document.querySelector('pre').scrollTop = scrollPosition;
            
            document.querySelector('.timestamp').textContent = 'Last updated: ' + new Date().toLocaleString();
          }
        });

        window.addEventListener('unload', () => {
          clearInterval(updateInterval);
        });
      </script>
    </body>
    </html>
  `
}

const showHeartbeats = (heartbeatService: HeartbeatService): void => {
  const panel = vscode.window.createWebviewPanel('timeflyHeartbeats', 'TimeFly Heartbeats', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })

  const updateContent = () => {
    const summary = heartbeatService.getHeartbeatSummary()
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
    panel.webview.html = getWebviewContent(summary, isDark)
  }

  vscode.window.onDidChangeActiveColorTheme(() => updateContent())

  panel.webview.onDidReceiveMessage(
    message => {
      if (message.type === 'refresh') {
        const summary = heartbeatService.getHeartbeatSummary()
        panel.webview.postMessage({ type: 'update', data: summary })
      }
    },
    undefined,
    [],
  )

  updateContent()
}

const exportHeartbeats = (heartbeatService: HeartbeatService): void => {
  const summary = heartbeatService.getHeartbeatSummary()

  vscode.window
    .showSaveDialog({
      filters: { JSON: ['json'] },
      defaultUri: vscode.Uri.file('timefly-heartbeats.json'),
    })
    .then(uri => {
      if (uri) {
        vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(summary, null, 2))).then(() => {
          vscode.window.showInformationMessage(`Heartbeats exported to ${uri.fsPath}`)
        })
      }
    })
}

const showSyncInfo = (heartbeatService: HeartbeatService): void => {
  const panel = vscode.window.createWebviewPanel('timeflySyncInfo', 'TimeFly Sync Information', vscode.ViewColumn.One, {
    enableScripts: true,
  })

  const updateContent = () => {
    const syncInfo = heartbeatService.getSyncInfo()
    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TimeFly Sync Information</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          .info-item {
            margin-bottom: 16px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
          }
          .label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 4px;
          }
          .value {
            color: var(--vscode-foreground);
          }
          .status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
          }
          .status-ok {
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
          }
          .status-error {
            background-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-editor-background);
          }
          .status-unknown {
            background-color: var(--vscode-testing-iconQueued);
            color: var(--vscode-editor-background);
          }
        </style>
      </head>
      <body>
        <h1>TimeFly Sync Information</h1>
        <div class="info-item">
          <div class="label">Last Sync</div>
          <div class="value">${new Date(syncInfo.lastSyncTime).toLocaleString() || 'Never'}</div>
        </div>
        <div class="info-item">
          <div class="label">Next Sync</div>
          <div class="value">${new Date(syncInfo.nextSyncTime).toLocaleString()}</div>
        </div>
        <div class="info-item">
          <div class="label">Total Syncs</div>
          <div class="value">${syncInfo.syncCount}</div>
        </div>
        <div class="info-item">
          <div class="label">Connection Status</div>
          <div class="value">
            <span class="status ${syncInfo.isOnline ? 'status-ok' : 'status-error'}">
              ${syncInfo.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <div class="info-item">
          <div class="label">API Status</div>
          <div class="value">
            <span class="status status-${syncInfo.apiStatus}">
              ${syncInfo.apiStatus.toUpperCase()}
            </span>
          </div>
        </div>
      </body>
      </html>
    `
  }

  updateContent()
  const interval = setInterval(updateContent, 5000)
  panel.onDidDispose(() => clearInterval(interval))
}

export const registerDebugCommands = (context: vscode.ExtensionContext, heartbeatService: HeartbeatService): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand('timefly.showHeartbeats', () => showHeartbeats(heartbeatService)),
    vscode.commands.registerCommand('timefly.exportHeartbeats', () => exportHeartbeats(heartbeatService)),
    vscode.commands.registerCommand('timefly.showSyncInfo', () => showSyncInfo(heartbeatService)),
  )
}


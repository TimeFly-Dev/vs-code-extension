import * as vscode from 'vscode'
import * as path from 'path'
import type { PulseService } from '../types'
import { logger } from '../utils/logger'

/**
 * Generates HTML content for the webview
 * @param summary - The pulse summary
 * @param isDark - Whether the theme is dark
 * @param todayTotal - The total time spent today
 * @param activityInfo - The activity information
 * @returns HTML content as a string
 */
const getWebviewContent = (summary: any, isDark: boolean, todayTotal: string, activityInfo: any): string => {
  const totalPulses = summary.data.length
  const startDate = new Date(summary.start)
  const endDate = new Date(summary.end)
  const timeRange = `${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`

  // Format activity times
  const lastActivityTime = new Date(activityInfo.lastActivityTime).toLocaleString()
  const activeStartTime = activityInfo.activeStartTime ? new Date(activityInfo.activeStartTime).toLocaleString() : 'N/A'
  const idleThresholdSeconds = activityInfo.idleThreshold / 1000
  const activeEntity = activityInfo.activeEntity ? path.basename(activityInfo.activeEntity) : 'N/A'

  // Calculate statistics for debugging
  const fileStats = new Map()
  const languageStats = new Map()
  let totalAdditions = 0
  let totalDeletions = 0

  summary.data.forEach((pulse: any) => {
    // File statistics
    const fileName = pulse.entity ? path.basename(pulse.entity) : 'unknown'
    if (!fileStats.has(fileName)) {
      fileStats.set(fileName, { count: 0, additions: 0, deletions: 0 })
    }
    const fileStat = fileStats.get(fileName)
    fileStat.count++
    fileStat.additions += pulse.line_additions || 0
    fileStat.deletions += pulse.line_deletions || 0

    // Language statistics
    const language = pulse.language || 'unknown'
    if (!languageStats.has(language)) {
      languageStats.set(language, { count: 0 })
    }
    languageStats.get(language).count++

    // Total line changes
    totalAdditions += pulse.line_additions || 0
    totalDeletions += pulse.line_deletions || 0
  })

  // Convert maps to arrays for rendering
  const fileStatsArray = Array.from(fileStats.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10) // Top 10 files

  const languageStatsArray = Array.from(languageStats.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.count - a.count)

  // Generate file stats HTML
  let fileStatsHtml = ''
  fileStatsArray.forEach(file => {
    fileStatsHtml +=
      '<tr><td>' +
      file.name +
      '</td><td>' +
      file.count +
      '</td><td>' +
      file.additions +
      '</td><td>' +
      file.deletions +
      '</td></tr>'
  })

  // Generate language stats HTML
  let languageStatsHtml = ''
  languageStatsArray.forEach(lang => {
    languageStatsHtml += '<tr><td>' + lang.name + '</td><td>' + lang.count + '</td></tr>'
  })

  // Create the HTML content
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
          max-height: calc(100vh - 600px);
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
        .debug-section {
          margin: 20px 0;
          padding: 16px;
          border-radius: 6px;
          background-color: var(--vscode-textBlockQuote-background);
        }
        .debug-title {
          font-size: 1.2em;
          font-weight: bold;
          margin-bottom: 12px;
          color: var(--vscode-textLink-foreground);
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        th {
          color: var(--vscode-descriptionForeground);
        }
        .tabs {
          display: flex;
          margin-bottom: 16px;
        }
        .tab {
          padding: 8px 16px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        .tab.active {
          border-bottom: 2px solid var(--vscode-textLink-foreground);
          color: var(--vscode-textLink-foreground);
        }
        .tab-content {
          display: none;
        }
        .tab-content.active {
          display: block;
        }
        .status-active {
          color: var(--vscode-testing-iconPassed);
          font-weight: bold;
        }
        .status-inactive {
          color: var(--vscode-testing-iconFailed);
          font-weight: bold;
        }
        .progress-bar {
          width: 100%;
          height: 8px;
          background-color: var(--vscode-editor-inactiveSelectionBackground);
          border-radius: 4px;
          margin-top: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background-color: var(--vscode-textLink-foreground);
          transition: width 0.5s ease;
        }
        .progress-fill.warning {
          background-color: var(--vscode-testing-iconQueued);
        }
        .progress-fill.danger {
          background-color: var(--vscode-testing-iconFailed);
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
            <div class="stat-value" id="totalPulses">${totalPulses}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Today's Total</div>
            <div class="stat-value" id="todayTotal">${todayTotal}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Time Range</div>
            <div class="stat-value" id="timeRange">${timeRange}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Line Changes</div>
            <div class="stat-value" id="lineChanges">+${totalAdditions}/-${totalDeletions}</div>
          </div>
        </div>
        
        <div class="tabs">
          <div class="tab active" data-tab="activity">Activity</div>
          <div class="tab" data-tab="debug">Debug Info</div>
          <div class="tab" data-tab="files">Files</div>
          <div class="tab" data-tab="languages">Languages</div>
          <div class="tab" data-tab="raw">Raw Data</div>
        </div>
        
        <div class="tab-content active" id="activity-tab">
          <div class="debug-section">
            <div class="debug-title">Activity Information</div>
            <table>
              <tr>
                <th>Status</th>
                <td>
                  <span class="${activityInfo.isActive ? 'status-active' : 'status-inactive'}" id="activityStatus">
                    ${activityInfo.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
              <tr>
                <th>Last Activity Time</th>
                <td id="lastActivityTime">${lastActivityTime}</td>
              </tr>
              <tr>
                <th>Time Since Last Activity</th>
                <td>
                  <span id="timeSinceLastActivity">Calculating...</span>
                  <div class="progress-bar">
                    <div id="activityProgressBar" class="progress-fill" style="width: 0%"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <th>Idle Threshold</th>
                <td id="idleThreshold">${idleThresholdSeconds} seconds</td>
              </tr>
              <tr>
                <th>Active Start Time</th>
                <td id="activeStartTime">${activeStartTime}</td>
              </tr>
              <tr>
                <th>Current File</th>
                <td id="activeEntity">${activeEntity}</td>
              </tr>
              <tr>
                <th>Current State</th>
                <td id="activeState">${activityInfo.activeState || 'N/A'}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <div class="tab-content" id="debug-tab">
          <div class="debug-section">
            <div class="debug-title">Debug Information</div>
            <table>
              <tr>
                <th>Total Pulses</th>
                <td>${totalPulses}</td>
              </tr>
              <tr>
                <th>Today's Total Time</th>
                <td>${todayTotal}</td>
              </tr>
              <tr>
                <th>Start Time</th>
                <td>${startDate.toLocaleString()}</td>
              </tr>
              <tr>
                <th>End Time</th>
                <td>${endDate.toLocaleString()}</td>
              </tr>
              <tr>
                <th>Total Line Additions</th>
                <td>${totalAdditions}</td>
              </tr>
              <tr>
                <th>Total Line Deletions</th>
                <td>${totalDeletions}</td>
              </tr>
              <tr>
                <th>Languages</th>
                <td>${languageStatsArray.length}</td>
              </tr>
              <tr>
                <th>Files</th>
                <td>${fileStatsArray.length}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <div class="tab-content" id="files-tab">
          <div class="debug-section">
            <div class="debug-title">Top Files</div>
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Pulses</th>
                  <th>Additions</th>
                  <th>Deletions</th>
                </tr>
              </thead>
              <tbody id="filesTableBody">
                ${fileStatsHtml}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="tab-content" id="languages-tab">
          <div class="debug-section">
            <div class="debug-title">Languages</div>
            <table>
              <thead>
                <tr>
                  <th>Language</th>
                  <th>Pulses</th>
                </tr>
              </thead>
              <tbody id="languagesTableBody">
                ${languageStatsHtml}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="tab-content" id="raw-tab">
          <pre><code class="language-json" id="rawData">${JSON.stringify(summary, null, 2)}</code></pre>
        </div>
        
        <p class="timestamp" id="timestamp">Last updated: ${new Date().toLocaleString()}</p>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        let scrollPosition = 0;
        let activeTab = 'activity';
        let lastActivityTimestamp = ${activityInfo.lastActivityTime};
        let idleThreshold = ${activityInfo.idleThreshold};
        
        // Initialize highlight.js
        document.addEventListener('DOMContentLoaded', function() {
          try {
            hljs.highlightAll();
          } catch (e) {
            console.error('Error highlighting code:', e);
          }
        });
        
        // Save scroll position for raw data
        document.querySelector('pre').addEventListener('scroll', function(e) {
          scrollPosition = e.target.scrollTop;
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(function(tab) {
          tab.addEventListener('click', function() {
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(function(t) {
              t.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(function(c) {
              c.classList.remove('active');
            });
            
            // Add active class to clicked tab
            tab.classList.add('active');
            activeTab = tab.getAttribute('data-tab');
            document.getElementById(activeTab + '-tab').classList.add('active');
          });
        });

        // Function to update the time since last activity
        function updateTimeSinceLastActivity() {
          const now = Date.now();
          const timeSinceLastActivity = now - lastActivityTimestamp;
          const seconds = Math.floor(timeSinceLastActivity / 1000);
          const minutes = Math.floor(seconds / 60);
          const remainingSeconds = seconds % 60;
          
          // Format the time
          let timeString = '';
          if (minutes > 0) {
            timeString = minutes + 'm ' + remainingSeconds + 's';
          } else {
            timeString = seconds + 's';
          }

          // Update the text
          const timeSinceElement = document.getElementById("timeSinceLastActivity");
          if (timeSinceElement) {
            timeSinceElement.textContent = timeString;
          }

          // Update the progress bar
          const progressBar = document.getElementById("activityProgressBar");
          if (progressBar) {
            const progressPercent = Math.min(100, (timeSinceLastActivity / idleThreshold) * 100);
            progressBar.style.width = progressPercent + "%";
            
            // Change color based on progress
            progressBar.className = "progress-fill";
            if (progressPercent >= 90) {
              progressBar.className = "progress-fill danger";
            } else if (progressPercent >= 50) {
              progressBar.className = "progress-fill warning";
            }
          }

          // Update status if needed
          const activityStatus = document.getElementById("activityStatus");
          if (activityStatus && timeSinceLastActivity > idleThreshold && activityStatus.textContent === "Active") {
            activityStatus.textContent = "Inactive";
            activityStatus.className = "status-inactive";
          }
        }

        // Start updating the time since last activity
        setInterval(updateTimeSinceLastActivity, 1000);
        updateTimeSinceLastActivity(); // Initial update

        // Function to update UI with new data
        function updateUI(data) {
          try {
            // Update summary stats
            document.getElementById("totalPulses").textContent = data.summary.data.length;
            document.getElementById("todayTotal").textContent = data.todayTotal;
            
            const startDate = new Date(data.summary.start);
            const endDate = new Date(data.summary.end);
            document.getElementById("timeRange").textContent = 
              startDate.toLocaleTimeString() + " - " + endDate.toLocaleTimeString();

            // Update activity information
            const activityInfo = data.activityInfo;
            document.getElementById("activityStatus").textContent = activityInfo.isActive ? "Active" : "Inactive";
            document.getElementById("activityStatus").className = activityInfo.isActive ? "status-active" : "status-inactive";
            document.getElementById("lastActivityTime").textContent = new Date(activityInfo.lastActivityTime).toLocaleString();
            document.getElementById("activeStartTime").textContent = activityInfo.activeStartTime
              ? new Date(activityInfo.activeStartTime).toLocaleString()
              : "N/A";
            document.getElementById("idleThreshold").textContent = (activityInfo.idleThreshold / 1000) + " seconds";
            document.getElementById("activeEntity").textContent = activityInfo.activeEntity
              ? activityInfo.activeEntity.split("/").pop()
              : "N/A";
            document.getElementById("activeState").textContent = activityInfo.activeState || "N/A";

            // Update the last activity timestamp for the timer
            lastActivityTimestamp = activityInfo.lastActivityTime;
            idleThreshold = activityInfo.idleThreshold;

            // Calculate line changes
            let additions = 0;
            let deletions = 0;

            // Calculate file and language stats
            const fileStatsNew = new Map();
            const languageStatsNew = new Map();

            data.summary.data.forEach(function(pulse) {
              // Line changes
              additions += pulse.line_additions || 0;
              deletions += pulse.line_deletions || 0;

              // File statistics
              const fileName = pulse.entity ? pulse.entity.split("/").pop() : "unknown";
              if (!fileStatsNew.has(fileName)) {
                fileStatsNew.set(fileName, { count: 0, additions: 0, deletions: 0 });
              }
              const fileStat = fileStatsNew.get(fileName);
              fileStat.count++;
              fileStat.additions += pulse.line_additions || 0;
              fileStat.deletions += pulse.line_deletions || 0;

              // Language statistics
              const language = pulse.language || "unknown";
              if (!languageStatsNew.has(language)) {
                languageStatsNew.set(language, { count: 0 });
              }
              languageStatsNew.get(language).count++;
            });

            document.getElementById("lineChanges").textContent = "+" + additions + "/-" + deletions;

            // Update debug tab
            const debugTable = document.querySelector("#debug-tab table");
            if (debugTable) {
              debugTable.rows[0].cells[1].textContent = data.summary.data.length;
              debugTable.rows[1].cells[1].textContent = data.todayTotal;
              debugTable.rows[2].cells[1].textContent = startDate.toLocaleString();
              debugTable.rows[3].cells[1].textContent = endDate.toLocaleString();
              debugTable.rows[4].cells[1].textContent = additions;
              debugTable.rows[5].cells[1].textContent = deletions;
              debugTable.rows[6].cells[1].textContent = languageStatsNew.size;
              debugTable.rows[7].cells[1].textContent = fileStatsNew.size;
            }

            // Update files tab
            const fileStatsArrayNew = Array.from(fileStatsNew.entries())
              .map(function(entry) {
                return { name: entry[0], ...entry[1] };
              })
              .sort(function(a, b) {
                return b.count - a.count;
              })
              .slice(0, 10);

            let filesHtml = "";
            fileStatsArrayNew.forEach(function(file) {
              filesHtml += "<tr><td>" + file.name + "</td><td>" + file.count + 
                          "</td><td>" + file.additions + "</td><td>" + file.deletions + "</td></tr>";
            });
            
            const filesTableBody = document.getElementById("filesTableBody");
            if (filesTableBody) {
              filesTableBody.innerHTML = filesHtml;
            }

            // Update languages tab
            const languageStatsArrayNew = Array.from(languageStatsNew.entries())
              .map(function(entry) {
                return { name: entry[0], ...entry[1] };
              })
              .sort(function(a, b) {
                return b.count - a.count;
              });

            let languagesHtml = "";
            languageStatsArrayNew.forEach(function(lang) {
              languagesHtml += "<tr><td>" + lang.name + "</td><td>" + lang.count + "</td></tr>";
            });
            
            const languagesTableBody = document.getElementById("languagesTableBody");
            if (languagesTableBody) {
              languagesTableBody.innerHTML = languagesHtml;
            }

            // Update raw data
            const rawDataElement = document.getElementById("rawData");
            if (rawDataElement) {
              rawDataElement.textContent = JSON.stringify(data.summary, null, 2);
              try {
                hljs.highlightElement(rawDataElement);
              } catch (e) {
                console.error('Error highlighting code:', e);
              }
            }

            // Restore scroll position for raw data
            const preElement = document.querySelector("pre");
            if (preElement) {
              preElement.scrollTop = scrollPosition;
            }

            // Update timestamp
            document.getElementById("timestamp").textContent = "Last updated: " + new Date().toLocaleString();
          } catch (error) {
            console.error("Error updating UI:", error);
          }
        }

        // Request data refresh every 5 seconds
        const updateInterval = setInterval(function() {
          try {
            vscode.postMessage({ type: "refresh" });
          } catch (error) {
            console.error("Error sending refresh message:", error);
          }
        }, 5000);

        // Handle messages from the extension
        window.addEventListener("message", function(event) {
          try {
            const message = event.data;
            if (message.type === "update") {
              // Update UI with new data
              updateUI(message.data);
            }
          } catch (error) {
            console.error("Error handling message:", error);
          }
        });

        // Clean up on unload
        window.addEventListener("unload", function() {
          clearInterval(updateInterval);
        });
      </script>
    </body>
    </html>
  `
}

/**
 * Shows heartbeats in a webview panel
 * @param pulseService - The pulse service
 */
const showHeartbeats = (pulseService: PulseService): void => {
  logger.debug('Showing heartbeats webview')

  const panel = vscode.window.createWebviewPanel('timeflyHeartbeats', 'TimeFly Heartbeats', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })

  const updateContent = () => {
    try {
      const summary = pulseService.getPulseSummary()
      const todayTotal = pulseService.getTodayTotal()
      const activityInfo = pulseService.getActivityInfo()
      const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
      panel.webview.html = getWebviewContent(summary, isDark, todayTotal, activityInfo)
      logger.debug('Updated heartbeats webview content')
    } catch (error) {
      logger.error('Error updating heartbeats webview content', error)
    }
  }

  vscode.window.onDidChangeActiveColorTheme(() => updateContent())

  panel.webview.onDidReceiveMessage(
    message => {
      try {
        if (message.type === 'refresh') {
          const summary = pulseService.getPulseSummary()
          const todayTotal = pulseService.getTodayTotal()
          const activityInfo = pulseService.getActivityInfo()
          panel.webview.postMessage({
            type: 'update',
            data: {
              summary,
              todayTotal,
              activityInfo,
            },
          })
          logger.debug('Sent updated heartbeats data to webview')
        }
      } catch (error) {
        logger.error('Error refreshing heartbeats data', error)
      }
    },
    undefined,
    [],
  )

  // Set up an interval to update the content periodically
  const interval = setInterval(() => {
    if (panel.visible) {
      try {
        const summary = pulseService.getPulseSummary()
        const todayTotal = pulseService.getTodayTotal()
        const activityInfo = pulseService.getActivityInfo()
        panel.webview.postMessage({
          type: 'update',
          data: {
            summary,
            todayTotal,
            activityInfo,
          },
        })
        logger.debug('Auto-updated heartbeats data')
      } catch (error) {
        logger.error('Error auto-updating heartbeats data', error)
      }
    }
  }, 5000)

  // Clean up when the panel is disposed
  panel.onDidDispose(() => {
    clearInterval(interval)
    logger.debug('Disposed heartbeats webview')
  })

  updateContent()
}

/**
 * Exports heartbeats to a JSON file
 * @param pulseService - The pulse service
 */
const exportHeartbeats = (pulseService: PulseService): void => {
  logger.debug('Exporting heartbeats')
  const summary = pulseService.getPulseSummary()

  vscode.window
    .showSaveDialog({
      filters: { JSON: ['json'] },
      defaultUri: vscode.Uri.file('timefly-heartbeats.json'),
    })
    .then(uri => {
      if (uri) {
        vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(summary, null, 2))).then(() => {
          logger.info(`Heartbeats exported to ${uri.fsPath}`)
          vscode.window.showInformationMessage(`Heartbeats exported to ${uri.fsPath}`)
        })
      }
    })
}

/**
 * Generates HTML content for the sync info webview
 * @param syncInfo - The sync information
 * @returns HTML content as a string
 */
const getSyncInfoContent = (syncInfo: any): string => {
  // Format dates properly, avoiding 1/1/1970 for timestamps of 0
  const lastSyncTime = syncInfo.lastSyncTime > 0 ? new Date(syncInfo.lastSyncTime).toLocaleString() : 'Never'

  const nextSyncTime =
    syncInfo.nextSyncTime > 0
      ? new Date(syncInfo.nextSyncTime).toLocaleString()
      : new Date(Date.now() + 30 * 60 * 1000).toLocaleString()

  return `
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
        .timestamp {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
          margin-top: 16px;
          text-align: right;
        }
        .button {
          display: inline-block;
          padding: 8px 16px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 16px;
          text-decoration: none;
        }
        .button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
      </style>
    </head>
    <body>
      <h1>TimeFly Sync Information</h1>
      <div class="info-item">
        <div class="label">Last Sync</div>
        <div class="value" id="lastSync">${lastSyncTime}</div>
      </div>
      <div class="info-item">
        <div class="label">Next Sync</div>
        <div class="value" id="nextSync">${nextSyncTime}</div>
      </div>
      <div class="info-item">
        <div class="label">Total Syncs</div>
        <div class="value" id="totalSyncs">${syncInfo.syncCount}</div>
      </div>
      <div class="info-item">
        <div class="label">Connection Status</div>
        <div class="value">
          <span class="status ${syncInfo.isOnline ? 'status-ok' : 'status-error'}" id="connectionStatus">
            ${syncInfo.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <div class="info-item">
        <div class="label">API Status</div>
        <div class="value">
          <span class="status status-${syncInfo.apiStatus}" id="apiStatus">
            ${syncInfo.apiStatus.toUpperCase()}
          </span>
        </div>
      </div>
      <div class="info-item">
        <div class="label">Pending Pulses</div>
        <div class="value" id="pendingPulses">${syncInfo.pendingPulses}</div>
      </div>
      
      <button id="syncNow" class="button">Sync Now</button>
      <button id="authenticate" class="button">Authenticate</button>
      
      <p class="timestamp" id="timestamp">Last updated: ${new Date().toLocaleString()}</p>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        // Set up refresh interval
        const refreshInterval = setInterval(function() {
          try {
            vscode.postMessage({ type: 'refresh' });
          } catch (error) {
            console.error('Error sending refresh message:', error);
          }
        }, 5000);
        
        // Handle button clicks
        document.getElementById('syncNow').addEventListener('click', function() {
          vscode.postMessage({ type: 'syncNow' });
        });
        
        document.getElementById('authenticate').addEventListener('click', function() {
          vscode.postMessage({ type: 'authenticate' });
        });
        
        // Handle messages from extension
        window.addEventListener('message', function(event) {
          try {
            const message = event.data;
            
            if (message.type === 'update') {
              const syncInfo = message.data;
              
              // Update values without reloading the page
              document.getElementById('lastSync').textContent = 
                syncInfo.lastSyncTime > 0 ? new Date(syncInfo.lastSyncTime).toLocaleString() : "Never";
                
              document.getElementById('nextSync').textContent = 
                syncInfo.nextSyncTime > 0 ? new Date(syncInfo.nextSyncTime).toLocaleString() : 
                new Date(Date.now() + 30 * 60 * 1000).toLocaleString();
                
              document.getElementById('totalSyncs').textContent = syncInfo.syncCount;
              
              const connectionStatus = document.getElementById('connectionStatus');
              connectionStatus.textContent = syncInfo.isOnline ? "Online" : "Offline";
              connectionStatus.className = "status " + (syncInfo.isOnline ? "status-ok" : "status-error");
              
              const apiStatus = document.getElementById('apiStatus');
              apiStatus.textContent = syncInfo.apiStatus.toUpperCase();
              apiStatus.className = "status status-" + syncInfo.apiStatus;
              
              document.getElementById('pendingPulses').textContent = syncInfo.pendingPulses;
              document.getElementById('timestamp').textContent = "Last updated: " + new Date().toLocaleString();
            }
          } catch (error) {
            console.error('Error handling message:', error);
          }
        });
        
        // Clean up on unload
        window.addEventListener('unload', function() {
          clearInterval(refreshInterval);
        });
      </script>
    </body>
    </html>
  `
}

/**
 * Shows sync information in a webview panel
 * @param pulseService - The pulse service
 */
const showSyncInfo = (pulseService: PulseService): void => {
  logger.debug('Showing sync info webview')
  const panel = vscode.window.createWebviewPanel('timeflySyncInfo', 'TimeFly Sync Information', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true, // Keep the webview content when hidden
  })

  const updateContent = () => {
    try {
      const syncInfo = pulseService.getSyncInfo()
      panel.webview.html = getSyncInfoContent(syncInfo)
      logger.debug('Updated sync info webview content')
    } catch (error) {
      logger.error('Error updating sync info webview content', error)
    }
  }

  // Initial content update
  updateContent()

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    message => {
      try {
        if (message.type === 'refresh') {
          const syncInfo = pulseService.getSyncInfo()
          // Instead of reloading the page, send the updated data
          panel.webview.postMessage({ type: 'update', data: syncInfo })
          logger.debug('Sent updated sync info to webview')
        } else if (message.type === 'syncNow') {
          // Usar el comando registrado en extension.ts
          vscode.commands.executeCommand('timefly.syncNow')
        } else if (message.type === 'authenticate') {
          vscode.commands.executeCommand('timefly.authenticate')
        }
      } catch (error) {
        logger.error('Error handling webview message', error)
      }
    },
    undefined,
    [],
  )

  // Set up an interval to update the content periodically
  const interval = setInterval(() => {
    if (panel.visible) {
      try {
        const syncInfo = pulseService.getSyncInfo()
        panel.webview.postMessage({ type: 'update', data: syncInfo })
        logger.debug('Auto-updated sync info')
      } catch (error) {
        logger.error('Error auto-updating sync info', error)
      }
    }
  }, 5000)

  // Clean up when the panel is disposed
  panel.onDidDispose(() => {
    clearInterval(interval)
    logger.debug('Disposed sync info webview')
  })
}

/**
 * Clears all stored data
 * @param context - The VSCode extension context
 * @param pulseService - The pulse service
 */
const clearAllData = async (context: vscode.ExtensionContext, pulseService: PulseService): Promise<void> => {
  try {
    logger.debug('Clearing all stored data')

    // Clear all stored pulses
    await context.globalState.update('timefly.pendingPulses', [])

    // Reset today's total
    await context.globalState.update('timefly.todayTotal', 0)

    // Reset today's date
    await context.globalState.update('timefly.todayDate', new Date().toDateString())

    // Reset sync status
    await context.globalState.update('timefly.syncStatus', {
      lastSyncTime: 0,
      nextSyncTime: Date.now() + 30 * 60 * 1000,
      syncCount: 0,
      isOnline: true,
      apiStatus: 'unknown',
      pendingPulses: 0,
    })

    // Reset the pulse service state
    await pulseService.reset()

    logger.info('All data cleared successfully')
    vscode.window.showInformationMessage('TimeFly: All data has been cleared successfully')
  } catch (error) {
    logger.error('Error clearing data', error)
    vscode.window.showErrorMessage('TimeFly: Error clearing data')
  }
}

/**
 * Registers debug commands
 * @param context - The VSCode extension context
 * @param pulseService - The pulse service
 */
export const registerDebugCommands = (context: vscode.ExtensionContext, pulseService: PulseService): void => {
  logger.debug('Registering debug commands')
  context.subscriptions.push(
    vscode.commands.registerCommand('timefly.showHeartbeats', () => showHeartbeats(pulseService)),
    vscode.commands.registerCommand('timefly.exportHeartbeats', () => exportHeartbeats(pulseService)),
    vscode.commands.registerCommand('timefly.showSyncInfo', () => showSyncInfo(pulseService)),
    vscode.commands.registerCommand('timefly.clearAllData', () => clearAllData(context, pulseService)),
  )
  logger.info('Debug commands registered successfully')
}

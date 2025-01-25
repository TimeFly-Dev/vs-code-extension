import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Activity Types
type ActivityType = 'CODING' | 'DEBUGGING' | null;

interface ProjectInfo {
 readonly name: string;
 readonly language: string;
 readonly file: string;
 readonly workspaceId: string;
}

interface ActivityLog {
 readonly type: ActivityType;
 readonly startTime: number;
 readonly endTime: number | null;
 readonly project: ProjectInfo;
 readonly instanceId: string;
}

const INACTIVITY_TIMEOUT = 2 * 60 * 1000;
const UPDATE_INTERVAL = 3000; // Update every 3 seconds
const STORAGE_PATH = path.join(__dirname, '../logs');
const INSTANCE_ID = Date.now().toString();
const DASHBOARD_URL = 'https://timefly.dev/dashboard';

const createActivityLog = (type: ActivityType): ActivityLog => ({
 type,
 startTime: Date.now(),
 endTime: null,
 instanceId: INSTANCE_ID,
 project: {
   name: vscode.workspace.name ?? 'unknown',
   language: vscode.window.activeTextEditor?.document.languageId ?? 'unknown',
   file: vscode.window.activeTextEditor?.document.fileName ?? 'unknown',
   workspaceId: vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? 'unknown'
 }
});

const formatTime = (ms: number): string => {
 const minutes = Math.floor(ms / 60000);
 const hours = Math.floor(minutes / 60);
 return `${hours}h ${minutes % 60}m`;
};

export function activate(context: vscode.ExtensionContext) {
 if (!fs.existsSync(STORAGE_PATH)) {
   fs.mkdirSync(STORAGE_PATH, { recursive: true });
 }

 const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
 let currentActivity: ActivityLog | null = null;
 let lastActivity = Date.now();

 const updateStatusBar = () => {
   if (!currentActivity || (Date.now() - lastActivity > INACTIVITY_TIMEOUT)) {
     currentActivity = null;
     statusBar.text = '⚡ Timefly: INACTIVE';
     statusBar.tooltip = 'Click to open dashboard\nUse command palette to view logs';
     statusBar.command = 'timefly.openDashboard';
     statusBar.show();
     return;
   }

   const elapsed = Date.now() - currentActivity.startTime;
   statusBar.text = `⚡ Timefly: ${currentActivity.type} | ${formatTime(elapsed)} | ${currentActivity.project.language}`;
   statusBar.tooltip = `Project: ${currentActivity.project.name}\nLanguage: ${currentActivity.project.language}\nTotal Today: ${formatTime(elapsed)}\nClick to open dashboard`;
   statusBar.command = 'timefly.openDashboard';
   statusBar.show();
 };

 const saveActivityLog = () => {
   if (!currentActivity) return;

   const fileName = path.join(STORAGE_PATH, `${new Date().toISOString().split('T')[0]}.json`);
   const existingLogs = fs.existsSync(fileName) 
     ? JSON.parse(fs.readFileSync(fileName, 'utf8')) 
     : [];

   fs.writeFileSync(fileName, JSON.stringify([
     ...existingLogs, 
     {
       ...currentActivity,
       project: {
         ...currentActivity.project,
         workspaceId: currentActivity.project.workspaceId
       },
       instanceId: currentActivity.instanceId
     }
   ], null, 2));
 };

 context.subscriptions.push(
   vscode.commands.registerCommand('timefly.openDashboard', () => {
     vscode.env.openExternal(vscode.Uri.parse(DASHBOARD_URL));
   }),

   vscode.commands.registerCommand('timefly.showLogs', () => {
     const panel = vscode.window.createWebviewPanel(
       'timefly',
       'TimeFly Activity Logs',
       vscode.ViewColumn.One,
       {}
     );

     const logs = fs.readdirSync(STORAGE_PATH)
       .filter(file => file.endsWith('.json'))
       .map(file => ({
         date: file.replace('.json', ''),
         logs: JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, file), 'utf8'))
       }));

     panel.webview.html = `
       <html>
         <body style="padding: 20px;">
           <h1>TimeFly Activity Logs</h1>
           ${logs.map(dayLog => `
             <h2>${dayLog.date}</h2>
             <pre>${JSON.stringify(dayLog.logs, null, 2)}</pre>
           `).join('')}
         </body>
       </html>
     `;
   }),

   vscode.workspace.onDidChangeTextDocument(() => {
     if (!currentActivity?.type || currentActivity.type !== 'CODING') {
       if (currentActivity) {
         currentActivity = { ...currentActivity, endTime: Date.now() };
         saveActivityLog();
       }
       currentActivity = createActivityLog('CODING');
       lastActivity = Date.now();
       updateStatusBar();
     }
   }),

   vscode.debug.onDidStartDebugSession(() => {
     if (currentActivity) {
       currentActivity = { ...currentActivity, endTime: Date.now() };
       saveActivityLog();
     }
     currentActivity = createActivityLog('DEBUGGING');
     lastActivity = Date.now();
     updateStatusBar();
   }),

   vscode.window.onDidChangeWindowState(e => {
     if (!e.focused && currentActivity) {
       currentActivity = { ...currentActivity, endTime: Date.now() };
       saveActivityLog();
       currentActivity = null;
       updateStatusBar();
     }
   }),

   statusBar
 );

 setInterval(updateStatusBar, UPDATE_INTERVAL);
 statusBar.show();
}

export function deactivate() {
 console.log('Timefly deactivated');
}
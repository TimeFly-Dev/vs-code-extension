import * as vscode from 'vscode';
import * as os from 'os';
import * as crypto from 'crypto';
import { SystemService } from '../types';

const getMachineId = (): string => {
  const systemInfo = `${os.hostname()}-${os.platform()}-${os.arch()}`;
  return crypto.createHash('md5').update(systemInfo).digest('hex');
};

const getTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const getProjectDependencies = async (filePath: string): Promise<string> => {
  try {
    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    const packageJsonFile = files.find(file => file.fsPath.includes(filePath));
    if (!packageJsonFile) {
      return '';
    }
    const content = await vscode.workspace.fs.readFile(packageJsonFile);
    const packageJson = JSON.parse(content.toString());
    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    return Object.keys(allDependencies).join(',');
  } catch (error) {
    console.error('Error getting project dependencies:', error);
    return '';
  }
};

const getGitBranch = async (filePath: string): Promise<string> => {
  try {
    const gitExtension = vscode.extensions.getExtension<any>('vscode.git')?.exports;
    const api = gitExtension?.getAPI(1);
    
    if (!api) {
      return '';
    }

    const repository = api.repositories.find((repo: any) => 
      filePath.startsWith(repo.rootUri.fsPath),
    );

    return repository?.state.HEAD?.name || '';
  } catch (error) {
    console.error('Error getting Git branch:', error);
    return '';
  }
};

export const systemService: SystemService = {
  getMachineId,
  getTimezone,
  getProjectDependencies,
  getGitBranch,
};

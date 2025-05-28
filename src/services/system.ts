import * as vscode from 'vscode'
import * as os from 'os'
import * as crypto from 'crypto'
import type { SystemInfo } from '../types'
import { logger } from '../utils/logger'

/**
 * Generates a unique machine ID
 * @returns A unique machine ID
 */
const getMachineId = (): string => {
  const systemInfo = `${os.hostname()}-${os.platform()}-${os.arch()}`
  return crypto.createHash('md5').update(systemInfo).digest('hex')
}

/**
 * Gets the current timezone
 * @returns The current timezone
 */
const getTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * Gets project dependencies from package.json
 * @param filePath - The file path
 * @returns A promise that resolves to a comma-separated list of dependencies
 */
const getProjectDependencies = async (filePath: string): Promise<string> => {
  try {
    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**')
    const packageJsonFile = files.find(file => file.fsPath.includes(filePath))

    if (!packageJsonFile) {
      return ''
    }

    const content = await vscode.workspace.fs.readFile(packageJsonFile)
    const packageJson = JSON.parse(content.toString())

    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }

    return Object.keys(allDependencies).join(',')
  } catch (error) {
    logger.error('Error getting project dependencies:', error)
    return ''
  }
}

/**
 * Gets the current Git branch
 * @param filePath - The file path
 * @returns A promise that resolves to the current Git branch
 */
const getGitBranch = async (filePath: string): Promise<string> => {
  try {
    const gitExtension = vscode.extensions.getExtension<any>('vscode.git')?.exports
    const api = gitExtension?.getAPI(1)

    if (!api) {
      return ''
    }

    const repository = api.repositories.find((repo: any) => filePath.startsWith(repo.rootUri.fsPath))

    return repository?.state.HEAD?.name || ''
  } catch (error) {
    logger.error('Error getting Git branch:', error)
    return ''
  }
}

/**
 * Creates a system service for getting system information
 * @returns A system service instance
 */
export const createSystemService = () => ({
  getSystemInfo: async (filePath: string): Promise<SystemInfo> => {
    const [dependencies, branch] = await Promise.all([getProjectDependencies(filePath), getGitBranch(filePath)])

    return {
      machineId: getMachineId(),
      timezone: getTimezone(),
      dependencies,
      branch,
    }
  },
})

// Export the type
export type { SystemService } from '../types'

// Utility to detect the current IDE (Cursor, Windowsurf, VSCode, or Unknown)
export type IDEType = 'cursor' | 'windowsurf' | 'vscode' | 'unknown';

import { logger } from './logger'

/**
 * Detects the IDE type by inspecting environment variables and process globals.
 * This is robust for extension host context.
 * @returns IDEType
 */
export function getIDEType(): IDEType {
  // Log all relevant environment variables for debugging
  if (typeof process !== 'undefined' && process.env) {
    logger.info('[getIDEType] process.env.CURSOR:', process.env.CURSOR)
    logger.info('[getIDEType] process.env.CURSOR_VERSION:', process.env.CURSOR_VERSION)
    logger.info('[getIDEType] process.env.WINDSURF:', process.env.WINDSURF)
    logger.info('[getIDEType] process.env.WINDSURF_VERSION:', process.env.WINDSURF_VERSION)
    logger.info('[getIDEType] process.env.VSCODE_PID:', process.env.VSCODE_PID)
    logger.info('[getIDEType] process.env.VSCODE_IPC_HOOK:', process.env.VSCODE_IPC_HOOK)
    logger.info('[getIDEType] process.env.VSCODE_NLS_CONFIG:', process.env.VSCODE_NLS_CONFIG)
    if (process.env.CURSOR || process.env.CURSOR_VERSION) {
      logger.info('[getIDEType] Detected Cursor IDE')
      return 'cursor';
    }
    if (process.env.WINDSURF || process.env.WINDSURF_VERSION) {
      logger.info('[getIDEType] Detected Windowsurf IDE')
      return 'windowsurf';
    }
    if (process.env.VSCODE_PID || process.env.VSCODE_IPC_HOOK || process.env.VSCODE_NLS_CONFIG) {
      logger.info('[getIDEType] Detected VSCode IDE')
      return 'vscode';
    }
  } else {
    logger.info('[getIDEType] process or process.env not defined')
  }
  logger.info('[getIDEType] IDE unknown')
  return 'unknown';
}

/**
 * Detects if the current editor is an AI activity panel/tab, depending on the IDE.
 * For now, this is a placeholder for future logic.
 * @param editor - The VSCode text editor
 * @param ideType - The IDE type
 * @returns true if AI activity is detected, false otherwise
 */
export function detectAIActivity(editor: import('vscode').TextEditor | undefined, ideType: IDEType): boolean {
  logger.info(`[getIDEType] [detectAIActivity] IDE: ${ideType}`);
  if (!editor) return false;
  // TODO: Implement AI panel detection per IDE
  if (ideType === 'cursor') {
    // Placeholder for Cursor AI panel detection
    logger.info('[getIDEType] [detectAIActivity] (Cursor) No AI detection logic yet');
  } else if (ideType === 'vscode') {
    // Placeholder for VSCode AI panel detection
    logger.info('[getIDEType] [detectAIActivity] (VSCode) No AI detection logic yet');
  } else if (ideType === 'windowsurf') {
    // Placeholder for Windowsurf AI panel detection
    logger.info('[getIDEType] [detectAIActivity] (Windowsurf) No AI detection logic yet');
  }
  return false;
} 
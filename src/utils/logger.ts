/**
 * Log levels for the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none'

/**
 * Configuration for the logger
 */
export interface LoggerConfig {
  level: LogLevel
  prefix?: string
  enabled: boolean
}

/**
 * Logger interface
 */
export interface Logger {
  debug: (message: string, ...args: any[]) => void
  info: (message: string, ...args: any[]) => void
  warn: (message: string, ...args: any[]) => void
  error: (message: string, ...args: any[]) => void
  setLevel: (level: LogLevel) => void
  enable: () => void
  disable: () => void
  getConfig: () => LoggerConfig
  createChildLogger: (prefix: string) => Logger
}

/**
 * Creates a logger instance
 * @param config - Logger configuration
 * @returns A logger instance
 */
export const createLogger = (config: LoggerConfig): Logger => {
  let currentConfig = { ...config }

  const logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    none: 4,
  }

  const formatMessage = (message: string): string => {
    const timestamp = new Date().toISOString()
    const prefix = currentConfig.prefix ? `[${currentConfig.prefix}]` : ''
    return `[${timestamp}]${prefix} ${message}`
  }

  const shouldLog = (level: LogLevel): boolean => {
    return currentConfig.enabled && logLevels[level] >= logLevels[currentConfig.level]
  }

  const logger: Logger = {
    debug: (message: string, ...args: any[]): void => {
      if (shouldLog('debug')) {
        console.debug(formatMessage(message), ...args)
      }
    },

    info: (message: string, ...args: any[]): void => {
      if (shouldLog('info')) {
        console.info(formatMessage(message), ...args)
      }
    },

    warn: (message: string, ...args: any[]): void => {
      if (shouldLog('warn')) {
        console.warn(formatMessage(message), ...args)
      }
    },

    error: (message: string, ...args: any[]): void => {
      if (shouldLog('error')) {
        console.error(formatMessage(message), ...args)
      }
    },

    setLevel: (level: LogLevel): void => {
      currentConfig = { ...currentConfig, level }
    },

    enable: (): void => {
      currentConfig = { ...currentConfig, enabled: true }
    },

    disable: (): void => {
      currentConfig = { ...currentConfig, enabled: false }
    },

    getConfig: (): LoggerConfig => {
      return { ...currentConfig }
    },

    createChildLogger: (prefix: string): Logger => {
      return createLogger({
        level: currentConfig.level,
        prefix: currentConfig.prefix ? `${currentConfig.prefix}:${prefix}` : prefix,
        enabled: currentConfig.enabled,
      })
    },
  }

  return logger
}

import { IS_DEV } from './env'

/**
 * Default logger instance
 */
export const logger = createLogger({
  level: 'info',
  prefix: 'TimeFly',
  enabled: IS_DEV,
})


export const IS_DEV =
  process.env.NODE_ENV === 'development' ||
  process.env.VSCODE_DEBUG_MODE === 'true' ||
  process.env.TIMEFLY_DEBUG === 'true'; 
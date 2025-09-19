type Level = 'silent' | 'error' | 'warn' | 'info' | 'debug';

function levelToNum(l: Level): number {
  switch (l) {
    case 'silent': return 99;
    case 'error': return 40;
    case 'warn': return 30;
    case 'info': return 20;
    case 'debug': return 10;
    default: return 20;
  }
}

const CURRENT_LEVEL: Level = (process.env.SECURITY_LOG_LEVEL as Level) || 'info';
const CURRENT_NUM = levelToNum(CURRENT_LEVEL);

function logAt(minLevel: Level, ...args: any[]) {
  if (levelToNum(minLevel) >= CURRENT_NUM) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

export const logger = {
  error: (...args: any[]) => logAt('error', ...args),
  warn: (...args: any[]) => logAt('warn', ...args),
  info: (...args: any[]) => logAt('info', ...args),
  debug: (...args: any[]) => logAt('debug', ...args),
};


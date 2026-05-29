const isProduction = (): boolean => {
  return (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === 'production';
};

const isQuiet = (): boolean => {
  return (globalThis as any).process?.env?.EA_QUIET_LOGS === '1';
};

export const Logger = {
  info: (...args: any[]) => { if (!isProduction() && !isQuiet()) console.info(...args); },
  warn: (...args: any[]) => { if (!isProduction() && !isQuiet()) console.warn(...args); },
  error: (...args: any[]) => { console.error(...args); },
  log: (...args: any[]) => { if (!isProduction() && !isQuiet()) console.log(...args); },
};


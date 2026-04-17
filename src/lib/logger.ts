export const Logger = {
  info: (...args: any[]) => { if (import.meta.env.MODE !== 'production') console.info(...args); },
  warn: (...args: any[]) => { if (import.meta.env.MODE !== 'production') console.warn(...args); },
  error: (...args: any[]) => { console.error(...args); },
  log: (...args: any[]) => { if (import.meta.env.MODE !== 'production') console.log(...args); },
};


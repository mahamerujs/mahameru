export interface Logger {
  info(...data: unknown[]): void;
  error(message: unknown, error?: unknown): void;
  warn(...data: unknown[]): void;
  debug(...data: unknown[]): void;
}

export const createLogger = (name: string | string[], debug: boolean = false): Logger => {
  if (typeof name === 'string') {
    name = [`[${name}]`];
  } else {
    name = name.map((item) => `[${item}]`);
  }

  return {
    info: (...data: unknown[]) => {
      console.log(...name, '[Info]', ...data);
    },
    error: (message, error) => {
      if (typeof error !== 'undefined') {
        console.error(...name, '[Error]', message, error);
      } else {
        console.error(...name, '[Error]', message);
      }
    },
    warn: (...data: unknown[]) => {
      console.warn(...name, '[Warn]', ...data);
    },
    debug: (...data: unknown[]) => {
      if (debug) console.debug(...name, '[Debug]', ...data);
    },
  };
};

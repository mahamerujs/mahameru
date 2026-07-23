export interface Logger {
  info(...data: unknown[]): void;
  error(message: string, error?: unknown): void;
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
      // eslint-disable-next-line no-console
      console.log(...name, '[Info]', ...data);
    },
    error: (message, error) => {
      console.error(...name, `[Error] ${message}`, error);
    },
    warn: (...data: unknown[]) => {
      console.warn(...name, '[Warn]', ...data);
    },
    debug: (...data: unknown[]) => {
      // eslint-disable-next-line no-console
      if (debug) console.debug(...name, '[Debug]', ...data);
    },
  };
};

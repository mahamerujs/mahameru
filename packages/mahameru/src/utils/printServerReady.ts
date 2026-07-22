export function printServerReady({
  mode,
  host,
  port,
  version,
  hasError,
}: {
  mode: 'development' | 'production';
  host?: string;
  port?: number;
  version: string;
  hasError?: boolean;
}) {
  // eslint-disable-next-line no-console
  console.log(printServerReadyString({ mode, host, port, version, hasError }));
}

export function printServerReadyString({
  mode,
  host,
  port,
  version,
  hasError,
}: {
  mode: 'development' | 'production';
  host?: string;
  port?: number;
  version: string;
  hasError?: boolean;
}) {
  let message = `\x1b[36m▲ Mahameru\x1b[39m \x1b[32mServer Ready!\x1b[0m \x1b[90mv${version}\x1b[39m\n\n`;
  message += `  \x1b[1mMode:\x1b[22m    \x1b[36m${mode.charAt(0).toUpperCase() + mode.slice(1)}\x1b[0m\n`;

  if (host && port)
    message += `  \x1b[1mLocal:\x1b[22m   \x1b[36mhttp://${host === '::1' ? 'localhost' : host}:${port}\x1b[0m\n`;
  if (host) message += `  \x1b[1mHost:\x1b[22m    ${host === '::1' ? 'localhost' : host}\n`;
  if (port) message += `  \x1b[1mPort:\x1b[22m    ${port}\n`;

  if (!hasError) message += '\n\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n';

  return message;
}

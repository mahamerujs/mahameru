# MahameruJS CLI Utility

[![npm version](https://img.shields.io/npm/v/mahameru.svg)](https://www.npmjs.com/package/mahameru)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@mahameru/cli` is the command-line interface for building, running, and managing Mahameru-based applications.

## Installation

Install the CLI globally so the `mahameru` command is available from your terminal:

```bash
npm install -g @mahameru/cli
```

If you do not have a MahameruJS project yet, create one with:

```bash
npm create mahameru@latest
```

or:

```bash
npx create-mahameru@latest
```

## Command Reference

### `mahameru dev`

Start the MahameruJS development server with hot reload.

```bash
mahameru dev
mahameru dev --port 3000
mahameru dev --host localhost
```

Options:

- `-p, --port <number>` Port to run the server on
- `-H, --host <string>` Host to run the server on

Behavior:

- loads `mahameru.config.ts` (if present)
- runs TypeScript typechecking before each start or restart
- applies default config values when they are not provided
- runs the Mahameru application from the current project in development mode
- automatically generate routes types from `src/routes/**` (if present)
- automatically generate TypeORM data source types from `src/databases/**` (if present)
- watches `src/**` and `mahameru.config.ts`, then restarts automatically when files change

If typechecking fails, the error is shown in the console and the dev server waits for the next valid save before starting again.

### `mahameru build`

Build the production output for the current project.

```bash
mahameru build
```

Behavior:

- runs `tsc --project tsconfig.json`
- runs `tsc-alias -p tsconfig.json`
- outputs to `.mahameru`

### `mahameru start`

Request the Mahameru Process Manager daemon to start the current project in production mode.

```bash
mahameru start
mahameru start --port 8000
mahameru start --host 127.0.0.1
```

Options:

- `-p, --port <number>` Port to run the app on. Default: `8000`
- `-H, --host <string>` Host to run the app on. Default: `127.0.0.1`

Important:

- this command does not directly boot `.mahameru/` by itself
- it connects to the Mahameru PM daemon over IPC and asks the daemon to fork the current project
- the MahameruJS Process Manager must already be running, either through `mahameru pm start` or `mahameru pm service install`
- on Windows, Mahameru may request elevation automatically when the daemon is running with Administrator privileges

### `mahameru stop`

Request the Mahameru Process Manager daemon to stop the current managed project.

```bash
mahameru stop
```

Important:

- this command depends on the Mahameru PM daemon being available
- it stops the managed project registered under the current package name

### `mahameru status`

Show the status of the current managed project.

```bash
mahameru status
```

Important:

- this command depends on the Mahameru PM daemon being available
- it shows the managed project status, PID, host, port, and root path
- on Windows, Mahameru may request elevation automatically when connecting to an elevated daemon

## Process Manager

The Process Manager is responsible for hosting managed production apps and exposing a small management server.

### `mahameru pm start`

Start the Mahameru Process Manager manually.

```bash
mahameru pm start
mahameru pm start --port 8000 --host 127.0.0.1
mahameru pm start --cert ./cert.pem --key ./key.pem
mahameru pm start --daemon
```

Options:

- `-p, --port <number>` Port to run the server on. Default: `8000`
- `-H, --host <string>` Host to run the server on. Default: `127.0.0.1`
- `--cert <string>` Path to the SSL certificate file
- `--key <string>` Path to the SSL key file
- `-d, --daemon` Run as a daemon

Notes:

- HTTPS is enabled only when both `--cert` and `--key` are provided
- the Process Manager serves the management UI and API
- the Process Manager also restores previously running managed projects on startup when available

### `mahameru pm status`

```bash
mahameru pm status
```

This command exists in the CLI, but it is not implemented yet.

### `mahameru pm service install`

Install the Mahameru Process Manager as a system service.

```bash
mahameru pm service install
mahameru pm service install --port 8080 --host 127.0.0.1
mahameru pm service install --cert ./cert.pem --key ./key.pem
```

Options:

- `-p, --port <number>` Port to run the server on. Default: `8080`
- `-H, --host <string>` Host to run the server on. Default: `127.0.0.1`
- `--cert <string>` Path to the SSL certificate file
- `--key <string>` Path to the SSL key file

Notes:

- this registers the Process Manager to start with the operating system
- Administrator or root privileges may be required, depending on the platform

### `mahameru pm service uninstall`

Uninstall the Mahameru Process Manager service.

```bash
mahameru pm service uninstall
```

Administrator or root privileges may be required.

### `mahameru pm service start`

Start the installed Mahameru Process Manager service.

```bash
mahameru pm service start
```

Administrator or root privileges may be required.

### `mahameru pm service stop`

Stop the installed Mahameru Process Manager service.

```bash
mahameru pm service stop
mahameru pm service stop --graceful
```

Options:

- `-g, --graceful` Gracefully stop the service

Administrator or root privileges may be required.

### `mahameru pm service status`

Show the installed service status.

```bash
mahameru pm service status
```

This command reports the Process Manager service status for the current platform.

## Configuration

MahameruJS Process Manager config file can be found at:

- Windows: C:\Users\yourUsername\AppData\Roaming\mahameru\pm.config.json
- MacOS: /Users/yourUsername/Library/Application Support/mahameru/pm.config.json
- Linux: /etc/mahameru/pm.config.json

You can add new users or change passwords to the config file. Note that roles should be one of `admin` or `user`.

## Recommended Workflow

For local development:

1. Run `mahameru dev`.
2. Make changes inside `src/**` and let the dev server restart automatically.

For production-style managed runs:

1. Run `mahameru build`.
2. Start the Process Manager with `mahameru pm start`, or install it with `mahameru pm service install`.
3. Run `mahameru start` from your project directory to register and start the app through the daemon.
4. Use `mahameru status` to inspect the managed project.
5. Use `mahameru stop` to stop it.

## Notes

- If `mahameru.config.ts` is missing, development commands will fail.
- If `tsx`, `typescript`, or `tsc-alias` are not installed in the project, the related command will fail.
- `mahameru dev` ignores changes inside `dist/` and `node_modules/`.
- `mahameru start`, `mahameru stop`, and `mahameru status` are PM-daemon-backed commands, not standalone local process commands.

import pc from 'picocolors';
import { ChildProcess, fork } from 'node:child_process';
import { extname, join } from 'node:path';
import net from 'node:net';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { IPC_SOCKET_PATH, IS_WINDOWS, MAHAMERU_TITLE } from '../constants';
import {
  ClientToServerEvents,
  InterServerEvents,
  ManagedProject,
  Payload,
  PayloadDelete,
  ProcessResponse,
  Project,
  ProjectNamePayload,
  ServerToClientEvents,
  SocketData,
} from '../types';
import {
  deleteProject as deleteProjectByName,
  deleteSocket,
  getProject,
  getProjects,
  getSockets,
  loadProjects,
  saveProjects,
  setProject,
  setProjects,
  setSocket,
} from './';
import { parseProject } from '../utils/parse-project';
import { freePortFinder } from '../utils/free-port-finder';
import fs, { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { Server as IOServer } from 'socket.io';
import { LoginRole, ProcessManagerConfig } from '@/types/pm.config';
import { parseCookies } from '@/utils/parse-cookies';
import { chownR } from '@/utils/chownr';
import { mkdir, writeFile } from 'node:fs/promises';
import { createTimestampTransformer } from '@/utils/format-log';

const DIST_DIR = join(__dirname, 'mpm');

const MIME_TYPES: { [key: string]: string } = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export const processManager = async (
  { host, port, daemon, cert, key, logins }: ProcessManagerConfig & { daemon: boolean },
  version: string,
) => {
  try {
    const adminLogin = logins.find((login) => login.role === LoginRole.ADMIN);

    if (!adminLogin) throw new Error('Admin login not found');

    const isDev = process.env.MPM_DEV === 'true';
    const isHttps = cert && key;
    const initialProjects = await loadProjects();
    setProjects(initialProjects);

    const availablePort = await freePortFinder(port);
    const handleHttpRequest = (
      request: IncomingMessage,
      response: ServerResponse<IncomingMessage> & { req: IncomingMessage },
    ) => {
      if (isDev) {
        response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      response.setHeader('X-Powered-By', 'MahameruJS');

      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        return response.end();
      }

      if (
        (request.url === '/api/auth/login' || request.url === '/api/auth/login/') &&
        request.method === 'POST'
      ) {
        let rawBody = '';

        request.on('data', (chunk) => {
          rawBody += chunk.toString();
        });

        request.on('end', () => {
          try {
            const body = JSON.parse(rawBody) as
              { username?: unknown; password?: unknown } | undefined | null;

            if (!body) throw new Error('Body cannot be empty');

            if (
              !body.username ||
              !body.password ||
              typeof body.username !== 'string' ||
              typeof body.password !== 'string'
            )
              throw new Error('Invalid username or password');

            const login = logins.find(
              (login) => login.username === body.username && login.password === body.password,
            );

            if (!login) throw new Error('Invalid username or password');

            const token = Buffer.from(`${body.username}:${body.password}`).toString('base64');
            const cookieMaxAge = 60 * 60 * 24 * 30;

            response.setHeader(
              'Set-Cookie',
              `mahameru_pm_token=${token}; Max-Age=${cookieMaxAge}; HttpOnly; Path=/;${isHttps ? ' Secure;' : ''} SameSite=Strict;`,
            );

            const { password, ...data } = login;
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ success: true, data }));
            return;
          } catch (error) {
            if (!response.headersSent) {
              if (error instanceof Error) {
                response.writeHead(400, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ success: false, message: error.message }));
              } else {
                console.error(error);
                response.writeHead(500, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ success: false, message: 'Internal server error' }));
              }
            }
            return;
          }
        });

        return;
      }

      if (
        (request.url === '/api/auth/session' || request.url === '/api/login/session') &&
        request.method === 'POST'
      ) {
        const rawCookies = request.headers.cookie;

        if (!rawCookies) {
          response.writeHead(200, { 'Content-Type': 'application/json' });

          return response.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        }

        const cookies = parseCookies(rawCookies);

        if (!cookies.mahameru_pm_token) {
          response.writeHead(200, { 'Content-Type': 'application/json' });

          return response.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        }

        const [username, password] = Buffer.from(cookies.mahameru_pm_token, 'base64')
          .toString()
          .split(':');

        const data = logins.find(
          (login) => login.username === username && login.password === password,
        );

        if (!data) {
          response.setHeader(
            'Set-Cookie',
            `mahameru_pm_token=; Max-Age=0; HttpOnly; Path=/;${isHttps ? ' Secure;' : ''} SameSite=Strict;`,
          );
          response.writeHead(401, { 'Content-Type': 'application/json' });

          return response.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        }

        response.writeHead(200, { 'Content-Type': 'application/json' });
        return response.end(JSON.stringify({ success: true, data }));
      }

      if (
        (request.url === '/api/auth/logout' || request.url === '/api/login/logout') &&
        request.method === 'POST'
      ) {
        const rawCookies = request.headers.cookie;

        if (!rawCookies) {
          response.writeHead(401, { 'Content-Type': 'application/json' });

          return response.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        }

        const cookies = parseCookies(rawCookies);

        if (!cookies.mahameru_pm_token) {
          response.writeHead(401, { 'Content-Type': 'application/json' });

          return response.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        }

        response.setHeader(
          'Set-Cookie',
          `mahameru_pm_token=; Max-Age=0; HttpOnly; Path=/;${isHttps ? ' Secure;' : ''} SameSite=Strict;`,
        );

        response.writeHead(200, { 'Content-Type': 'application/json' });
        return response.end(JSON.stringify({ success: true }));
      }

      if (request.url === '/api/process' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        const projectList = getProjects().map(parseProject);

        return response.end(JSON.stringify(projectList));
      }

      if (request.method === 'GET') {
        const safeUrl = request.url === '/' ? '/index.html' : request.url;
        let filePath = join(DIST_DIR, safeUrl!);

        if (!filePath.startsWith(DIST_DIR)) {
          response.writeHead(403, { 'Content-Type': 'text/plain' });
          return response.end('Forbidden');
        }

        fs.access(filePath, fs.constants.F_OK, (err) => {
          if (!err) {
            const ext = extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            response.writeHead(200, { 'Content-Type': contentType });
            return fs.createReadStream(filePath).pipe(response);
          } else {
            const indexPath = join(DIST_DIR, 'index.html');

            fs.access(indexPath, fs.constants.F_OK, (indexErr) => {
              if (!indexErr) {
                response.writeHead(200, { 'Content-Type': 'text/html' });
                return fs.createReadStream(indexPath).pipe(response);
              } else {
                response.writeHead(404, { 'Content-Type': 'text/html' });
                return response.end('<h1>404 - Frontend Build Not Found</h1>');
              }
            });
          }
        });

        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/html' });

      return response.end(
        JSON.stringify({
          success: false,
          message: 'Route Not Found',
        }),
      );
    };
    const handleHttpOnClose = () => console.log('[MPM] HTTP server closed.');
    const handleHttpOnError = (error: any) => console.log('[MPM] HTTP server error:', error);
    const handleHttpListen = async () => {
      if (!process.send && !daemon) {
        console.clear();
        console.log(`${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`Process Manager v${version}`)}\n`);
      }

      console.log(`Server listening on host ${host} and port ${port}.`);

      if (!process.send && !daemon) {
        let data = '';
        data += `         ${pc.bold(pc.green('PID'))}: ${process.pid}\n`;
        data += `         ${pc.bold(pc.green('URL'))}: ${isHttps ? 'https' : 'http'}://${host}:${port}\n`;
        data += `${pc.bold(pc.green('API Endpoint'))}: ${isHttps ? 'https' : 'http'}://${host}:${port}/api/process\n`;
        data += `    ${pc.bold(pc.green('Username'))}: ${pc.cyan(adminLogin.username)}\n`;
        data += `    ${pc.bold(pc.green('password'))}: ${pc.cyan(adminLogin.password)}\n`;
        data += `\n${pc.dim('Press Ctrl+C to stop the server')}\n`;

        console.log(data);
      }

      for (const project of initialProjects) {
        if (project.isLastStatusIsRunning) {
          console.log(`[MPM] Starting project ${project.name}`);
          await startProject(project);
          console.log(`[MPM] Project ${project.name} started`);
        }
      }
    };
    const httpServer =
      cert && key
        ? createHttpsServer(
            {
              cert: fs.readFileSync(cert),
              key: fs.readFileSync(key),
            },
            handleHttpRequest,
          )
            .on('close', handleHttpOnClose)
            .on('error', handleHttpOnError)
            .listen(availablePort, host, handleHttpListen)
        : createHttpServer(handleHttpRequest)
            .on('close', handleHttpOnClose)
            .on('error', handleHttpOnError)
            .listen(availablePort, host, handleHttpListen);

    if (!IS_WINDOWS) {
      const fs = require('fs');

      if (fs.existsSync(IPC_SOCKET_PATH)) fs.unlinkSync(IPC_SOCKET_PATH);
    }

    const handleStdout = (projectName: string) => (data: any) => {
      const logString = data.toString().trim();

      console.log(`[${projectName}] ${logString}`);
    };

    const handleStderr = (projectName: string) => (data: any) => {
      const errorString = data.toString().trim();

      console.error(`[${projectName} ERROR] ${errorString}`);
    };

    const handleMessage =
      (socket: net.Socket | null, projectName: string, child: ChildProcess) =>
      ({ type, data }: MahameruIPCMessageServer) => {
        if (!socket) return;

        if (type === 'ERROR') {
          socket.write(
            JSON.stringify({
              success: false,
              message: data,
            }),
          );
        } else if (type === 'READY') {
          console.log(
            `[MPM] Project${projectName} successfully started by PM Daemon (PID: ${child.pid})`,
          );

          socket.write(
            JSON.stringify({
              success: true,
              message: `Project ${projectName} successfully started by PM Daemon (PID: ${child.pid})`,
              data,
              mpmUrl: `http://${host}:${port}`,
            }),
          );
        } else if (type === 'PROCESS_USAGE') {
          const project = getProject(projectName);

          if (project) socketServer.emit('process-usage', { data, project: parseProject(project) });
        }
      };

    const handleError = (projectName: string) => (error: any) => {
      console.log(`[MPM] Project ${projectName} errored: ${error.message}`);
    };

    const toSuccess = <T>(data: T): ProcessResponse<T> => ({ success: true, data });
    const toError = <T>(error: string): ProcessResponse<T> => ({ success: false, error });
    const getProjectSnapshot = (project: ManagedProject) => parseProject(project);
    const getProjectsSnapshot = () => getProjects().map(parseProject);
    const logDeleteAudit = (message: string) => {
      console.log(`[MPM] ${message}`);
    };
    const broadcastProjects = () => {
      socketServer.emit('projects', getProjectsSnapshot());
    };

    const getRunnerScript = (
      project: Pick<ManagedProject, 'rootPath' | 'entryFilePath' | 'packageJson'>,
    ) => {
      const mainFile = project.packageJson.main;
      const runnerScript = join(project.rootPath, 'node_modules', 'mahameru', 'server.js');

      if (project.entryFilePath) {
        if (!existsSync(project.entryFilePath))
          throw new Error(`Custom entry file path is not found! Path: ${project.entryFilePath}`);

        return project.entryFilePath;
      }

      if (mainFile) {
        const mainFilePath = join(project.rootPath, mainFile);
        if (!existsSync(mainFilePath))
          throw new Error(
            `We detect "main" entry from your package.json but file is not found! Path: ${pc.bold(pc.white(mainFilePath))}.\nIf this is ${MAHAMERU_TITLE} Project you can remove property main from package.json. And try ${pc.bold(pc.cyan('mahameru start'))} again.\nIf this is a custom app please correct main entry in package.json and try ${pc.bold(pc.cyan('mahameru start'))} again, or specify custom entry file with ${pc.bold(pc.cyan('mahameru start custom-entry.js'))}.`,
          );

        return mainFilePath;
      }

      if (!existsSync(runnerScript))
        throw new Error(
          `${MAHAMERU_TITLE} package is not installed in ${project.rootPath} project. Please install it by running: npm install mahameru.\n\nIf you want to use a custom entry file or want to run custom app to ${MAHAMERU_TITLE} Process Manager, please use ${pc.bold(pc.cyan('mahameru start custom-entry.js'))}.`,
        );

      return runnerScript;
    };

    const createProjectEnv = (project: Pick<ManagedProject, 'rootPath' | 'host' | 'port'>) => ({
      MAHAMERU__SEND_PROCESS_USAGE_INTERVAL: '3000',
      MAHAMERU__ROOT_PATH: project.rootPath,
      MAHAMERU__MODE: 'production',
      ...(project.host ? { MAHAMERU__HTTP_LISTEN_HOST: project.host } : {}),
      ...(project.port ? { MAHAMERU__HTTP_LISTEN_PORT: project.port.toString() } : {}),
    });

    const attachChildProcessListeners = async (
      project: ManagedProject,
      child: ChildProcess,
      socket: net.Socket | null = null,
    ) => {
      const logFilePath = join(project.rootPath, 'logs', 'out.log');
      const errorFilePath = join(project.rootPath, 'logs', 'error.log');

      if (!existsSync(project.logDirPath)) await mkdir(project.logDirPath, { recursive: true });

      if (!existsSync(logFilePath)) await writeFile(logFilePath, '', 'utf-8');

      if (!existsSync(errorFilePath)) await writeFile(errorFilePath, '', 'utf-8');

      if (process.env.SUDO_UID && process.env.SUDO_GID)
        await chownR(
          project.logDirPath,
          parseInt(process.env.SUDO_UID),
          parseInt(process.env.SUDO_GID),
        );

      const logStream = createWriteStream(logFilePath, { flags: 'a' });
      const errorStream = createWriteStream(errorFilePath, { flags: 'a' });

      child.stdout?.pipe(createTimestampTransformer()).pipe(logStream);
      child.stderr?.pipe(createTimestampTransformer()).pipe(errorStream);

      if (!daemon) {
        child.stdout?.on('data', handleStdout(project.name));
        child.stderr?.on('data', handleStderr(project.name));
      }

      child.on('message', handleMessage(socket, project.name, child));
      child.on('error', handleError(project.name));
      child.once('exit', (code) => {
        if (project.child !== child) return;

        if (!getProject(project.name)) return;

        project.status = code === 0 || code === null ? 'stopped' : 'errored';
        project.pid = undefined;
        project.child = undefined;

        socketServer.emit('project-update', getProjectSnapshot(project));
        broadcastProjects();
      });
    };

    const waitForChildMessage = <T extends MahameruIPCMessageServer['type']>(
      child: ChildProcess,
      expectedTypes: T[],
    ) =>
      new Promise<Extract<MahameruIPCMessageServer, { type: T }>>((resolve) => {
        const handleChildMessage = (message: MahameruIPCMessageServer) => {
          if (!expectedTypes.includes(message.type as T)) return;

          child.off('message', handleChildMessage);
          resolve(message as Extract<MahameruIPCMessageServer, { type: T }>);
        };

        child.on('message', handleChildMessage);
      });

    const startProject = (project: ManagedProject, socket: net.Socket | null = null) =>
      new Promise<ManagedProject>(async (resolve, reject) => {
        let settled = false;

        const settle = (handler: () => void) => {
          if (settled) return;

          settled = true;
          handler();
        };

        try {
          const runnerScript = getRunnerScript(project);
          const child = fork(runnerScript, [], {
            cwd: project.rootPath,
            env: {
              ...process.env,
              ...(!project.entryFilePath && createProjectEnv(project)),
            },
            stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
          });

          project.status = 'stopped';
          project.pid = child.pid;
          project.child = child;
          setProject(project);

          await attachChildProcessListeners(project, child, socket);

          child.once('error', (error) => {
            settle(() => {
              project.status = 'errored';
              project.pid = undefined;
              project.child = undefined;
              setProject(project);

              reject(error);
            });
          });

          child.once('exit', (code) => {
            settle(() => {
              project.status = code === 0 || code === null ? 'stopped' : 'errored';
              project.pid = undefined;
              project.child = undefined;
              setProject(project);

              reject(
                new Error(
                  `Project ${project.name} exited before ready${typeof code === 'number' ? ` with code ${code}` : ''}`,
                ),
              );
            });
          });

          if (!project.entryFilePath && !project.packageJson.main) {
            waitForChildMessage(child, ['READY', 'ERROR']).then(({ type, data }) => {
              if (type === 'READY') {
                settle(async () => {
                  project.status = 'running';
                  project.pid = child.pid;
                  project.child = child;
                  project.port = data.port;
                  project.host = data.host;

                  setProject(project);
                  await saveProjects();
                  resolve(project);
                });
              } else if (type === 'ERROR') {
                settle(() => {
                  // project.status = 'errored';
                  // project.pid = undefined;
                  // project.child = undefined;
                  // setProject(project)

                  reject(`[MPM] ${data.message}`);
                });
              }
            });
          } else {
            settle(async () => {
              project.status = 'running';
              project.pid = child.pid;
              project.child = child;

              setProject(project);
              await saveProjects();

              socket?.write(
                JSON.stringify({
                  success: true,
                  message: `Project ${project.name} successfully started by PM Daemon (PID: ${child.pid})`,
                  data: {
                    port: project.port,
                    host: project.host,
                    pid: child.pid,
                  },
                  mpmUrl: `http://${project.host}:${project.port}`,
                }),
              );
              resolve(project);
            });
          }
        } catch (error) {
          settle(() => {
            project.status = 'errored';
            project.pid = undefined;
            project.child = undefined;
            setProject(project);

            reject(error);
          });
        }
      });

    const stopProject = (project: ManagedProject) =>
      new Promise<ManagedProject>((resolve, reject) => {
        setProject({ ...project, status: 'stopping' });

        if (!project.child) {
          project.status = 'stopped';
          project.pid = undefined;
          setProject(project);

          resolve(project);
          return;
        }

        const child = project.child;
        let settled = false;

        const settle = (handler: () => void) => {
          if (settled) return;

          settled = true;
          handler();
        };

        child.once('error', (error) => {
          settle(() => {
            project.status = 'errored';
            project.pid = undefined;
            project.child = undefined;
            setProject(project);

            reject(error);
          });
        });

        child.once('exit', (code) => {
          settle(() => {
            project.status = code === 0 || code === null ? 'stopped' : 'errored';
            project.pid = undefined;
            project.child = undefined;
            setProject(project);

            if (code === 0 || code === null) {
              resolve(project);
              return;
            }

            reject(new Error(`Project ${project.name} exited during shutdown with code ${code}`));
          });
        });

        if (!project.entryFilePath && !project.packageJson.main) {
          waitForChildMessage(child, ['SHUTDOWN_DONE']).then(({ type }) => {
            if (type !== 'SHUTDOWN_DONE') return;

            settle(() => {
              project.status = 'stopped';
              project.pid = undefined;
              project.child = undefined;
              setProject(project);

              resolve(project);
            });
          });

          child.send({ type: 'SHUTDOWN' } as MahameruIPCMessageChild);
        } else {
          child.send('SHUTDOWN');
        }
      });

    const deleteProject = async (projectName: string): Promise<Project> => {
      logDeleteAudit(`Delete requested for project "${projectName}"`);

      const existingProject = getProject(projectName);

      if (!existingProject) {
        logDeleteAudit(`Delete aborted. Project "${projectName}" not found`);
        throw new Error('Project not found');
      }

      const deletedSnapshot = getProjectSnapshot(existingProject);

      if (existingProject.child) {
        logDeleteAudit(`Project "${projectName}" is running. Stopping before delete`);
        await stopProject(existingProject);
      } else {
        existingProject.status = 'stopped';
        existingProject.pid = undefined;
        existingProject.child = undefined;
        setProject(existingProject);
        logDeleteAudit(`Project "${projectName}" already stopped. Proceeding to delete`);
      }

      const latestProject = getProject(projectName);
      const finalSnapshot = latestProject ? getProjectSnapshot(latestProject) : deletedSnapshot;

      logDeleteAudit(`Deleting project "${projectName}" from registry`);
      deleteProjectByName(projectName);
      logDeleteAudit(
        `Project "${projectName}" exists after delete: ${getProject(projectName) ? 'true' : 'false'}`,
      );
      logDeleteAudit(`Emitting project-delete for "${projectName}"`);
      socketServer.emit('project-delete', finalSnapshot);
      broadcastProjects();

      deleteProjectByName(projectName);
      await saveProjects();

      return finalSnapshot;
    };

    const ipcServer = net.createServer((socket) => {
      socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.command === 'START') {
            const payload = message.payload as Payload;
            const {
              packageJson: { name: projectName, description, version },
              projectRoot,
              port,
              host,
              entryFilePath,
              logDirPath,
            } = payload;

            const project = getProject(projectName);

            if (
              project &&
              project.status === 'running' &&
              typeof project.child !== 'undefined' &&
              typeof project.pid !== 'undefined'
            ) {
              socket.write(JSON.stringify({ status: 'error', message: 'Project already running' }));

              return;
            }

            console.log(`[MPM] Starting project: ${projectName} (${entryFilePath || projectRoot})`);

            const newProject: ManagedProject = {
              id: getProjects().length + 1,
              pid: undefined,
              createdAt: project?.createdAt ?? new Date().toISOString(),
              isDisabled: false,
              name: projectName,
              mode: 'production',
              description,
              version,
              rootPath: projectRoot,
              entryFilePath,
              logDirPath,
              host: host,
              port: port,
              status: 'stopped',
              packageJson: payload.packageJson,
            };

            setProject(newProject);

            startProject(newProject, socket)
              .then((startedProject) => {
                if (project) {
                  socketServer.emit('project-update', getProjectSnapshot(startedProject));
                } else {
                  socketServer.emit('project-create', getProjectSnapshot(startedProject));
                }
                broadcastProjects();
              })
              .catch((error: Error) => {
                socket.write(JSON.stringify({ success: false, error: error.message }));
              });
          } else if (message.command === 'STOP') {
            const payload = message.payload as ProjectNamePayload;
            const project = getProject(payload.name);

            if (!project) {
              socket.write(JSON.stringify({ success: false, error: 'Project not found' }));

              return;
            }

            stopProject(project)
              .then((stoppedProject) => {
                stoppedProject.isLastStatusIsRunning = false;
                setProject(stoppedProject);
                socketServer.emit('project-update', getProjectSnapshot(stoppedProject));
                broadcastProjects();
                socket.write(JSON.stringify(toSuccess(getProjectSnapshot(stoppedProject))));
              })
              .catch((error: Error) => {
                socket.write(JSON.stringify(toError<Project>(error.message)));
              });
          } else if (message.command === 'RESTART') {
          } else if (message.command === 'STATUS') {
            const payload = message.payload as ProjectNamePayload;
            const project = getProject(payload.name);

            if (project) {
              const { child, ...rest } = project;

              socket.write(
                JSON.stringify({
                  success: true,
                  data: rest,
                }),
              );
            } else {
              socket.write(JSON.stringify({ success: false, error: 'Project not found' }));
            }
          } else if (message.command === 'DELETE') {
            const payload = message.payload as PayloadDelete;
            const packageJson = payload.packageJson;
            const project = getProject(packageJson.name);

            if (!project) {
              socket.write(
                JSON.stringify({
                  success: false,
                  error: `Project ${payload.packageJson.name} not found`,
                }),
              );

              return;
            }

            deleteProject(project.name)
              .then((startedProject) => {
                socketServer.emit('project-delete', getProjectSnapshot(startedProject));
                broadcastProjects();
                socket.write(
                  JSON.stringify({
                    success: true,
                    message: `Project ${project.name} successfully deleted`,
                  }),
                );
              })
              .catch((error: Error) => {
                socket.write(JSON.stringify({ success: false, error: error.message }));
              });
          } else if (message.command === 'LIST') {
            socket.write(
              JSON.stringify({
                success: true,
                data: getProjects().map(parseProject),
              }),
            );
          }
        } catch (err: any) {
          socket.write(JSON.stringify({ success: false, error: err.message }));
        }
      });
    });

    ipcServer.on('close', () => {
      console.log('[MPM IPC SERVER] IPC Server closed');
    });

    ipcServer.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.error(`[MPM IPC SERVER] IPC Server already running on ${IPC_SOCKET_PATH}`);
      } else {
        console.error('[MPM IPC SERVER]', error);
      }

      process.exit(1);
    });

    ipcServer.listen(IPC_SOCKET_PATH, () => {
      console.log(`[MPM IPC SERVER] IPC Server listening on ${IPC_SOCKET_PATH}`);
    });

    const socketServer = new IOServer<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(httpServer, {
      cors: {
        origin: '*',
      },
      path: '/ws',
      serveClient: false,
    });

    socketServer.use((socket, next) => {
      try {
        if (!socket.handshake.headers.cookie) throw new Error('unauthorized');

        const cookies = parseCookies(socket.handshake.headers.cookie);

        if (!cookies.mahameru_pm_token) {
          throw new Error('unauthorized');
        }

        const [username, password] = Buffer.from(cookies.mahameru_pm_token, 'base64')
          .toString()
          .split(':');

        const data = logins.find(
          (login) => login.username === username && login.password === password,
        );

        if (!data) throw new Error('unauthorized');

        socket.data.login = data;

        next();
      } catch (err: any) {
        next(new Error(err.message));
      }
    });
    socketServer.on('connection', (socket) => {
      setSocket(socket);

      const parsedProjects = getProjects().map(parseProject);

      socket.emit('projects', parsedProjects);

      socket.on('getProjects', (callback) => {
        const parsedProjects = getProjects().map(parseProject);

        return callback({ success: true, data: parsedProjects });
      });

      socket.on('start', (name, callback) => {
        const project = getProject(name);

        if (!project) return callback(toError('Project not found'));

        if (project.child || project.status === 'running')
          return callback(toError(`Project ${name} is already running`));

        startProject(project)
          .then((startedProject) => {
            socketServer.emit('project-update', getProjectSnapshot(startedProject));
            broadcastProjects();
            callback(toSuccess(getProjectSnapshot(startedProject)));
          })
          .catch((error: Error) => {
            callback(toError(error.message));
          });
      });

      socket.on('stop', (name, callback) => {
        const project = getProject(name);

        if (!project) return callback(toError('Project not found'));

        stopProject(project)
          .then(async (stoppedProject) => {
            stoppedProject.isLastStatusIsRunning = false;
            await saveProjects(stoppedProject);
            socketServer.emit('project-update', getProjectSnapshot(stoppedProject));
            broadcastProjects();
            callback(toSuccess(getProjectSnapshot(stoppedProject)));
          })
          .catch((error: Error) => {
            callback(toError(error.message));
          });
      });

      const handleDelete =
        (eventName: 'delete' | 'remove') =>
        (name: string, callback: (response: ProcessResponse<Project>) => void) => {
          logDeleteAudit(`Socket event "${eventName}" received for project "${name}"`);

          deleteProject(name)
            .then((deletedProject) => {
              logDeleteAudit(`Invoking delete callback for project "${name}"`);
              callback(toSuccess(deletedProject));
            })
            .catch((error: Error) => {
              logDeleteAudit(`Delete failed for project "${name}": ${error.message}`);
              callback(toError(error.message));
            });
        };

      socket.on('delete', handleDelete('delete'));
      socket.on('remove', handleDelete('remove'));

      socket.on('disconnect', () => {
        deleteSocket(socket.id);
      });
    });

    let isShuttingDown = false;

    const shutdown = async (signal: NodeJS.Signals) => {
      if (isShuttingDown) return;

      isShuttingDown = true;
      console.log(`[MPM] Received ${signal}`);

      const projects = getProjects();

      for (const project of projects) {
        if (project.status === 'running') {
          console.log(`[MPM] Stopping project ${project.name}`);

          const stoppedProject = await stopProject(project);
          stoppedProject.isLastStatusIsRunning = true;

          console.log(`[MPM] Project ${project.name} stopped`);

          setProject(stoppedProject);
        }
      }

      await saveProjects();

      getSockets().forEach((socket) => socket.disconnect());
      socketServer.close();
      ipcServer.close();
      httpServer.close((error) => {
        if (error) {
          console.log('[MPM]', error);
        }

        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.log('mpm error', error);

    process.exit(1);
  }
};

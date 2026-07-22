import type { ChildProcess } from 'node:child_process';

export function stopChildProcess(child: ChildProcess | null) {
  return new Promise<void>((resolve) => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    child.once('close', () => resolve());
    child.kill('SIGTERM');
  });
}

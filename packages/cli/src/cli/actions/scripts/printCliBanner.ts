import pc from 'picocolors';

export function printCliBanner(version: string) {
  console.log(`${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`CLI v${version}`)}\n`);
}

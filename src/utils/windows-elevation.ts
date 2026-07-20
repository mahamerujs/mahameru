import { spawnSync } from 'node:child_process';

const ELEVATED_RETRY_ENV = 'MAHAMERU_ELEVATED_RETRY';
const ELEVATED_CWD_ENV = 'MAHAMERU_ELEVATED_CWD';

function escapePowerShellSingleQuotedString(value: string) {
    return value.replace(/'/g, "''");
}

function toPowerShellArray(values: string[]) {
    return `@(${values.map((value) => `'${escapePowerShellSingleQuotedString(value)}'`).join(', ')})`;
}

export function hasWindowsElevationRetry() {
    return process.env[ELEVATED_RETRY_ENV] === '1';
}

export function getWindowsElevatedWorkingDirectory() {
    return process.env[ELEVATED_CWD_ENV];
}

export function isWindowsProcessElevated() {
    if (process.platform !== 'win32')
        return false;

    const result = spawnSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
    ], {
        encoding: 'utf8',
        windowsHide: true
    });

    if (result.status !== 0)
        return false;

    return result.stdout.trim().toLowerCase() === 'true';
}

export function relaunchCurrentProcessAsAdmin(workingDirectory: string) {
    if (process.platform !== 'win32')
        return { ok: false as const, reason: 'unsupported-platform' as const };

    const cliEntrypoint = process.argv[1];

    if (!cliEntrypoint)
        return { ok: false as const, reason: 'missing-entrypoint' as const };

    const nodeArgs = [cliEntrypoint, ...process.argv.slice(2)];
    const envAssignment = `$env:${ELEVATED_RETRY_ENV}='1'`;
    const cwdAssignment = `$env:${ELEVATED_CWD_ENV}='${escapePowerShellSingleQuotedString(workingDirectory)}'`;
    const command = [
        envAssignment,
        cwdAssignment,
        `Set-Location -LiteralPath '${escapePowerShellSingleQuotedString(workingDirectory)}'`,
        `& '${escapePowerShellSingleQuotedString(process.execPath)}' ${nodeArgs.map((arg) => `'${escapePowerShellSingleQuotedString(arg)}'`).join(' ')}`,
        '',
        'Write-Host ""',
        'Write-Host "Mahameru elevated session finished. Review any output above." -ForegroundColor Cyan',
        'Write-Host "Press Enter to close this Administrator window." -ForegroundColor DarkGray',
        'Read-Host | Out-Null'
    ].join('; ');
    const argumentList = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-NoExit',
        '-Command',
        command
    ];

    const startProcessCommand = [
        '$argumentList = ' + toPowerShellArray(argumentList),
        `Start-Process -FilePath 'powershell.exe' -Verb RunAs -WorkingDirectory '${escapePowerShellSingleQuotedString(workingDirectory)}' -ArgumentList $argumentList`
    ].join('; ');

    const result = spawnSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        startProcessCommand
    ], {
        encoding: 'utf8',
        windowsHide: true
    });

    if (result.status === 0)
        return { ok: true as const };

    const errorText = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    const wasCancelled = /cancelled by the user|canceled by the user/i.test(errorText);

    return {
        ok: false as const,
        reason: wasCancelled ? 'user-cancelled' as const : 'spawn-failed' as const,
        errorText
    };
}

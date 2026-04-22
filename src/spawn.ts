import { SpawnStatus } from '@codifycli/schemas';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import stripAnsi from 'strip-ansi';

import { Shell, ShellUtils } from './shell.js';

export interface SpawnResult {
  status: SpawnStatus;
  exitCode: number;
  data: string;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, unknown>,
  interactive?: boolean,
  requiresRoot?: boolean,
  stdin?: boolean,
  throws?: boolean,
}

export function testSpawn(cmd: string, options?: SpawnOptions): Promise<SpawnResult> {
  return spawnSafe(cmd, { interactive: true, ...options,  });
}

export function spawnSafe(cmd: string, options?: SpawnOptions): Promise<SpawnResult> {
  if (cmd.toLowerCase().includes('sudo')) {
    throw new Error('Command must not include sudo')
  }

  console.log(`Running command: ${options?.requiresRoot ? 'sudo' : ''} ${cmd}` + (options?.cwd ? `(${options?.cwd})` : ''))

  return new Promise((resolve, reject) => {
    const output: string[] = [];
    const historyIgnore = ShellUtils.getShell() === Shell.ZSH ? { HISTORY_IGNORE: '*' } : { HISTIGNORE: '*' };

    // If TERM_PROGRAM=Apple_Terminal is set then ANSI escape characters may be included
    // in the response.
    const env = {
      ...process.env, ...options?.env,
      TERM_PROGRAM: 'codify',
      COMMAND_MODE: 'unix2003',
      COLORTERM: 'truecolor',
      ...historyIgnore
    }

    // Initial terminal dimensions
    const initialCols = 10_000; // Set to a large value to prevent wrapping
    const initialRows = process.stdout.rows ?? 24;

    const command = options?.requiresRoot ? `sudo ${cmd}` : cmd;
    const args = options?.interactive ? ['-i', '-c', command] : ['-c', command]

    // Run the command in a pty for interactivity
    const mPty = pty.spawn(ShellUtils.getDefaultShell(), args, {
      ...options,
      cols: initialCols,
      rows: initialRows,
      env
    });

    mPty.onData((data) => {
      process.stdout.write(data);
      output.push(data.toString());
    })


    const stdinListener = (data: any) => {
      // console.log('stdinListener', data);
      mPty.write(data.toString());
    }

    if (options?.stdin) {
      process.stdin.on('data', stdinListener)
    }

    mPty.onExit((result) => {
      if (options?.stdin) {
        process.stdin.off('data', stdinListener);
      }

      const raw = stripAnsi(output.join('')).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

      if (options?.throws && result.exitCode !== 0) {
        reject(new Error(raw));
        return;
      }

      resolve({
        status: result.exitCode === 0 ? SpawnStatus.SUCCESS : SpawnStatus.ERROR,
        exitCode: result.exitCode,
        data: raw,
      })
    })
  })
}

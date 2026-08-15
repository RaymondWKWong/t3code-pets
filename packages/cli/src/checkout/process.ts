import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

export function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...args],
      { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new ProcessExecutionError(
              executable,
              args,
              cwd,
              error,
              stdout,
              stderr,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

export class ProcessExecutionError extends Error {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    executable: string,
    args: readonly string[],
    cwd: string,
    cause: Error,
    stdout: string,
    stderr: string,
  ) {
    super(
      `${executable} exited unsuccessfully: ${stderr.trim() || cause.message}`,
      {
        cause,
      },
    );
    this.name = "ProcessExecutionError";
    this.executable = executable;
    this.args = args;
    this.cwd = cwd;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export async function resolveCorepackProcess(): Promise<{
  readonly executable: string;
  readonly prefixArguments: readonly string[];
}> {
  if (process.platform !== "win32") {
    return { executable: "corepack", prefixArguments: [] };
  }
  const directories = [
    dirname(process.execPath),
    ...(process.env["PATH"] ?? "").split(delimiter),
  ];
  for (const directory of directories) {
    if (!directory) continue;
    const script = join(
      directory,
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    );
    try {
      await access(script);
      return { executable: process.execPath, prefixArguments: [script] };
    } catch {
      continue;
    }
  }
  throw new Error(
    "Corepack could not be located; install the Node.js 24 distribution required by T3 Code",
  );
}

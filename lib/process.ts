import { spawn } from "node:child_process";
import { once } from "node:events";

export async function commandExists(command: string): Promise<boolean> {
  const child = spawn(command, ["--version"], { windowsHide: true });
  try {
    const [code] = (await Promise.race([
      once(child, "close"),
      once(child, "error").then(() => [-1]),
    ])) as [number | null];
    return code === 0;
  } catch {
    return false;
  }
}

export function runCommand(
  command: string,
  args: string[],
  onOutput?: (text: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      onOutput?.(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onOutput?.(text);
    });
    child.on("error", (error) => {
      reject(
        new Error(
          `${command} is not installed or not on PATH. ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const hint = stderr.trim().split("\n").slice(-8).join("\n");
      reject(new Error(`${command} failed (exit ${code}). ${hint}`));
    });
  });
}

export function runCommandCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(
        new Error(
          `${command} is not installed or not on PATH. ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} failed (exit ${code}). ${stderr.trim()}`));
    });
  });
}

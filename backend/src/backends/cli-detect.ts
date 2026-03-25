import { execSync } from 'node:child_process';

/**
 * Check if a CLI command is available on the system PATH.
 */
export function isCliAvailable(command: string): boolean {
  try {
    // Use 'where' on Windows, 'which' on Unix
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${checker} ${command}`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

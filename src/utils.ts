// Obsidian is a trademark of Dynalist Inc. RustShare is not affiliated with, endorsed by, or sponsored by Obsidian.
// This file is part of RustShare Vault Sync.

export async function sha256ArrayBuffer(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256File(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return sha256ArrayBuffer(arrayBuffer);
}

export function generateDeviceId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function formatConflictFileName(originalPath: string, deviceName: string, date: Date): string {
  const lastDot = originalPath.lastIndexOf('.');
  const ext = lastDot > 0 ? originalPath.slice(lastDot) : '';
  const basename = lastDot > 0 ? originalPath.slice(0, lastDot) : originalPath;
  const lastSlash = basename.lastIndexOf('/');
  const dir = lastSlash >= 0 ? basename.slice(0, lastSlash + 1) : '';
  const name = lastSlash >= 0 ? basename.slice(lastSlash + 1) : basename;
  const timestamp = date.toISOString().replace(/[-:T]/g, '').slice(0, 12); // YYYYMMDDHHMM
  const safeDeviceName = deviceName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${dir}${name} (RustShare conflicted copy ${safeDeviceName} ${timestamp})${ext}`;
}

export function shouldIgnorePath(path: string, configDir: string): boolean {
  const normalizedConfigDir = configDir.endsWith('/') ? configDir : configDir + '/';
  const ignoredPaths = [
    normalizedConfigDir,
    '.git/',
    '.DS_Store',
    'node_modules/',
    'Thumbs.db',
    '.rustshare-sync-state.json',
  ];
  for (const ignored of ignoredPaths) {
    if (ignored.endsWith('/')) {
      // Directory patterns: match at start or after a slash
      if (path.startsWith(ignored) || path.includes('/' + ignored)) return true;
    } else {
      // File patterns: exact match or suffix after a slash
      if (path === ignored || path.endsWith('/' + ignored)) return true;
    }
  }
  return false;
}

export function detectCloudSyncFolder(vaultPath: string): string | null {
  const cloudIndicators = ['Dropbox', 'iCloud Drive', 'OneDrive', 'Google Drive', 'Box Sync', 'pCloud'];
  for (const indicator of cloudIndicators) {
    if (vaultPath.includes(indicator)) return indicator;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Best-effort path to the rustshare-desktop token file.
 * Returns null when the runtime environment is not recognisable.
 */
function desktopTokenPath(): string | null {
  const win = window as any;
  if (!win.require) return null;
  try {
    const os = win.require('os');
    const home = os.homedir() as string;
    const process = win.require('process');
    const platform = process.platform as string | undefined;
    switch (platform) {
      case 'darwin':
        return `${home}/Library/Application Support/io.rustshare.RustShare/token.txt`;
      case 'win32':
        return `${home}\\AppData\\Local\\RustShare\\token.txt`;
      case 'linux':
        return `${home}/.local/share/RustShare/token.txt`;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Try to reuse the token that rustshare-desktop already persisted.
 * This lets an already-authenticated desktop user skip the Obsidian
 * device-pairing flow.
 */
export function loadDesktopAuthToken(): string | null {
  const path = desktopTokenPath();
  if (!path) return null;
  const win = window as any;
  if (!win.require) return null;
  try {
    const fs = win.require('fs');
    const token = (fs.readFileSync(path, 'utf8') as string).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

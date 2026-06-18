// Obsidian is a trademark of Dynalist Inc. RustShare is not affiliated with, endorsed by, or sponsored by Obsidian.
// This file is part of RustShare Vault Sync.

export interface LocalFileState {
  sha256: string;
  server_rev: number;
  last_synced_at: string;
}

export interface TombstoneState {
  deleted_at: string;
  server_rev: number;
}

export interface SyncState {
  version: number;
  vault_id: string;
  device_id: string;
  device_name: string;
  last_server_rev: number;
  files: Record<string, LocalFileState>;
  tombstones: Record<string, TombstoneState>;
}

export function createEmptySyncState(vaultId: string, deviceId: string, deviceName: string): SyncState {
  return {
    version: 1,
    vault_id: vaultId,
    device_id: deviceId,
    device_name: deviceName,
    last_server_rev: 0,
    files: {},
    tombstones: {},
  };
}

export function migrateSyncState(state: Record<string, unknown>): SyncState {
  const version = typeof state.version === 'number' ? state.version : 0;
  if (version === 1) {
    // Current version, return as-is with defaults
    return {
      version: 1,
      vault_id: typeof state.vault_id === 'string' ? state.vault_id : '',
      device_id: typeof state.device_id === 'string' ? state.device_id : '',
      device_name: typeof state.device_name === 'string' ? state.device_name : '',
      last_server_rev: typeof state.last_server_rev === 'number' ? state.last_server_rev : 0,
      files: (state.files && typeof state.files === 'object') ? (state.files as Record<string, LocalFileState>) : {},
      tombstones: (state.tombstones && typeof state.tombstones === 'object') ? (state.tombstones as Record<string, TombstoneState>) : {},
    };
  }
  // Future migrations go here
  return createEmptySyncState(
    typeof state.vault_id === 'string' ? state.vault_id : '',
    typeof state.device_id === 'string' ? state.device_id : '',
    typeof state.device_name === 'string' ? state.device_name : ''
  );
}

const TOMBSTONE_RETENTION_DAYS = 30;

export function pruneTombstones(state: SyncState): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TOMBSTONE_RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  for (const [path, tombstone] of Object.entries(state.tombstones)) {
    if (tombstone.deleted_at < cutoffIso) {
      delete state.tombstones[path];
    }
  }
}

import { describe, it, expect } from 'vitest';
import { createEmptySyncState, retargetSyncStateDevice } from '../src/state';

describe('createEmptySyncState', () => {
  it('returns state with correct defaults and empty files/tombstones', () => {
    const state = createEmptySyncState('vault-123', 'device-456', 'My Laptop');

    expect(state.vault_id).toBe('vault-123');
    expect(state.device_id).toBe('device-456');
    expect(state.device_name).toBe('My Laptop');
    expect(state.last_server_rev).toBe(0);
    expect(state.files).toEqual({});
    expect(state.tombstones).toEqual({});
  });
});

describe('retargetSyncStateDevice', () => {
  it('keeps vault file history when a re-paired device gets a new id', () => {
    const state = createEmptySyncState('vault-123', 'old-device', 'Old Laptop');
    state.last_server_rev = 7;
    state.files['note.md'] = {
      sha256: 'abc',
      server_rev: 6,
      last_synced_at: '2026-06-23T00:00:00.000Z',
    };

    const retargeted = retargetSyncStateDevice(state, 'new-device', 'New Laptop');

    expect(retargeted.device_id).toBe('new-device');
    expect(retargeted.device_name).toBe('New Laptop');
    expect(retargeted.vault_id).toBe('vault-123');
    expect(retargeted.last_server_rev).toBe(7);
    expect(retargeted.files['note.md']).toEqual(state.files['note.md']);
  });
});

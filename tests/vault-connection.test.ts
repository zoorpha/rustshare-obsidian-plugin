import { describe, expect, it, vi } from 'vitest';
import type { CreateVaultRequest, Vault } from '../src/api';
import { RustShareAPI } from '../src/api';
import { getOrCreateVault } from '../src/vault-connection';

const request: CreateVaultRequest = {
  name: 'My Vault',
  adapter: 'ObsidianVault',
  device_id: 'device-1',
};

const vault: Vault = {
  id: 'vault-1',
  name: 'My Vault',
  adapter: 'ObsidianVault',
  server_rev: 0,
  created_at: '',
  updated_at: '',
};

function apiMock() {
  return {
    getVault: vi.fn(),
    createVault: vi.fn(),
  } as unknown as RustShareAPI & {
    getVault: ReturnType<typeof vi.fn>;
    createVault: ReturnType<typeof vi.fn>;
  };
}

describe('getOrCreateVault', () => {
  it('reuses the configured vault when it exists', async () => {
    const api = apiMock();
    api.getVault.mockResolvedValue(vault);

    await expect(getOrCreateVault(api, 'vault-1', request)).resolves.toEqual({
      vault,
      created: false,
    });
    expect(api.createVault).not.toHaveBeenCalled();
  });

  it('creates a vault when the configured ID is not found on this server', async () => {
    const api = apiMock();
    const missing = Object.assign(new Error('not found'), { status: 404 });
    api.getVault.mockRejectedValue(missing);
    api.createVault.mockResolvedValue(vault);

    await expect(getOrCreateVault(api, 'vault-from-old-server', request)).resolves.toEqual({
      vault,
      created: true,
    });
    expect(api.createVault).toHaveBeenCalledWith(request);
  });

  it('does not create a vault after errors other than not found', async () => {
    const api = apiMock();
    const unauthorized = Object.assign(new Error('unauthorized'), { status: 401 });
    api.getVault.mockRejectedValue(unauthorized);

    await expect(getOrCreateVault(api, 'vault-1', request)).rejects.toBe(unauthorized);
    expect(api.createVault).not.toHaveBeenCalled();
  });

  it('explains duplicate vault names', async () => {
    const api = apiMock();
    api.createVault.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));

    await expect(getOrCreateVault(api, '', request)).rejects.toThrow(
      'A vault named "My Vault" already exists on this server. Rename this Obsidian vault or enter the existing vault ID.'
    );
  });
});

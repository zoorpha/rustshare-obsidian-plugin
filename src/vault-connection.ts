import type { APIError, CreateVaultRequest, Vault } from './api';
import { RustShareAPI } from './api';

export async function getOrCreateVault(
  api: RustShareAPI,
  vaultId: string,
  request: CreateVaultRequest,
): Promise<{ vault: Vault; created: boolean }> {
  if (vaultId) {
    try {
      return { vault: await api.getVault(vaultId), created: false };
    } catch (error) {
      if ((error as APIError).status !== 404) {
        throw error;
      }
    }
  }

  try {
    return { vault: await api.createVault(request), created: true };
  } catch (error) {
    if ((error as APIError).status === 409) {
      throw new Error(
        `A vault named "${request.name}" already exists on this server. Rename this Obsidian vault or enter the existing vault ID.`,
      );
    }
    throw error;
  }
}

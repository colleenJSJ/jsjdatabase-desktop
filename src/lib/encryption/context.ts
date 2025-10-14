import { AsyncLocalStorage } from 'node:async_hooks';

type EncryptionContext = {
  sessionToken: string | null;
};

const storage = new AsyncLocalStorage<EncryptionContext>();

export function setEncryptionSessionToken(token: string | null) {
  storage.enterWith({ sessionToken: token });
}

export function getEncryptionSessionToken(): string | null {
  return storage.getStore()?.sessionToken ?? null;
}

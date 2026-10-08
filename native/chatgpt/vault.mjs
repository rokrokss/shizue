import { mkdir, readFile, writeFile, rename, chmod, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// All tokens stay in this user-owned directory, never in extension storage or native replies.
export class Vault {
  constructor(directory) { this.directory = directory; }
  async read() {
    try {
      const source = await readFile(join(this.directory, 'credentials.json'), 'utf8');
      try { return JSON.parse(source); }
      catch { throw new Error('The ChatGPT credential file is invalid. Restore it before reconnecting.'); }
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { hostId: `urn:uuid:${randomUUID()}`, accounts: [], activeId: null };
    }
  }
  async locked(fn) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const lock = join(this.directory, '.lock');
    // Also serialize rotating refresh tokens across Chrome/Chromium processes.
    for (let attempt = 0; ; attempt++) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const info = await stat(lock).catch(() => null);
        if (info && Date.now() - info.mtimeMs > 120_000) await rm(lock, { recursive: true, force: true });
        if (attempt >= 600) throw new Error('ChatGPT credentials are busy. Try again.');
        await delay(100);
      }
    }
    try {
      const data = await this.read();
      const result = await fn(data);
      const temporary = join(this.directory, `credentials-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
        await rename(temporary, join(this.directory, 'credentials.json'));
        await chmod(join(this.directory, 'credentials.json'), 0o600);
      } finally { await rm(temporary, { force: true }); }
      return result;
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
}

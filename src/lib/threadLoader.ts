// A selection change or a newer database snapshot makes an older reply obsolete.
// Requests must not block each other: a summary may be saved during an old read.
export function createThreadLoader<T>(read: (threadId: string) => Promise<T>) {
  let revision = 0;
  return {
    async load(threadId: string): Promise<T | undefined> {
      const request = ++revision;
      const result = await read(threadId);
      return request === revision ? result : undefined;
    },
    invalidate() {
      revision++;
    },
  };
}

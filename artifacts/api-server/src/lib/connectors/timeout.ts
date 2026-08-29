// A hard wall-clock timeout for network calls, so a slow/blocked upstream
// (Darwinbox, BigQuery) can never hang a "Sync Now" request or a scheduled
// job indefinitely — a sync attempt fails fast and visibly instead.

export class HardTimeout extends Error {
  constructor(ms: number) {
    super(`Call did not complete within ${ms}ms — the upstream network call is likely hanging rather than failing fast.`);
    this.name = "HardTimeout";
  }
}

export function runWithHardTimeout<T>(promiseFactory: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HardTimeout(timeoutMs)), timeoutMs);
    promiseFactory().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

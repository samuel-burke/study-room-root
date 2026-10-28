/**
 * Runs async jobs one at a time, in order. The engine pushes every operation
 * through one queue so read-modify-write sequences never interleave.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job, job);
    // Keep the chain alive whether or not this job fails.
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves once everything queued so far has finished. */
  drain(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}

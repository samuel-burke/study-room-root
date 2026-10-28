/** Token bucket per key. Small and dependency-free; the clock is injectable for tests. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryTake(key: string): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this.evictFull(now);
    return true;
  }

  private evictFull(now: number): void {
    for (const [key, bucket] of this.buckets) {
      const tokens = bucket.tokens + ((now - bucket.updatedAt) / 1000) * this.refillPerSecond;
      if (tokens >= this.capacity) this.buckets.delete(key);
    }
  }
}

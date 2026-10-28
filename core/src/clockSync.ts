/**
 * Estimates the offset between this device's clock and the server's, so
 * countdowns use server time. Keeps the sample with the smallest round trip,
 * which bounds the error to half that round trip.
 */
export class ClockSync {
  private offsetMs = 0;
  private bestRoundTripMs = Number.POSITIVE_INFINITY;

  constructor(private readonly localNow: () => number = Date.now) {}

  /** Record a request/response pair: when it was sent, received, and the server's clock. */
  sample(sentAt: number, receivedAt: number, serverNow: number): void {
    const roundTrip = Math.max(0, receivedAt - sentAt);
    if (roundTrip > this.bestRoundTripMs) return;
    this.bestRoundTripMs = roundTrip;
    this.offsetMs = serverNow - (sentAt + roundTrip / 2);
  }

  /** Server time seen in a push message. Used only until a request sample exists. */
  observe(serverNow: number): void {
    if (Number.isFinite(this.bestRoundTripMs)) return;
    this.offsetMs = serverNow - this.localNow();
  }

  now(): number {
    return this.localNow() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }
}

/** Deterministic time seam — real clock in prod, fixed clock in tests. */
export interface Clock {
  now(): string; // ISO-8601
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
  nowMs(): number {
    return Date.now();
  }
}

export class FixedClock implements Clock {
  constructor(private iso: string) {}
  now(): string {
    return this.iso;
  }
  nowMs(): number {
    return Date.parse(this.iso);
  }
  set(iso: string): void {
    this.iso = iso;
  }
}

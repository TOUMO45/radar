/** Id generation seam — random in prod, sequential in tests for stable assertions. */
export interface IdGen {
  next(prefix: string): string;
}

export class RandomIdGen implements IdGen {
  next(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class SeqIdGen implements IdGen {
  private counters = new Map<string, number>();
  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${n}`;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashSeed(...parts: Array<string | number>): number {
  return parts.reduce<number>((hash, part) => Math.imul(hash ^ hashString(String(part)), 16777619) >>> 0, 2166136261) >>> 0;
}

/**
 * Deterministic random stream for preview/seek/export parity.
 * It deliberately does not touch the browser's Math.random state.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = hashSeed(seed) || 0x6d2b79f5;
  }

  nextFloat(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }

  signed(amount: number): number {
    return (this.nextFloat() * 2 - 1) * amount;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.nextFloat() * items.length))];
  }
}

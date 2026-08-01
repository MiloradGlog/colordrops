// spec.md → Behaviors → scheduler. Seeded color choice, weighted 70/30
// toward colors still meaningfully below target so runs stay winnable
// without being handed to the player. Never two drops in the air (MVP).

import type { Rng } from "../engine/rng";

export function pickColor(
  rng: Rng,
  targets: readonly number[],
  shares: readonly number[],
  epsilon: number,
): number {
  const deficits = targets.map((t, i) => t - shares[i]!);
  const useful: number[] = [];
  for (let i = 0; i < deficits.length; i++) {
    if (deficits[i]! > epsilon / 2) useful.push(i);
  }
  if (useful.length > 0 && rng.next() < 0.7) {
    // among useful colors, weight by deficit so the neediest shows up most
    let sum = 0;
    for (const i of useful) sum += deficits[i]!;
    let roll = rng.next() * sum;
    for (const i of useful) {
      roll -= deficits[i]!;
      if (roll <= 0) return i;
    }
    return useful[useful.length - 1]!;
  }
  return rng.int(0, targets.length);
}

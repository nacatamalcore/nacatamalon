/**
 * A per-game random handle, returned by `useRandom`. Every method draws from this
 * game's own seeded generator: two games on the same page never share a stream, and
 * `seed` only affects the game it belongs to. Seeding makes a sequence reproducible
 * (same seed → same numbers), which is what the editor/metadata model needs to rebuild
 * a procedural scene from a single saved seed.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRandomHandle = {
    /**
     * Random float: `rand()` → `[0, 1)`, `rand(max)` → `[0, max)`, `rand(min, max)` →
     * `[min, max)`. All ranges are half-open.
     */
    rand(min?: number, max?: number): number;
    /**
     * Random integer in the **inclusive** range `[min, max]`: `randInt(1, 6)` is a
     * die roll. For a random array index prefer `choose`, which can't go out of bounds.
     */
    randInt(min: number, max: number): number;
    /**
     * True with the given `probability` (0–1): `chance(0.25)` is true a quarter of the time.
     */
    chance(probability: number): boolean;
    /**
     * A random element of `list` (assumes it is non-empty).
     */
    choose<T>(list: readonly T[]): T;
    /**
     * A new array with `list`'s elements in random order (Fisher–Yates). The input is
     * not mutated.
     */
    shuffle<T>(list: readonly T[]): T[];
    /**
     * Reseeds this generator so every subsequent call replays the same sequence. Scoped
     * to this game only.
     */
    seed(value: number): void;
};

/**
 * Creates a **standalone** seeded random generator (Mulberry32) that you own, usable
 * anywhere, no game required. Each call returns an independent generator with its own
 * closed-over state (no shared global stream), so seeding or draining one never affects
 * another.
 *
 * Reach for this for randomness **outside** a running game: build tools, tests, or
 * procedural work done before `createGame`. **Inside** game code prefer `useRandom`,
 * which hands you the game's *own* generator: that way randomness is tied to the game
 * and reproducible through its `seed` option. (`createGame` builds each game's generator
 * with this same factory.)
 *
 * Defaults to a clock-derived seed (different each run); pass `seed` or call `.seed()`
 * for a reproducible sequence.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createRandom = (initialSeed: number = (Date.now() >>> 0) || 1): TRandomHandle => {
    let state = initialSeed >>> 0;

    // Mulberry32: small, fast, well-distributed, and seedable (unlike Math.random).
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rand = (min?: number, max?: number): number => {
        if (min === undefined) return next();
        if (max === undefined) return next() * min;
        return min + next() * (max - min);
    };

    return {
        rand,
        randInt: (min, max) => min + Math.floor(next() * (max - min + 1)),
        chance: (probability) => next() < probability,
        choose: (list) => list[Math.floor(next() * list.length)],
        shuffle: (list) => {
            const result = [...list];
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
        },
        seed: (value) => { state = value >>> 0; },
    };
};

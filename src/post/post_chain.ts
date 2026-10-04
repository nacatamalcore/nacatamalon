import type { TPostChain, TPostChainEntry } from './types/t_post_chain';
import type { TUniformValues } from '../materials/types/t_uniforms';

/**
 * A string that says something, or nothing at all. Blank and absent mean the same thing here.
 */
const asPath = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
};

/**
 * The knobs, keeping only what can actually be written into the block the card reads.
 *
 * A number, or a list of two to four of them. Anything else (a string somebody typed into a field, a
 * `NaN` from a failed parse, a list of nine) is dropped rather than carried: it has no place in the
 * layout, so keeping it would only postpone the problem to the moment of drawing.
 */
const asUniforms = (value: unknown): TUniformValues | undefined => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }

    const kept: TUniformValues = {};
    for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            kept[name] = raw;
            continue;
        }
        if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) {
            continue;
        }
        if (raw.every((part) => typeof part === 'number' && Number.isFinite(part))) {
            kept[name] = raw as number[];
        }
    }

    return Object.keys(kept).length === 0 ? undefined : kept;
};

/**
 * Reads a chain out of a project file, whatever state it is in.
 *
 * **Total, and it never throws.** A chain is written by tools and edited by hand, so one bad entry
 * must not take the game down with it. What it will not do is keep an entry it cannot run: an entry
 * naming neither a known built-in nor a file is dropped outright, because a chain whose length lies
 * about how many effects run is worse than a shorter one.
 *
 * Where two fields contradict each other it picks one and says so by what it writes back:
 * a built-in beats a file, and a palette beats a table. Both of those are cases the editor cannot
 * produce and a hand-edited file can.
 *
 * @param value Whatever was under `post` in the file.
 * @returns The chain, in order, with only entries that can run.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalizePostChain = (value: unknown): TPostChain => {
    if (!Array.isArray(value)) {
        return [];
    }

    const chain: TPostChain = [];
    for (const raw of value) {
        if (typeof raw !== 'object' || raw === null) {
            continue;
        }
        const read = raw as Record<string, unknown>;

        const builtin = asPath(read.builtin);
        // A built-in is arithmetic the engine already holds, so it wins: there is nothing to fetch
        // and nothing that can point at a file which is not there.
        const shader = builtin === undefined ? asPath(read.shader) : undefined;
        if (builtin === undefined && shader === undefined) {
            continue;
        }

        const entry: TPostChainEntry = { shader: shader ?? '' };
        if (builtin !== undefined) {
            entry.builtin = builtin;
        }

        const uniforms = asUniforms(read.uniforms);
        if (uniforms !== undefined) {
            entry.uniforms = uniforms;
        }

        // One data texture, read one of two ways. An entry claiming both is one somebody typed.
        const palette = asPath(read.palette);
        const lut = palette === undefined ? asPath(read.lut) : undefined;
        if (palette !== undefined) {
            entry.palette = palette;
        }
        if (lut !== undefined) {
            entry.lut = lut;
        }

        // Written only when it is false. `enabled: true` everywhere would be noise in every file,
        // and absent already means on.
        if (read.enabled === false) {
            entry.enabled = false;
        }

        const name = asPath(read.name);
        if (name !== undefined) {
            entry.name = name;
        }

        chain.push(entry);
    }

    return chain;
};

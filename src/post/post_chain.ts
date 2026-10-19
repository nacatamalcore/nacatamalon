import type { TPostChain, TPostChainEntry } from './types/t_post_chain';
import { findPostBuiltin } from './builtin/catalog';
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
 * A built-in's knobs under the names they have now. A project written before a knob was renamed
 * keeps its value, read under the new name; where the file already has the new one too, that wins,
 * since it is the later of the two. Said once for the entry, naming every knob it moved.
 */
const asCurrentNames = (builtin: string, uniforms: TUniformValues): TUniformValues => {
    const renamed = findPostBuiltin(builtin)?.renamed;
    if (renamed === undefined) {
        return uniforms;
    }
    const moved: { old: string; now: string; taken: boolean }[] = [];
    const kept: TUniformValues = {};
    for (const [name, value] of Object.entries(uniforms)) {
        const now = Object.prototype.hasOwnProperty.call(renamed, name) ? renamed[name] : undefined;
        if (now === undefined) {
            kept[name] = value;
            continue;
        }
        const taken = Object.prototype.hasOwnProperty.call(uniforms, now);
        moved.push({ old: name, now, taken });
        if (!taken) {
            kept[now] = value;
        }
    }
    if (moved.length > 0) {
        const calls = moved.map(({ old, now }) => `'${old}' '${now}'`).join(', ');
        const reads = moved.map(({ old, now, taken }) => taken
            ? `'${old}' is left out, since '${now}' is set too`
            : `the value of '${old}' is read as '${now}'`).join('; ');
        console.warn(`[NacatamalOn] post: '${builtin}' calls ${calls} now, so ${reads}.`);
    }
    return kept;
};

/**
 * A built-in's options, kept only where it declares one by that name (a field marked `rebuild`) and
 * of the kind it takes. Anything else is said once and left out: the effect is made with its own.
 */
const asOptions = (builtin: string, value: unknown): Record<string, string | number | boolean> | undefined => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const declared = findPostBuiltin(builtin)?.fields.filter((field) => field.rebuild === true) ?? [];
    const kept: Record<string, string | number | boolean> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const field = declared.find((candidate) => candidate.key === key);
        if (field !== undefined && typeof raw === typeof field.default) {
            kept[key] = raw as string | number | boolean;
        } else {
            console.warn(
                `[NacatamalOn] post: '${builtin}' has no option '${key}'` +
                (field !== undefined ? ` taking a ${typeof raw}` : '') +
                ` (it has ${declared.map((d) => d.key).join(', ') || 'none'}), so it is left out.`,
            );
        }
    }
    return Object.keys(kept).length > 0 ? kept : undefined;
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
 * A built-in's knob saved under a name it has since changed is read under the new one, and said.
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
            entry.uniforms = builtin === undefined ? uniforms : asCurrentNames(builtin, uniforms);
        }

        const options = builtin === undefined ? undefined : asOptions(builtin, read.options);
        if (options !== undefined) {
            entry.options = options;
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

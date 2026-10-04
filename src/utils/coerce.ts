import type { TColor } from '../color';

/**
 * Turning whatever `JSON.parse` gave back into the thing a reader wanted, or the default.
 *
 * Every format this engine reads is written by tools **and edited by hand**, which means every
 * reader has the same job: take a field that may be missing, of the wrong shape, or plain nonsense,
 * and carry on. A reader that threw would mean one typo in a project file takes the whole game down.
 *
 * These exist in one place because they had already been written twice, in `parse_project` and in
 * the particles reader, and a third copy was about to be written for scene documents. Three
 * statements of one rule are three statements that can disagree, and the way that failure shows up
 * is a field that a project file accepts and a scene file silently rounds.
 *
 * The one rule worth naming: **the conversion is never trusted.** `Number(null)` is `0` and
 * `Number(true)` is `1`, so a field somebody left empty would become a game one pixel tall. Only a
 * value that already is what was asked for counts.
 */

/**
 * A finite number, or the default. Not rounded and not clamped: see `asInt` for that.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asNumber = (value: unknown, fallback: number): number =>
    (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * A whole number inside a range, or the default. What a size, a count or a quality setting wants.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asInt = (value: unknown, fallback: number, min: number, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(Math.max(Math.round(value), min), max);
};

/**
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asBoolean = (value: unknown, fallback: boolean): boolean =>
    (typeof value === 'boolean' ? value : fallback);

/**
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asString = (value: unknown, fallback: string): string =>
    (typeof value === 'string' ? value : fallback);

/**
 * One of a known set of words, or the default. What every `'left' | 'right'` field wants, and the
 * reason a misspelled one lands on something sensible instead of reaching a `switch` that has no
 * case for it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asOneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback);

/**
 * The value as a bag of fields, or `null` when it is not one. Arrays are **not** one: `typeof []` is
 * `'object'`, so a reader that forgot to ask would happily walk a list looking for named fields.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
    (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null);

/**
 * The value as a list, or an empty one. So a caller can always walk it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * A colour written as four channels from 0 to 1, with each one that is missing or nonsense taken
 * from the default.
 *
 * Per channel rather than all or nothing: a colour with three good numbers and a broken alpha is
 * three quarters of an answer, and throwing it away would lose the three.
 *
 * This is the colour as a **record** holds it. A colour written as `'#ff8800'` is a different job,
 * because reading one needs the whole CSS colour table, and the file formats that accept that
 * spelling say so themselves.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asColor = (value: unknown, fallback: TColor): TColor => {
    const raw = asRecord(value);
    if (raw === null) {
        return fallback;
    }
    const channel = (part: unknown, missing: number): number => {
        const number = Number(part);
        return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : missing;
    };
    return {
        r: channel(raw.r, fallback.r),
        g: channel(raw.g, fallback.g),
        b: channel(raw.b, fallback.b),
        a: channel(raw.a, fallback.a),
    };
};

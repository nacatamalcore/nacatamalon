/**
 * How much a word stands out from the ones around it.
 *
 * @internal
 */
export type TEmphasis = 'strong' | 'moderate' | 'reduced';

/**
 * What an emphasis does to a word: how many times as loud it is, as long its stressed vowel and its
 * other sounds are, and as high its accent.
 *
 * @internal
 */
export const EMPHASES: Readonly<Record<TEmphasis, { power: number; vowel: number; sounds: number; accent: number }>> = {
    strong: { power: 1.35, vowel: 1.5, sounds: 1.08, accent: 2.3 },
    moderate: { power: 1.18, vowel: 1.28, sounds: 1.08, accent: 1.7 },
    reduced: { power: 0.75, vowel: 0.88, sounds: 0.88, accent: 0.3 },
};

/**
 * A tag in a text, and one of an emphasis that is not written whole.
 *
 * @internal
 */
export const TAG = /(<\/?[a-záéíóúüñ][^<>]*>|<\s*(?:\/\s*)?emphasis[^<>]*>?)/gi;

const OPEN = /^<emphasis(?:\s+level\s*=\s*["'](strong|moderate|reduced)["'])?\s*>$/i;
const CLOSE = /^<\/emphasis\s*>$/i;

const BY_STRENGTH: readonly (TEmphasis | undefined)[] = ['reduced', undefined, 'moderate', 'strong'];

/**
 * The one of two emphases that stands out more.
 *
 * @internal
 */
export const strongerOf = (a: TEmphasis | undefined, b: TEmphasis | undefined): TEmphasis | undefined => (BY_STRENGTH.indexOf(a) >= BY_STRENGTH.indexOf(b) ? a : b);

/**
 * Follows the emphasis of a text through its tags, each told in order: the one the words after it
 * have. A tag the voice does not read, or one inside another, throws.
 *
 * @internal
 */
export const followEmphasis = (tag: string, now: TEmphasis | undefined): TEmphasis | undefined => {
    const open = OPEN.exec(tag);
    if (open && now === undefined) return (open[1]?.toLowerCase() as TEmphasis | undefined) ?? 'moderate';
    if (CLOSE.test(tag) && now !== undefined) return undefined;
    throw new Error(
        open || CLOSE.test(tag)
            ? `[NacatamalOn] speech: "${tag}" has no pair. An emphasis is opened and closed around its words, not inside another.`
            : `[NacatamalOn] speech: "${tag}" is not a tag the voice reads. There is <emphasis>, with level="strong", "moderate" or "reduced".`,
    );
};

import { closes } from './said';

/**
 * A stressed syllable's rise of the pitch. `fixed`, it is where it is and as high as it is, wherever
 * in its phrase.
 *
 * @internal
 */
export type TAccent = { at: number; width: number; height: number; fixed?: boolean };

/**
 * A phrase, between two pauses, and how it ends.
 *
 * @internal
 */
export type TPhrase = { start: number; end: number; mark: string; asks: boolean; asksWhat: boolean; begins: boolean };

/**
 * How a language's accents are moved and sized in their phrase: each of the `count` of it in turn.
 *
 * @internal
 */
export type TAccentShape = (accent: TAccent, index: number, count: number, phrase: TPhrase) => void;

/** How far the pitch goes at the end of a phrase, in semitones, by the mark that ends it. */
const ENDINGS: Readonly<Record<string, number>> = { ',': 2, ';': 0.6, '.': -1.8, '!': -2.4, '?': 5 };
const ASKS_WHAT_ENDING = -2;

/**
 * Writes a text's pitch into `frames`, in semitones, one every `frame` seconds: it falls over a
 * sentence, its phrases each starting lower than the one before; a comma leaves it up, as what is not
 * finished; a question for a yes or a no climbs, and one that asks what begins high and falls. The
 * accents are moved and sized by `shape`.
 *
 * @internal
 */
export const phraseMelody = (
    frames: Float32Array,
    frame: number,
    phrases: readonly TPhrase[],
    accents: readonly TAccent[],
    base: number,
    melody: number,
    shape: TAccentShape,
): void => {
    const range = 0.5 + 0.5 * (melody / 2.5);
    let nth = 0;
    for (const phrase of phrases) {
        const { start, end, mark, asks, asksWhat, begins } = phrase;
        if (asks && begins) nth = 0;
        const from = Math.max(-0.6, 1.2 - 0.6 * nth) + (mark === '!' ? 1.2 : 0);
        const fall = closes(mark) ? -2.6 : mark === ';' ? -1.2 : -1.4;
        const ending = mark === '?' && asksWhat ? ASKS_WHAT_ENDING : ENDINGS[mark]!;
        const tail = Math.min(0.32, (end - start) * 0.5);
        for (let f = Math.floor(start / frame); f * frame < end; f += 1) {
            const time = f * frame;
            const turned = Math.min(1, Math.max(0, (time - (end - tail)) / tail));
            let rise = from + fall * ((time - start) / (end - start)) + ending * 0.5 * (1 - Math.cos(Math.PI * turned));
            if (asks && asksWhat && begins) rise += 2.5 * Math.max(0, 1 - (time - start) / 0.7);
            frames[f] = base + rise * range;
        }
        const inside = accents.filter((accent) => accent.at >= start && accent.at < end);
        inside.forEach((accent, i) => {
            if (!accent.fixed) shape(accent, i, inside.length, phrase);
        });
        nth = closes(mark) ? 0 : nth + 1;
    }
};

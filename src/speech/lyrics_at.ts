import { vocalDocOf } from './accompany';
import { singersOf, whoOf } from './vocal_stream';
import type { TLyricsAt, TVocalDoc, TVocalFile } from './types/t_vocal';

/**
 * How far into a note a syllable is taken to be sung, and how early, in beats: the mouth opens a
 * little before the beat, for the consonants, and shuts a little before the next.
 */
const OPENS = 0.1;
const HELD = 0.85;

/**
 * A line's syllables as words: a syllable ending in a hyphen goes on into the next without a space.
 */
const wordsOf = (lyrics: readonly string[]): string =>
    lyrics.map((lyric, i) => (lyric.endsWith('-') ? lyric.slice(0, -1) : i < lyrics.length - 1 ? `${lyric} ` : lyric)).join('');

/**
 * Where a vocal part is at a beat of the song it is sung over: which line, its words so far and
 * whole, who sings it, and whether a syllable is being sung right now. For words that come up as
 * they are sung, and a mouth that moves with them.
 *
 * `beat` is the song's, as `useSong` gives it (`song.beat`). Before the first line and after the
 * last it is `null`, as it is while the part's file has not loaded. A song that goes back round its
 * loop counts its beats from there again, and the part is sung again with it, words and all.
 *
 * @param vocal - The part: from `useLoadVocal`, or a `TVocalDoc` written in code.
 * @param beat - The song's beat, counted from `0`; `null` when the song is not playing.
 * @returns Where the part is, or `null` when nothing of it is being sung.
 *
 * @example
 * ```ts
 * import { createScene, createText, useLoadSong, useSong, useUpdate, type TBitmapFont } from 'nacatamalon';
 * import { accompany, lyricsAt, useLoadVocal } from 'nacatamalon/speech';
 *
 * declare const font: TBitmapFont;
 *
 * const Karaoke = () => {
 *     const vocal = useLoadVocal({ src: '/music/daisy.vocal' });
 *     const song = useSong(accompany(vocal, useLoadSong({ src: '/music/daisy.song' })), { autoplay: true });
 *     const line = createText({ text: '', font, transform: { x: 20, y: 200 } });
 *     useUpdate(() => {
 *         line.text = lyricsAt(vocal, song.beat)?.words ?? '';
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lyricsAt = (vocal: TVocalDoc | TVocalFile, beat: number | null): TLyricsAt | null => {
    const doc = vocalDocOf(vocal);
    if (doc === null || beat === null) return null;
    const everyone = Object.keys(singersOf(doc));
    let at = doc.start ?? 0;
    let found: TLyricsAt | null = null;
    doc.lines.forEach((line, index) => {
        const lyrics: string[] = [];
        const sung: string[] = [];
        let singing = false;
        const starts = at;
        for (const note of line.notes) {
            const beats = Math.max(0, note.beats ?? 1);
            if (note.lyric !== undefined) {
                lyrics.push(note.lyric);
                if (at - OPENS <= beat) sung.push(note.lyric);
            }
            if (note.pitch !== undefined && beat >= at - OPENS && beat < at + beats * HELD) singing = true;
            at += beats;
        }
        // The lines follow one another, so a line is the one being sung from just before its first
        // syllable to its last beat, rests at its end included.
        if (beat >= starts - OPENS && beat < at) {
            found = { line: index, words: wordsOf(sung), whole: wordsOf(lyrics), who: whoOf(line, everyone), singing };
        }
    });
    return found;
};

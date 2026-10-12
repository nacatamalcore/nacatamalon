import { describe, expect, it } from 'bun:test';
import { parseSongNotes, writeSongNotes } from '../src/audio/synth';
import type { TSongNote, TSongVoiceName } from '../src/audio/synth';

/**
 * A voice's notes written back as text: what is written reads back as the same notes, with the bars
 * closed and adding up, so a piano roll can change a song and leave notes a person can read.
 */

const roundTrip = (text: string, voice: TSongVoiceName, meter: [number, number]) => {
    const first = parseSongNotes(text, voice, meter);
    expect(first.errors).toEqual([]);
    const written = writeSongNotes(first.notes, voice, meter);
    const again = parseSongNotes(written, voice, meter);
    expect(again.errors).toEqual([]);
    expect(again.notes).toEqual(first.notes);
    return written;
};

describe('writeSongNotes', () => {
    it('writes notes back as they read, a length only when it changes', () => {
        expect(roundTrip("c4 e g | c'2.", 'pulse1', [3, 4])).toBe("c e g | c'2. |");
    });

    it('keeps rests, dots, sharps and octaves', () => {
        roundTrip("r8 f#8 a8. b16 c''4 c'' | d,2 r4 bb, |", 'pulse2', [4, 4]);
        roundTrip('a,,1 | g\'\'\'2 r2 |', 'triangle', [4, 4]);
    });

    it('holds a note across a bar with ~, and still reads it as one', () => {
        const notes: TSongNote[] = [{ voice: 'pulse1', start: 2, beats: 2, pitch: 64 }];
        const written = writeSongNotes(notes, 'pulse1', [3, 4]);
        expect(written).toBe('r2 e4~ | e r2 |');
        expect(parseSongNotes(written, 'pulse1', [3, 4]).notes).toEqual(notes);
    });

    it('writes a length no single one can say as two held together', () => {
        const notes: TSongNote[] = [{ voice: 'pulse1', start: 0, beats: 1.25, pitch: 60 }];
        const written = writeSongNotes(notes, 'pulse1', [4, 4]);
        expect(parseSongNotes(written, 'pulse1', [4, 4]).notes).toEqual(notes);
        expect(written).toContain('~');
    });

    it('writes drum hits as x in the noise voice', () => {
        expect(roundTrip('x8 x x4 r2 | x1 |', 'noise', [4, 4])).toBe('x8 x x4 r2 | x1 |');
    });

    it('cuts a note short where the next one starts, and fills the last bar', () => {
        const notes: TSongNote[] = [
            { voice: 'pulse1', start: 0, beats: 2, pitch: 60 },
            { voice: 'pulse1', start: 1, beats: 1, pitch: 62 },
            { voice: 'pulse2', start: 0, beats: 4, pitch: 70 },
        ];
        const written = writeSongNotes(notes, 'pulse1', [4, 4]);
        expect(written).toBe('c d r2 |');
    });

    it('goes four bars to a line', () => {
        const written = roundTrip('c1 | d | e | f | g |', 'pulse1', [4, 4]);
        expect(written.split('\n')).toEqual(['c1 | d | e | f |', 'g |']);
    });
});

import { describe, expect, it } from 'bun:test';
import { renderSong, parseSongDoc, SONG_FORMAT } from '../src';
import { analyzeAudio, encodeWav, mixSong, serializeSongDoc } from '../src/authoring';
import { parseSongNotes } from '../src/audio/synth/parse_song_notes';
import type { TSongDoc } from '../src';

/**
 * A song written as text, turned into sound with nothing of the browser.
 *
 * What these check is what an agent writing music cannot hear and has to trust: that a note is the
 * pitch its letter says, lasts what its number says, that a bar that does not add up is caught and
 * said where, and that four voices together never distort.
 */

const RATE = 44100;

const song = (voices: TSongDoc['voices'], extra: Partial<TSongDoc> = {}): TSongDoc => ({
    format: SONG_FORMAT,
    tempo: 120,
    meter: [4, 4],
    voices,
    ...extra,
});

/**
 * How many times a track goes from below zero to zero or above, per second, over a stretch in the
 * middle of a note: its frequency.
 */
const frequencyIn = (track: Float32Array, from: number, to: number): number => {
    let rises = 0;
    for (let i = from + 1; i < to; i += 1) {
        if (track[i - 1]! < 0 && track[i]! >= 0) {
            rises += 1;
        }
    }
    return rises / ((to - from) / RATE);
};

describe('a note', () => {
    it('is the pitch its letter says: a alone is the A of 440 Hz, on a square and on the triangle', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1' }, triangle: { notes: 'a1' } }, { tempo: 60 }));

        expect(frequencyIn(rendered.voices.pulse1!, RATE, 3 * RATE)).toBeCloseTo(440, -0.5);
        expect(frequencyIn(rendered.voices.triangle!, RATE, 3 * RATE)).toBeCloseTo(440, -0.5);
    });

    it('reads sharps, flats and octaves', () => {
        const { notes } = parseSongNotes("a a' c, bb f# c'' e#", 'pulse1', [4, 4]);

        expect(notes.map((note) => note.pitch)).toEqual([69, 81, 48, 70, 66, 84, 65]);
    });

    it('lasts what its number says, and a note with no number lasts what the one before did', () => {
        const { notes, end } = parseSongNotes('c4 d8 e f2 g4. a16', 'pulse1', [4, 4]);

        expect(notes.map((note) => [note.start, note.beats])).toEqual([
            [0, 1], [1, 0.5], [1.5, 0.5], [2, 2], [4, 1.5], [5.5, 0.25],
        ]);
        expect(end).toBe(5.75);
    });

    it('counts beats in the note the bar counts in', () => {
        // In 6/8 a beat is an eighth, so a quarter is two of them.
        const { notes } = parseSongNotes('c4 d8', 'pulse1', [6, 8]);

        expect(notes.map((note) => note.beats)).toEqual([2, 1]);
    });

    it('starts and ends on the sample its beat falls on', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'c4 r4 d4' } }));
        const track = rendered.voices.pulse1!;

        // At 120 a beat is half a second: the rest is silent from 0.5 s to 1 s.
        expect(track.slice(RATE / 2, RATE).every((sample) => sample === 0)).toBe(true);
        expect(track.slice(RATE / 4, RATE / 4 + 100).some((sample) => sample !== 0)).toBe(true);
        expect(track.slice(RATE + 100, RATE + 200).some((sample) => sample !== 0)).toBe(true);
    });

    it('is held into the next one with ~, as one longer note', () => {
        const { notes, errors } = parseSongNotes('c2~ c2', 'pulse1', [4, 4]);

        expect(errors).toEqual([]);
        expect(notes).toEqual([{ voice: 'pulse1', start: 0, beats: 4, pitch: 60 }]);
    });
});

describe('a mistake in the notes', () => {
    it('is a bar that does not add up, with the bar line where it was found', () => {
        const text = "d'4 g8 a b c' | d'4 g4 | e'4 c'8 d' e' f#' |";
        const { errors } = parseSongNotes(text, 'pulse1', [3, 4]);

        expect(errors).toEqual([{
            voice: 'pulse1',
            line: 1,
            column: text.indexOf('|', text.indexOf('|') + 1) + 1,
            message: 'bar 2 adds up to 2 beats, and a bar of 3/4 has 3.',
        }]);
    });

    it('is found on the line it is on', () => {
        const { errors } = parseSongNotes('c4 d e f |\nc4 d e |', 'pulse1', [4, 4]);

        expect(errors.map((error) => [error.line, error.column])).toEqual([[2, 8]]);
    });

    it('costs only itself: the rest is still read, and every mistake is found in one go', () => {
        const { notes, errors } = parseSongNotes('c4 h4 d4 x4 e3', 'pulse1', [4, 4]);

        expect(notes.map((note) => note.pitch)).toEqual([60, 62]);
        expect(errors.map((error) => error.column)).toEqual([4, 10, 13]);
        expect(errors[1]!.message).toContain('only the noise voices (noise, psgNoise) play drums');
        expect(errors[2]!.message).toContain('1, 2, 4, 8, 16, 32 or 64');
    });

    it('is a ~ into a different note, or into nothing', () => {
        expect(parseSongNotes('c2~ d2', 'pulse1', [4, 4]).errors[0]!.message).toContain('the same note');
        expect(parseSongNotes('c2~', 'pulse1', [4, 4]).errors[0]!.message).toContain('no next one');
    });

    it('comes back from renderSong, which plays what it could read', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'c4 d4 e4 |' } }));

        expect(rendered.errors).toHaveLength(1);
        expect(rendered.notes).toHaveLength(3);
    });
});

describe('a whole song', () => {
    // The opening of a minuet in G, in four voices.
    const minuet = song({
        pulse1: { notes: "d'4 g8 a b c' | d'4 g g | e'4 c'8 d' e' f#' | g'4 g g |", duty: 0.25 },
        pulse2: { notes: 'b2. | b2. | c\'2. | b2. |', volume: 0.7 },
        triangle: { notes: 'g,2. | b,2. | c2. | g,2. |' },
        noise: { notes: 'x4 r r | x4 r r | x4 r r | x4 x8 x x4 |' },
    }, { tempo: 132, meter: [3, 4], loop: { bar: 2 } });

    it('reads with no mistakes when every bar adds up', () => {
        expect(renderSong(minuet).errors).toEqual([]);
    });

    it('is whole bars long, every voice the same length, and loops on the bar it says', () => {
        const rendered = renderSong(minuet);
        const samplesPerBeat = (60 / 132) * RATE;

        expect(rendered.length).toBe(Math.round(4 * 3 * samplesPerBeat));
        for (const track of Object.values(rendered.voices)) {
            expect(track.length).toBe(rendered.length);
        }
        expect(rendered.loopSample).toBe(Math.round(3 * samplesPerBeat));
        expect(rendered.loopStart).toBeCloseTo(rendered.loopSample / RATE, 9);
    });

    it('never distorts, even with all four voices at full volume together', () => {
        const loud = song({
            pulse1: { notes: 'c1' }, pulse2: { notes: 'e1' }, triangle: { notes: 'g,1' }, noise: { notes: 'x1' },
        });
        const measure = analyzeAudio(mixSong(renderSong(loud)), RATE);

        expect(measure.peak).toBeLessThanOrEqual(1);
        expect(measure.clipped).toBe(0);
        expect(measure.rms).toBeGreaterThan(0.05);
    });

    it('is the same samples every time', () => {
        const first = renderSong(minuet);
        const second = renderSong(minuet);

        for (const voice of ['pulse1', 'pulse2', 'triangle', 'noise'] as const) {
            expect(second.voices[voice]!).toEqual(first.voices[voice]!);
        }
    });
});

describe('a .song file', () => {
    it('is read back the same as it was written', () => {
        const doc = song({ pulse1: { notes: 'c4 d e f |', duty: 0.125, volume: 0.5 }, noise: { notes: 'x4 r x r |' } }, { loop: { bar: 1 } });

        expect(parseSongDoc(JSON.parse(serializeSongDoc(doc)))).toEqual(doc);
    });

    it('refuses what it could not play, naming the file', () => {
        expect(() => parseSongDoc({ meter: [3, 4], voices: {} }, 'music/a.song')).toThrow('song "music/a.song": "tempo"');
        expect(() => parseSongDoc({ tempo: 120, meter: [3], voices: {} })).toThrow('"meter"');
        expect(() => parseSongDoc({ tempo: 120, voices: { bass: { notes: 'c' } } })).toThrow('no voice called "bass"');
        expect(() => parseSongDoc({ tempo: 120, voices: { pulse1: { notes: 'c', duty: 0.3 } } })).toThrow('"duty"');
    });

    it('counts in four when it does not say', () => {
        expect(parseSongDoc({ tempo: 100, voices: {} }).meter).toEqual([4, 4]);
    });
});

describe('a .wav file', () => {
    it('has the header a player reads and every sample in 16 bits, held at full scale', () => {
        const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), RATE);
        const view = new DataView(bytes.buffer);

        expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
        expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(RATE);
        expect(view.getUint32(40, true)).toBe(8);
        expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
    });

    it('interleaves the channels of a stereo one', () => {
        const bytes = encodeWav([new Float32Array([0.5, 0]), new Float32Array([-0.5, 0])], RATE);
        const view = new DataView(bytes.buffer);

        expect(view.getUint16(22, true)).toBe(2);
        expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 32767));
        expect(view.getInt16(46, true)).toBe(-16384);
    });
});

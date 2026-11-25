import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useSong } from '../src/hooks/audio/use_song';
import { SONG_FORMAT } from '../src/audio/synth';
import { createSongStream } from '../src/audio/synth/song_stream';
import { accompany, lyricsAt, parseVocalDoc, useLoadVocal, VOCAL_FORMAT } from '../src/speech';
import { planSinging, sungSettings } from '../src/speech/render_singing';
import { createVoice } from '../src/speech/voice';
import { singingPitch, vibratoWave } from '../src/speech/singing_pitch';
import { createVocalStream } from '../src/speech/vocal_stream';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakeGain, TFakeSource } from './helpers/test_audio';
import type { TSongDoc } from '../src/audio/synth';
import type { TSongHandle } from '../src/audio';
import type { TVocalDoc, TVocalFile } from '../src/speech';

/**
 * A vocal part sung over a song: written apart, made with it as it plays, in a lane of its own, at
 * its tempo, round its loop.
 */

// 120 beats a minute in 4/4: three bars, looping on the second.
const SONG: TSongDoc = {
    format: SONG_FORMAT,
    tempo: 120,
    meter: [4, 4],
    loop: { bar: 2 },
    voices: {
        pulse1: { notes: 'c4 d e f | g1 | a1 |' },
        triangle: { notes: 'c,1 | g,1 | f,1 |' },
    },
};

// Two lines, the first a word in two syllables, sung from the first beat with no rest.
const VOCAL: TVocalDoc = {
    format: VOCAL_FORMAT,
    language: 'es',
    lines: [
        { notes: [{ pitch: 'C4', beats: 2, lyric: 'can-' }, { pitch: 'E4', beats: 2, lyric: 'ción' }] },
        { notes: [{ pitch: 'G4', beats: 4, lyric: 'mar' }, { pitch: 'A4', beats: 4, lyric: 'sol' }] },
    ],
};

const SAMPLE_RATE = 22050;
const HOW = { tempo: 120, transpose: 0, sampleRate: SAMPLE_RATE };

const loudness = (track: Float32Array, from = 0, to = track.length): number => {
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += track[i]! ** 2;
    return Math.sqrt(sum / Math.max(1, to - from));
};

describe('a vocal part made as it plays', () => {
    it('comes out the same whether it is made in one go or in stretches', () => {
        const whole = createVocalStream(VOCAL, HOW).render(SAMPLE_RATE * 4);
        const stream = createVocalStream(VOCAL, HOW);
        const pieces: Float32Array = new Float32Array(whole.length);
        for (let at = 0; at < pieces.length; at += 777) pieces.set(stream.render(Math.min(777, pieces.length - at)), at);
        expect(pieces).toEqual(whole);
        expect(loudness(whole)).toBeGreaterThan(0.02);
    });

    it('is brought to a place in its middle as if it had been sung from the start', () => {
        const whole = createVocalStream(VOCAL, HOW).render(SAMPLE_RATE * 3);
        const stream = createVocalStream(VOCAL, HOW);
        stream.seek(SAMPLE_RATE * 1.5);
        expect(stream.render(SAMPLE_RATE)).toEqual(whole.subarray(SAMPLE_RATE * 1.5, SAMPLE_RATE * 2.5));
    });

    it('starts again after a rest rather than from the beginning, and sounds the same', () => {
        // A long rest between the two lines: a place after it is reached from the rest.
        const rested: TVocalDoc = { ...VOCAL, lines: [VOCAL.lines[0]!, { notes: [{ beats: 4 }] }, VOCAL.lines[1]!] };
        const whole = createVocalStream(rested, HOW).render(SAMPLE_RATE * 6);
        const stream = createVocalStream(rested, HOW);
        stream.seek(SAMPLE_RATE * 3.5);
        const after = stream.render(SAMPLE_RATE * 2.5);
        const same = whole.subarray(SAMPLE_RATE * 3.5);
        expect(Math.abs(loudness(after) - loudness(same)) / loudness(same)).toBeLessThan(0.05);
    });

    it('is sung at the tempo it is given', () => {
        const sungFor = (tempo: number): number => {
            const track = createVocalStream(VOCAL, { ...HOW, tempo }).render(SAMPLE_RATE * 16);
            let last = 0;
            for (let i = 0; i < track.length; i += 1) if (Math.abs(track[i]!) > 0.01) last = i;
            return last / SAMPLE_RATE;
        };
        expect(sungFor(60)).toBeGreaterThan(sungFor(120) * 1.7);
    });
});

describe('a voice that sings', () => {
    const sing = (singers: TVocalDoc['singers'], pitch: string, lyric = 'a'): Float32Array =>
        createVocalStream({ format: VOCAL_FORMAT, language: 'es', singers, lines: [{ notes: [{ pitch, beats: 4, lyric }] }] }, HOW).render(SAMPLE_RATE * 2);
    const decibels = (track: Float32Array): number => 20 * Math.log10(loudness(track, SAMPLE_RATE * 0.5, SAMPLE_RATE * 1.5));

    it('sings its vowels near one loudness, high and low', () => {
        const levels = ['a', 'e', 'i', 'o', 'u'].flatMap((vowel) => ['A2', 'A3', 'A4', 'G5'].map((pitch) => decibels(sing({ her: { throat: 1.15 } }, pitch, vowel))));
        expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(8);
    });

    it('is not several of one voice when several sing, nor much louder', () => {
        const one = sing({ ana: {} }, 'A3');
        const four = sing({ ana: {}, eva: {}, juan: {}, luis: {} }, 'A3');
        expect(Math.abs(decibels(four) - decibels(one))).toBeLessThan(4);
        expect(four.reduce((most, value) => Math.max(most, Math.abs(value)), 0)).toBeLessThan(1);
        expect(sing({ ana: {}, eva: {} }, 'A3')).toEqual(sing({ ana: {}, eva: {} }, 'A3'));
        expect(sing({ ana: {}, eva: {} }, 'A3')).not.toEqual(sing({ ana: {}, luz: {} }, 'A3'));
    });
});

describe('a line several sing', () => {
    const part = (who: string | string[], singers: TVocalDoc['singers'], lyric: string, pitch = 'A3'): Float32Array =>
        createVocalStream({ format: VOCAL_FORMAT, language: 'es', singers, lines: [{ who, notes: [{ pitch, beats: 1, lyric }, { beats: 2 }] }] }, HOW).render(SAMPLE_RATE);

    it('dies away at a rest rather than growing', () => {
        const track = part(['a', 'b', 'c', 'd'], { a: {}, b: {}, c: {}, d: {} }, 'as');
        const step = SAMPLE_RATE * 0.005;
        const levels = Array.from({ length: 10 }, (_, i) => loudness(track, Math.round(SAMPLE_RATE * 0.5 + i * step), Math.round(SAMPLE_RATE * 0.5 + (i + 1) * step)));
        const sung = loudness(track, Math.round(SAMPLE_RATE * 0.45), Math.round(SAMPLE_RATE * 0.49));
        expect(Math.max(...levels)).toBeLessThan(sung * 1.5);
    });

    it('comes in at its own loudness, at the start and after a rest', () => {
        const enter = (before: number): number[] => {
            const plan = planSinging({ language: 'es', tempo: 120, vibrato: 0, notes: [...(before > 0 ? [{ beats: before }] : []), { pitch: 'A3', beats: 2, lyric: 'sa', share: 0.25 }] });
            const whole = planSinging({ language: 'es', tempo: 120, vibrato: 0, notes: [...(before > 0 ? [{ beats: before }] : []), { pitch: 'A3', beats: 2, lyric: 'sa' }] });
            return [plan, whole].map((one) => {
                const voice = createVoice(one.segments, singingPitch(one.notes, 0, 1), sungSettings(one));
                const out = new Float32Array(voice.length);
                voice.write(out, 0, out.length);
                const from = Math.round((one.offset + before * 0.5 - 0.1) * SAMPLE_RATE);
                return loudness(out, from, from + Math.round(0.03 * SAMPLE_RATE));
            });
        };
        for (const before of [0, 2]) {
            const [shared, alone] = enter(before);
            expect(alone!).toBeGreaterThan(0.01);
            expect(shared! / alone!).toBeCloseTo(0.25, 1);
        }
    });

    it('counts each singer once', () => {
        const singers = { a: {}, b: {} };
        expect(part(['a', 'a'], singers, 'la')).toEqual(part('a', singers, 'la'));
        expect(part([], singers, 'la').every((value) => value === 0)).toBe(true);
    });

    it('has no two alike, whatever their names', () => {
        const alone = (who: string) => part(who, { Aa: {}, BB: {} }, 'la');
        expect(alone('Aa')).not.toEqual(alone('BB'));
    });

    it('keeps the highest note of a deep throat inside its volume', () => {
        const track = part('a', { a: { throat: 0.5, volume: 0.8 } }, 'u', 'B5');
        expect(track.reduce((most, value) => Math.max(most, Math.abs(value)), 0)).toBeLessThanOrEqual(0.8);
    });
});

describe('the pitch of a sung line', () => {
    const notes = [
        { pitch: 60, start: 0, held: 0, fresh: true },
        { pitch: 67, start: 1, held: 0, fresh: false },
    ];
    const semitones = (hertz: number): number => 69 + 12 * Math.log2(hertz / 440);
    const at = (time: number, vibrato = 0): number => semitones(singingPitch(notes, vibrato, 1)(time));

    it('leaves a note before the next begins, goes a little past it and settles', () => {
        expect(at(0.9)).toBeCloseTo(60, 5);
        expect(at(1)).toBeGreaterThan(62);
        expect(at(1.06)).toBeGreaterThan(67);
        expect(at(1.06)).toBeLessThan(67.3);
        expect(at(1.2)).toBeCloseTo(67, 5);
    });

    it('wavers in one wave through the notes a syllable is held over', () => {
        const wave = vibratoWave(notes, 1);
        let before = wave(0.99);
        for (let time = 0.991; time < 1.01; time += 0.001) {
            const now = wave(time);
            expect(Math.abs(now - before)).toBeLessThan(0.06);
            before = now;
        }
    });

    it('has no steps in a fast passage', () => {
        const fast = [60, 67, 60, 67].map((pitch, i) => ({ pitch, start: i * 0.1, held: i * 0.1, fresh: i === 0 }));
        const pitch = singingPitch(fast, 0, 1);
        let before = semitones(pitch(0));
        for (let time = 0.0005; time < 0.5; time += 0.0005) {
            const now = semitones(pitch(time));
            expect(Math.abs(now - before)).toBeLessThan(0.11);
            before = now;
        }
    });

    it('is the same wherever it is asked from', () => {
        const whole = singingPitch(notes, 0.25, 3);
        for (let time = 0; time < 1.5; time += 0.01) whole(time);
        expect(whole(1.5)).toBe(singingPitch(notes, 0.25, 3)(1.5));
    });
});

describe('a part sung over a song, as a stream', () => {
    const streams = () => {
        const plain = createSongStream(SONG, SAMPLE_RATE);
        const sung = accompany(VOCAL, SONG).over(createSongStream(SONG, SAMPLE_RATE), { tempo: 120, transpose: 0 });
        return { plain, sung };
    };

    it('leaves the song as it is and adds a lane of its own', () => {
        const { plain, sung } = streams();
        expect(sung.voices).toEqual([...plain.voices, 'vocal']);
        const a = plain.render(SAMPLE_RATE * 2);
        const b = sung.render(SAMPLE_RATE * 2);
        expect(b.voices.pulse1).toEqual(a.voices.pulse1!);
        expect(b.voices.triangle).toEqual(a.voices.triangle!);
        expect(loudness(b.voices.vocal!)).toBeGreaterThan(0.02);
    });

    it('goes back round the loop with the song', () => {
        const { sung } = streams();
        const pass = sung.length - sung.loopSample;
        const first = sung.render(sung.length).voices.vocal!;
        const again = sung.render(pass).voices.vocal!;
        expect(again).toEqual(first.subarray(sung.loopSample));
    });

    it('is sung by someone else when asked', () => {
        const child = accompany(VOCAL, SONG, { singers: { voice: { throat: 1.3 } } }).over(createSongStream(SONG, SAMPLE_RATE), { tempo: 120, transpose: 0 });
        const { sung } = streams();
        expect(child.render(SAMPLE_RATE).voices.vocal).not.toEqual(sung.render(SAMPLE_RATE).voices.vocal!);
    });
});

describe('a part sung over a song, played', () => {
    let audio: ReturnType<typeof installFakeAudio>;
    let fetchSpy: ReturnType<typeof spyOn> | null = null;

    beforeEach(() => {
        audio = installFakeAudio();
        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => ({
            ok: true,
            json: async () => (String(url).endsWith('.vocal') ? VOCAL : SONG),
        })) as unknown as typeof fetch);
    });

    afterEach(() => {
        audio.restore();
        fetchSpy?.mockRestore();
        fetchSpy = null;
    });

    const settle = async (): Promise<void> => {
        for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };

    const started = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started && !source.stopped);

    const lanesOf = (context: TFakeContext): TFakeGain[] => [...new Set(started(context).map((source) => source.connectedTo as unknown as TFakeGain))];

    it('plays the song with the part in a lane of its own', async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        startTestScene(store, 'Stage', () => {
            song = useSong(accompany(VOCAL, SONG), { autoplay: true });
            return createScene();
        });
        await settle();
        const context = store.get('audio').manager!.context as unknown as TFakeContext;
        expect(song.playing).toBe(true);
        expect(lanesOf(context)).toHaveLength(3);
    });

    it('waits for a .vocal file before it plays', async () => {
        const { store } = createTestGame();
        let file!: TVocalFile;
        let song!: TSongHandle;
        startTestScene(store, 'Stage', () => {
            file = useLoadVocal({ src: '/music/song.vocal' });
            song = useSong(accompany(file, SONG), { autoplay: true });
            return createScene();
        });
        expect(file.status).toBe('loading');
        expect(song.playing).toBe(false);
        await settle();
        expect(file.status).toBe('ready');
        expect(file.doc).toEqual(VOCAL);
        expect(song.playing).toBe(true);
    });
});

describe('lyricsAt', () => {
    it('says the line being sung, its words so far and whole, a word put back together from its syllables', () => {
        expect(lyricsAt(VOCAL, 0)).toEqual({ line: 0, words: 'can', whole: 'canción', who: ['voice'], singing: true });
        expect(lyricsAt(VOCAL, 2.5)?.words).toBe('canción');
        expect(lyricsAt(VOCAL, 5)).toMatchObject({ line: 1, words: 'mar', whole: 'mar sol' });
    });

    it('says whether a syllable is being sung or it is the gap before the next', () => {
        expect(lyricsAt(VOCAL, 1)?.singing).toBe(true);
        expect(lyricsAt(VOCAL, 1.8)?.singing).toBe(false);
    });

    it('is null before the part, after it, and while the song is not playing', () => {
        expect(lyricsAt({ ...VOCAL, start: 4 }, 2)).toBeNull();
        expect(lyricsAt(VOCAL, 20)).toBeNull();
        expect(lyricsAt(VOCAL, null)).toBeNull();
    });

    it('says who sings each line', () => {
        const duet: TVocalDoc = { ...VOCAL, singers: { she: {}, he: { transpose: -12 } }, lines: [{ ...VOCAL.lines[0]!, who: 'she' }, VOCAL.lines[1]!] };
        expect(lyricsAt(duet, 1)?.who).toEqual(['she']);
        expect(lyricsAt(duet, 5)?.who).toEqual(['she', 'he']);
    });
});

describe('a .vocal file', () => {
    it('is read as it is written', () => {
        expect(parseVocalDoc(JSON.parse(JSON.stringify(VOCAL)))).toEqual(VOCAL);
    });

    it('says what it cannot sing, naming the file', () => {
        expect(() => parseVocalDoc({ format: 1 }, 'a.vocal')).toThrow('"a.vocal": it has no "lines"');
        expect(() => parseVocalDoc({ format: 1, singers: { her: null }, lines: [] })).toThrow('singer "her" is not a voice');
        expect(() => parseVocalDoc({ format: 2, lines: [] })).toThrow('newer than this engine reads');
        expect(() => parseVocalDoc({ format: 1, lines: [{ notes: [], who: 'him' }] })).toThrow('"him", who is not in "singers"');
        expect(() => parseVocalDoc({ format: 1, lines: [{ notes: [{ beats: -1 }] }] })).toThrow('line 1, note 1: "beats"');
    });
});

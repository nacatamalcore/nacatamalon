import { describe, expect, it } from 'bun:test';
import { BUILTIN, renderSong } from '../src';
import { loadBuiltinSong } from '../src/audio/synth/builtin';
import { createSongStream } from '../src/audio/synth/song_stream';
import type { TSongDoc } from '../src/audio/synth';

/**
 * A song made into sound as it plays, a stretch at a time: what it makes has to be what the song
 * made all at once is, sample for sample, however the stretches are cut, round the loop, and after a
 * jump into the middle. Only the echo is allowed to differ past where the loop starts: made as it
 * plays, it goes on round the loop by itself.
 */

const RATE = 32000;

// The first song of each console, and the first that plays samples and the first that echoes.
const picked = async (): Promise<Array<[string, TSongDoc]>> => {
    const docs: Array<[string, TSongDoc]> = [];
    const wanted = new Set(['nes', 'snes', 'genesis', 'dpcm', 'echo']);
    for (const info of BUILTIN.MUSIC.SONGS) {
        const doc = await loadBuiltinSong(info.key)!;
        const has = [info.chip, ...(doc.voices.dpcm !== undefined ? ['dpcm'] : []), ...(info.chip === 'snes' && renderSong(doc, RATE).echo !== undefined ? ['echo'] : [])];
        if (has.some((kind) => wanted.has(kind))) {
            docs.push([info.key, doc]);
            for (const kind of has) wanted.delete(kind);
        }
    }
    return docs;
};

// The same numbers every run, so a stretch that breaks something breaks it every time.
const cuts = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return 1 + Math.floor((seed / 2147483648) * 3000);
};

const played = (doc: TSongDoc, samples: number, next: () => number) => {
    const stream = createSongStream(doc, RATE);
    const voices = Object.fromEntries(stream.voices.map((voice) => [voice, new Float32Array(samples)]));
    const echo = stream.hasEcho ? new Float32Array(samples) : null;
    for (let at = 0; at < samples;) {
        const count = Math.min(samples - at, next());
        const stretch = stream.render(count);
        for (const voice of stream.voices) voices[voice]!.set(stretch.voices[voice]!, at);
        if (echo !== null) echo.set(stretch.echo!, at);
        at += count;
    }
    return { stream, voices, echo };
};

/** The first sample two tracks differ at, or `-1`. */
const firstDifference = (a: Float32Array, b: Float32Array, length = Math.min(a.length, b.length)): number => {
    for (let i = 0; i < length; i += 1) if (a[i] !== b[i]) return i;
    return -1;
};

describe('a song made as it plays', async () => {
    const songs = await picked();

    it('has one song of each console to be measured by, and ones with samples and echo', () => {
        const chips = new Set(songs.map(([key]) => BUILTIN.MUSIC.SONGS.find((info) => info.key === key)!.chip));
        expect([...chips].sort()).toEqual(['genesis', 'nes', 'snes']);
    });

    for (const [key, doc] of songs) {
        it(`comes out as ${key} made at once, however it is cut, and round its loop`, () => {
            const whole = renderSong(doc, RATE);
            const laps = whole.length + (whole.length - whole.loopSample);
            const { voices } = played(doc, laps, cuts(key.length));

            for (const [voice, track] of Object.entries(whole.voices)) {
                const got = voices[voice]!;
                expect({ voice, first: firstDifference(got, track!) }).toEqual({ voice, first: -1 });
                // The second time round is the loop again, from where it goes back to.
                expect({ voice, again: firstDifference(got.subarray(whole.length), track!.subarray(whole.loopSample)) }).toEqual({ voice, again: -1 });
            }
        });

        it(`comes out as ${key} made at once from a place in its middle it is taken to`, () => {
            const whole = renderSong(doc, RATE);
            const stream = createSongStream(doc, RATE);
            const middle = Math.floor(whole.length * 0.37);
            stream.seek(middle);
            const stretch = stream.render(Math.min(4000, whole.length - middle));

            expect(stream.position).toBe(middle + stretch.voices[stream.voices[0]!]!.length);
            for (const [voice, track] of Object.entries(whole.voices)) {
                expect({ voice, first: firstDifference(stretch.voices[voice as keyof typeof whole.voices]!, track!.subarray(middle)) }).toEqual({ voice, first: -1 });
            }
        });
    }

    it('echoes as the song made at once does, up to where the loop starts', () => {
        const echoing = songs.filter(([, doc]) => doc.chip === 'snes' && renderSong(doc, RATE).echo !== undefined);
        expect(echoing.length).toBeGreaterThan(0);
        for (const [, doc] of echoing) {
            const whole = renderSong(doc, RATE);
            const { echo } = played(doc, whole.length, cuts(3));
            expect(firstDifference(echo!, whole.echo!, whole.loopSample)).toBe(-1);
        }
    });
});

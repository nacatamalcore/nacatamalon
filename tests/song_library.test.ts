import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { renderSong, parseSongDoc, SONG_BUILTINS } from '../src';
import { analyzeAudio, mixSong, serializeSongDoc } from '../src/authoring';
import { loadBuiltinSong } from '../src/audio/synth/builtin';
import { createScene } from '../src/scene/create_scene';
import { useSong } from '../src/hooks/audio/use_song';
import { useLoadSong } from '../src/hooks/loaders/use_load_song';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';

/**
 * The songs the engine has: every one a song that reads, plays and saves like any other, loaded by
 * its key without fetching anything.
 */

describe("the engine's songs", () => {
    it('are thirty-nine, each with its own key', () => {
        expect(SONG_BUILTINS).toHaveLength(39);
        expect(new Set(SONG_BUILTINS.map((info) => info.key)).size).toBe(39);
    });

    for (const info of SONG_BUILTINS) {
        it(`${info.key} reads as a .song, plays with no mistakes, and does not distort`, async () => {
            const doc = await loadBuiltinSong(`nacatamalon:${info.key}`)!;
            expect(parseSongDoc(JSON.parse(serializeSongDoc(doc)), info.key)).toEqual(doc);
            expect(doc.chip ?? 'nes').toBe(info.chip);
            const rendered = renderSong(doc);
            expect([rendered.errors, rendered.instrumentErrors]).toEqual([[], []]);
            const measure = analyzeAudio(mixSong(rendered), rendered.sampleRate);
            expect(measure.clipped).toBe(0);
            expect(measure.peak).toBeGreaterThan(0.1);
        });
    }

    it('is nothing for a key it does not have', () => {
        expect(loadBuiltinSong('nacatamalon:never-written')).toBeNull();
    });
});

describe('a song asked for by its key', () => {
    let audio: ReturnType<typeof installFakeAudio>;
    let fetchSpy: ReturnType<typeof spyOn>;
    let warn: ReturnType<typeof spyOn>;

    beforeEach(() => {
        audio = installFakeAudio();
        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => { throw new Error('no fetching'); }) as unknown as typeof fetch);
        warn = spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        audio.restore();
        fetchSpy.mockRestore();
        warn.mockRestore();
    });

    it('is loaded from the engine, and plays', async () => {
        const { store } = createTestGame();
        let playing = false;
        startTestScene(store, 'Credits', () => {
            const song = useSong(useLoadSong({ src: 'nacatamalon:gymnopedie' }), { autoplay: true });
            void whenLoaded(store.get('assets').songs.get('nacatamalon:gymnopedie')!).then(() => { playing = song.playing; });
            return createScene();
        });
        const file = store.get('assets').songs.get('nacatamalon:gymnopedie')!;
        await whenLoaded(file);
        for (let i = 0; i < 5; i += 1) await Promise.resolve();

        expect(file.status).toBe('ready');
        expect(file.doc?.chip).toBe('snes');
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(playing || file.status === 'ready').toBe(true);
    });

    it('says when the engine has no song of that name', async () => {
        const { store } = createTestGame();
        startTestScene(store, 'Credits', () => {
            useSong(useLoadSong({ src: 'nacatamalon:never-written' }));
            return createScene();
        });
        const file = store.get('assets').songs.get('nacatamalon:never-written')!;
        await whenLoaded(file);

        expect(file.status).toBe('error');
        expect(String(warn.mock.calls[0]?.[1])).toContain('SONG_BUILTINS');
    });
});

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useSong } from '../src/hooks/audio/use_song';
import { useLoadTrackerSong } from '../src/hooks/loaders/use_load_tracker_song';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import { FAMISTUDIO, FAMITRACKER } from './helpers/tracker_texts';
import type { TFakeContext } from './helpers/test_audio';
import type { TSongHandle } from '../src/audio';
import type { TSongFile } from '../src/loaders/song';
import type { TRuntimeStore } from '../src/store';

/**
 * A song loaded straight from a tracker's text export: read when it lands, its samples kept with it,
 * and played on the engine's NES like any other song.
 */

let audio: ReturnType<typeof installFakeAudio>;
let fetchSpy: ReturnType<typeof spyOn>;
let warn: ReturnType<typeof spyOn>;
const served = new Map<string, string>([
    ['/music/famitracker.txt', FAMITRACKER],
    ['/music/famistudio.txt', FAMISTUDIO([0, 8, 12])],
    ['/music/notes.txt', 'just some notes'],
]);

beforeEach(() => {
    audio = installFakeAudio();
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
        const text = served.get(url);
        return text === undefined ? { ok: false, status: 404 } : { ok: true, text: async () => text };
    }) as unknown as typeof fetch);
    warn = spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    audio.restore();
    fetchSpy.mockRestore();
    warn.mockRestore();
});

const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const load = async (src: string): Promise<{ store: TRuntimeStore; file: TSongFile; song: TSongHandle }> => {
    const { store } = createTestGame();
    let file!: TSongFile;
    let song!: TSongHandle;
    startTestScene(store, 'Tracker', () => {
        file = useLoadTrackerSong({ src });
        song = useSong(file);
        return createScene();
    });
    await whenLoaded(file);
    await settle();
    return { store, file, song };
};

describe('a song loaded from a tracker\'s export', () => {
    it('reads a FamiTracker export, keeps its samples in memory, and plays every voice, the samples fetched never', async () => {
        const { store, file, song } = await load('/music/famitracker.txt');

        expect(file.status).toBe('ready');
        expect(file.doc?.chip ?? 'nes').toBe('nes');
        expect([...file.samples.keys()]).toEqual(['/music/famitracker.txt#kick.wav']);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        song.play();
        const context = store.get('audio').manager!.context as unknown as TFakeContext;
        // Every voice through a lane of its own, each made as it plays, a stretch at a time.
        const lanes = new Set(context.sources.filter((source) => source.started).map((source) => source.connectedTo));
        expect(lanes.size).toBe(Object.keys(file.doc!.voices).length);
        expect(song.errors).toEqual([]);
    });

    it('reads a FamiStudio export the same', async () => {
        const { file, song } = await load('/music/famistudio.txt');

        expect(file.status).toBe('ready');
        expect(file.samples.size).toBe(1);
        song.play();
        expect(song.playing).toBe(true);
        // Its expansion chip's voice is not one the NES has: said once, as it lands.
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('/music/famistudio.txt'))).toBe(true);
    });

    it('is an error, said, for a file that is not such an export, and for one that is not there', async () => {
        const wrong = await load('/music/notes.txt');
        expect(wrong.file.status).toBe('error');
        const missing = await load('/music/gone.txt');
        expect(missing.file.status).toBe('error');
        expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('useLoadTrackerSong')).length).toBe(2);
    });
});

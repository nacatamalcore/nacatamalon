import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { useLoadAudio } from '../src/hooks/loaders/use_load_audio';
import { useSound } from '../src/hooks/audio/use_sound';
import { useMusic } from '../src/hooks/audio/use_music';
import { useAudioListener } from '../src/hooks/audio/use_audio_listener';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { updateAudio } from '../src/audio';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TBox } from '../src/box';
import type { TSceneDoc } from '../src/scene/document';
import type { TFakeContext } from './helpers/test_audio';
import type { TMusicAttachment, TSoundAttachment } from '../src/audio';

/**
 * A sound as something an object **carries**.
 *
 * The claim worth testing is the one that is easy to get wrong in the tempting direction: what is
 * written down is how a sound was asked to play, never what it is playing. A scene saved while the
 * music was halfway through must open ready to start it, and the only way to be sure is to save one
 * mid-playback and read the file.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

let audio: ReturnType<typeof installFakeAudio>;
let fetchSpy: ReturnType<typeof spyOn> | null = null;
let warn: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
    audio = installFakeAudio();
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch);
});

afterEach(() => {
    audio.restore();
    fetchSpy?.mockRestore();
    fetchSpy = null;
    warn?.mockRestore();
    warn = null;
});

/**
 * Builds a scene, writes it down, and hands back both halves.
 */
const written = (body: () => void): { root: TBox; doc: TSceneDoc } => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return { root, doc: serializeScene(root) };
};

/**
 * The same document, built into a second game that never saw the first, and written again.
 */
const rebuilt = (doc: TSceneDoc): TSceneDoc => {
    const { store } = createTestGame();
    registerScene(store, doc.name, sceneFromDoc(doc));
    return serializeScene(startScene(store, doc.name));
};

describe('a sound an object carries', () => {
    it('is kept on the object with what it was asked for', () => {
        const { root } = written(() => {
            useSound({ src: '/audio/theme.mp3' }, { id: 'music', channel: 'music', loop: true, volume: 0.4, autoplay: true });
        });

        expect(root.sounds).toHaveLength(1);
        expect(root.sounds[0]).toMatchObject({
            id: 'music', channel: 'music', loop: true, volume: 0.4, autoplay: true, spatial: false,
        });
        expect((root.sounds[0] as TSoundAttachment).clip.key).toBe('/audio/theme.mp3');
    });

    it('is written and read back unchanged, with its file in the manifest', () => {
        const { doc } = written(() => {
            useSound({ src: '/audio/theme.mp3' }, { id: 'music', channel: 'music', loop: true, volume: 0.4, autoplay: true });
        });

        expect(doc.assets).toEqual([{ type: 'audio', key: '/audio/theme.mp3', src: '/audio/theme.mp3' }]);
        expect(doc.root.components[0]).toEqual({
            type: 'sound', id: 'music', audio: '/audio/theme.mp3',
            volume: 0.4, loop: true, channel: 'music', autoplay: true,
        });
        // A field the writer emits and the reader changes shows up right here, as drift.
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('says nothing about the settings nobody changed', () => {
        const { doc } = written(() => {
            useSound({ src: '/audio/coin.mp3' }, { id: 'coin' });
        });

        // An absent field is its default, which is the rule the whole format keeps.
        expect(doc.root.components[0]).toEqual({ type: 'sound', id: 'coin', audio: '/audio/coin.mp3' });
    });

    it('leaves out the two distances for a sound that is not placed', () => {
        const { doc } = written(() => {
            useSound({ src: '/audio/coin.mp3' }, { id: 'coin', refDistance: 10, maxDistance: 20 });
        });

        // They only mean something placed, so an ordinary sound does not carry two numbers that
        // nothing will read and somebody will try to tune.
        expect(doc.root.components[0]).not.toHaveProperty('refDistance');
        expect(doc.root.components[0]).not.toHaveProperty('maxDistance');
    });

    it('names the file once however many objects play it', () => {
        const Torch = (x: number) => {
            useTransform({ x, y: 0 });
            useSound({ src: '/audio/fire.mp3' }, { spatial: true, loop: true });
        };
        const { doc } = written(() => {
            useSpawn(Torch)(10);
            useSpawn(Torch)(90);
        });

        expect(doc.assets).toHaveLength(1);
        expect(doc.root.children).toHaveLength(2);
    });

    it('writes the knobs as they are now, so an options screen survives the save', () => {
        const { doc } = written(() => {
            const music = useSound({ src: '/audio/theme.mp3' }, { id: 'music', volume: 1 });
            // The pause menu turned it down, and that is a fact about the level, not about the run.
            music.setVolume(0.2);
        });

        expect(doc.root.components[0]).toMatchObject({ volume: 0.2 });
    });

    it('writes the intention and not what is sounding', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            const clip = useLoadAudio({ src: '/audio/theme.mp3' });
            const music = useSound(clip, { id: 'music', loop: true });
            void whenLoaded(clip).then(() => { music.play(); });
            return createScene();
        });
        await whenLoaded(store.get('assets').sounds.get('/audio/theme.mp3')!);

        // Saved with the music going.
        const doc = serializeScene(root);
        expect(doc.root.components[0]).not.toHaveProperty('autoplay');

        // Which means the scene comes back ready to start it, and silent until something does:
        // the file arrives, and still nothing has played.
        const other = createTestGame();
        registerScene(other.store, 'Level', sceneFromDoc(doc));
        startScene(other.store, 'Level');
        await whenLoaded(other.store.get('assets').sounds.get('/audio/theme.mp3')!);

        const context = other.store.get('audio').manager!.context as unknown as TFakeContext;
        expect(context.sources.filter((source) => source.started)).toHaveLength(0);
    });
});

describe('a sound placed in the world', () => {
    it('follows the object, whichever of the two carries its placement', async () => {
        const Torch = () => {
            useTransform({ x: 40, y: 60 });
            useSound({ src: '/audio/fire.mp3' }, { spatial: true, loop: true, autoplay: true });
        };
        const Lamp = () => {
            // No placement of its own: what it draws is where it is, and that is where it sounds.
            createSprite({ width: 8, height: 8, tint, transform: at(120, 30) });
            useSound({ src: '/audio/fire.mp3' }, { spatial: true, loop: true, autoplay: true });
        };

        const { doc } = written(() => {
            useSpawn(Torch)();
            useSpawn(Lamp)();
        });

        // Nothing of this is written: the document says `spatial`, and what the voice follows is
        // worked out again from the object it landed on.
        expect(doc.root.children[0].components[0]).not.toHaveProperty('transform');

        const { store } = createTestGame();
        registerScene(store, doc.name, sceneFromDoc(doc));
        startScene(store, doc.name);
        await whenLoaded(store.get('assets').sounds.get('/audio/fire.mp3')!);
        updateAudio(store);

        const context = store.get('audio').manager!.context as unknown as TFakeContext;
        const places = context.panners.map((panner) => panner.positionX.value).sort((a, b) => a - b);
        // One from the box's own placement, one from the corner of what the box draws.
        expect(places).toEqual([40, 120]);
    });
});

describe('a sound the manifest does not name', () => {
    it('is reported and costs only itself', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Level',
            assets: [],
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [
                    { type: 'sound', id: 's1', audio: 'missing' },
                    { type: 'sprite', id: 'art', texture: null, tint, width: 4, height: 4 },
                ],
            },
        }, 'test');

        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc, 'test'));
        const root = startScene(store, 'Level');

        expect(root.sounds).toHaveLength(0);
        // The rest of the level opened, which is the whole point of the reader never throwing.
        expect(root.drawables).toHaveLength(1);
        expect(String(warn.mock.calls[0][0])).toContain('missing');
    });

    it('is dropped as unsupported when it names no file at all', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Level',
            assets: [],
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'sound', id: 's1' }],
            },
        }, 'test');

        // Kept verbatim in the hole for what this version cannot read, so writing the file out
        // again does not quietly delete it.
        expect(doc.root.components).toHaveLength(0);
        expect(JSON.stringify(serializeScene(startScene(
            (() => { const { store } = createTestGame(); registerScene(store, 'Level', sceneFromDoc(doc, 'test')); return store; })(),
            'Level',
        )))).toContain('sound');
    });
});

describe('the rest of a sound scene, written down', () => {
    it('keeps a cone and an area, and leaves the distances nobody chose unwritten', () => {
        const { doc } = written(() => {
            useSound({ src: '/audio/radio.mp3' }, { id: 'radio', spatial: true, cone: { inner: 60, outer: 180, outerVolume: 0.2 } });
            useSound({ src: '/audio/birds.mp3' }, { id: 'meadow', zone: { shape: { kind: 'box', size: [8, 4, 8] }, fade: 3 } });
        });

        expect(doc.root.components).toEqual([
            { type: 'sound', id: 'radio', audio: '/audio/radio.mp3', spatial: true, cone: { inner: 60, outer: 180, outerVolume: 0.2 } },
            { type: 'sound', id: 'meadow', audio: '/audio/birds.mp3', zone: { shape: { kind: 'box', size: [8, 4, 8] }, fade: 3 } },
        ]);
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('keeps the distances somebody did choose, even the ones that match a default', () => {
        const { doc } = written(() => {
            useSound({ src: '/audio/fire.mp3' }, { id: 'fire', spatial: true, refDistance: 100, maxDistance: 20 });
        });

        expect(doc.root.components[0]).toMatchObject({ refDistance: 100, maxDistance: 20 });
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('keeps music in layers, each file in the manifest and each layer at the volume it was left at', () => {
        const { doc } = written(() => {
            const music = useMusic({
                id: 'theme',
                layers: { land: { src: '/audio/land.ogg' }, water: { src: '/audio/water.ogg', volume: 0 } },
                autoplay: true,
            });
            music.setLayer('land', 0.5);
        });

        expect(doc.assets.map((asset) => asset.key).sort()).toEqual(['/audio/land.ogg', '/audio/water.ogg']);
        expect(doc.root.components[0]).toEqual({
            type: 'music',
            id: 'theme',
            layers: [{ name: 'land', audio: '/audio/land.ogg', volume: 0.5 }, { name: 'water', audio: '/audio/water.ogg', volume: 0 }],
            autoplay: true,
        });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('keeps the ears on the object that had them, and whether they were on', () => {
        const Player = () => {
            useTransform({ x: 4 });
            useAudioListener({ enabled: false }).id = 'ears';
        };
        const { doc } = written(() => { useSpawn(Player)(); });

        expect(doc.root.children[0].components).toContainEqual({ type: 'audio-listener', id: 'ears', enabled: false });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
    });

    it('plays the layers it has when one file is missing, and says which', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Level',
            assets: [{ type: 'audio', key: 'land', src: '/audio/land.ogg' }],
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'music', id: 'm', layers: [{ name: 'land', audio: 'land' }, { name: 'water', audio: 'gone' }] }],
            },
        }, 'test');

        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc, 'test'));
        const root = startScene(store, 'Level');

        expect((root.sounds[0] as TMusicAttachment).layers.map((layer) => layer.name)).toEqual(['land']);
        expect(String(warn.mock.calls[0][0])).toContain('gone');
    });

    it('drops music with no layer that could play', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Level',
            assets: [],
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'music', id: 'm', layers: [{ name: '', audio: 'x' }, { name: 'a' }] }],
            },
        }, 'test');

        expect(doc.root.components).toHaveLength(0);
    });
});

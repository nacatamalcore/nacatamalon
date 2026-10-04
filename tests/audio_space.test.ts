import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture/create_sprite_texture';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useSound } from '../src/hooks/audio/use_sound';
import { useAudioListener } from '../src/hooks/audio/use_audio_listener';
import { updateAudio, zoneVolume2d, zoneVolume3d } from '../src/audio';
import { fromEuler, identity } from '../src/math/quat';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakePanner } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TAudioListener, TSoundHandle } from '../src/audio';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * Sound in space: where a placed sound is heard from, where the ears are, and how an area fills.
 *
 * Every number here is one a person would hear wrong: a sound on a child heard where the child was
 * written rather than where it is, ears that do not turn with the camera, an area heard at full
 * volume across the whole level.
 */

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

const contextOf = (store: TRuntimeStore): TFakeContext => store.get('audio').manager!.context as unknown as TFakeContext;

/**
 * Waits for every clip the game asked for, so `play` has something to play.
 */
const loaded = async (store: TRuntimeStore): Promise<void> => {
    await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
};

const PERSPECTIVE = { projection: 'perspective', fov: 60, near: 0.1, far: 100 } as const;

const near = (actual: number, wanted: number): void => {
    expect(actual).toBeCloseTo(wanted, 5);
};

/**
 * The three values of a point the browser was told, as one.
 */
const pointOf = (target: { positionX: { value: number }; positionY: { value: number }; positionZ: { value: number } }) =>
    [target.positionX.value, target.positionY.value, target.positionZ.value];

describe('a placed sound follows its object in the world', () => {
    it('is heard where a child ends up, not where it was written, and moves with its parent', async () => {
        const { store } = createTestGame();
        let parent!: TTransform3d;
        let sound!: TSoundHandle;
        const Emitter = () => {
            useTransform({ z: -2 });
            sound = useSound({ src: '/audio/bird.mp3' }, { spatial: true, loop: true });
        };
        const Carrier = () => {
            parent = useTransform({ x: 10, rotationY: Math.PI / 2 });
            useSpawn(Emitter)();
        };
        startTestScene(store, 'Level', () => {
            useCamera3d(PERSPECTIVE);
            useSpawn(Carrier)();
            return createScene();
        });
        await loaded(store);
        sound.play();

        const [panner] = contextOf(store).panners;
        const [x, y, z] = pointOf(panner);
        // Two ahead of a carrier turned a quarter to the left is two to its left in the world.
        near(x, 8);
        near(y, 0);
        near(z, 0);

        parent.x = 20;
        updateAudio(store);
        near(panner.positionX.value, 18);
    });
});

describe('where the game is heard from', () => {
    it('is the perspective camera, facing the way it looks', async () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ ...PERSPECTIVE, x: 1, y: 2, z: 3, rotationY: Math.PI / 2 });
            useSound({ src: '/audio/bird.mp3' }, { spatial: true });
            return createScene();
        });
        updateAudio(store);

        const { listener } = contextOf(store);
        expect(pointOf(listener)).toEqual([1, 2, 3]);
        // Turned a quarter to the left, it looks down -X, with its head still up.
        near(listener.forwardX.value, -1);
        near(listener.forwardY.value, 0);
        near(listener.forwardZ.value, 0);
        near(listener.upY.value, 1);
    });

    it('is the middle of what an orthographic camera shows, in its pixels', async () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'orthographic', x: 40, y: 10 });
            useSound({ src: '/audio/bird.mp3' }, { spatial: true });
            return createScene();
        });
        updateAudio(store);

        const { listener } = contextOf(store);
        // The frustum is the screen from the camera's corner, and in this space y goes up.
        expect(listener.positionX.value).toBe(40 + 160);
        expect(listener.positionY.value).toBe(224 - 112 - 10);
    });

    it('is the object with ears when there is one, and the camera again once they are off', async () => {
        const { store } = createTestGame();
        let ears!: TAudioListener;
        const Player = () => {
            useTransform({ x: 5, rotationY: Math.PI });
            ears = useAudioListener();
        };
        startTestScene(store, 'Level', () => {
            useCamera3d({ ...PERSPECTIVE, z: 9 });
            useSpawn(Player)();
            return createScene();
        });
        updateAudio(store);

        const { listener } = contextOf(store);
        expect(pointOf(listener)).toEqual([5, 0, 0]);
        // Turned right round, it faces +Z.
        near(listener.forwardZ.value, 1);

        ears.enabled = false;
        updateAudio(store);
        expect(pointOf(listener)).toEqual([0, 0, 9]);
        near(listener.forwardZ.value, -1);
    });

    it('says once when two sets of ears are on, and uses the first', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        const Ears = (x: number) => {
            useTransform({ x });
            useAudioListener();
        };
        startTestScene(store, 'Level', () => {
            useCamera3d(PERSPECTIVE);
            useSpawn(Ears)(3);
            useSpawn(Ears)(7);
            return createScene();
        });
        updateAudio(store);
        updateAudio(store);

        expect(contextOf(store).listener.positionX.value).toBe(3);
        expect(warn!.mock.calls.filter((call: unknown[]) => String(call[0]).includes('useAudioListener'))).toHaveLength(1);
    });
});

describe('how a placed sound is heard', () => {
    it('tells front from behind in depth, measures in units, and takes the distances it was given', async () => {
        const { store } = createTestGame();
        let plain!: TSoundHandle;
        let tuned!: TSoundHandle;
        startTestScene(store, 'Level', () => {
            useCamera3d(PERSPECTIVE);
            plain = useSound({ src: '/audio/bird.mp3' }, { spatial: true });
            tuned = useSound({ src: '/audio/bird.mp3' }, { spatial: true, refDistance: 4, maxDistance: 60 });
            return createScene();
        });
        await loaded(store);
        plain.play();
        tuned.play();

        const [first, second] = contextOf(store).panners;
        expect(first.panningModel).toBe('HRTF');
        // A straight line down to silence at the far distance: the browser's own curve never gets
        // there, and a birdhouse heard from every corner of the level is what that sounds like.
        expect(first.distanceModel).toBe('linear');
        expect([first.refDistance, first.maxDistance]).toEqual([1, 20]);
        expect([second.refDistance, second.maxDistance]).toEqual([4, 60]);
    });

    it('stays side to side in pixels on a flat scene', async () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        startTestScene(store, 'Level', () => {
            sound = useSound({ src: '/audio/bird.mp3' }, { spatial: true });
            return createScene();
        });
        await loaded(store);
        sound.play();

        const [panner] = contextOf(store).panners;
        expect(panner.panningModel).toBe('equalpower');
        expect([panner.refDistance, panner.maxDistance]).toEqual([100, 2000]);
    });

    it('is put right on the ears when it lives in the other kind of space', async () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        startTestScene(store, 'Level', () => {
            useCamera3d({ ...PERSPECTIVE, x: 2, y: 3, z: 4 });
            return createScene();
        });
        startTestScene(store, 'Hud', () => {
            createSprite({ width: 8, height: 8, transform: { x: 300, y: 50, rotation: 0, scaleX: 1, scaleY: 1 } });
            sound = useSound({ src: '/audio/bird.mp3' }, { spatial: true });
            return createScene();
        });
        await loaded(store);
        sound.play();

        // Its 300 pixels mean nothing to ears measuring in units, so it is heard from no side.
        expect(pointOf(contextOf(store).panners[0])).toEqual([2, 3, 4]);
    });

    it('is put right on the ears when it lives inside a picture', async () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        const Screen = () => {
            useTransform({ x: 50 });
            sound = useSound({ src: '/audio/bird.mp3' }, { spatial: true });
        };
        startTestScene(store, 'Level', () => {
            useCamera3d({ ...PERSPECTIVE, z: 6 });
            createSpriteTexture({ width: 16, height: 16 }, Screen);
            return createScene();
        });
        await loaded(store);
        sound.play();

        expect(pointOf(contextOf(store).panners[0])).toEqual([0, 0, 6]);
    });
});

describe('a sound with a cone', () => {
    it('hands its angles over and faces its object\'s -Z in depth', async () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        const Radio = () => {
            useTransform({ rotationY: Math.PI / 2 });
            sound = useSound({ src: '/audio/radio.mp3' }, { spatial: true, cone: { inner: 60, outer: 180, outerVolume: 0.2 } });
        };
        startTestScene(store, 'Level', () => {
            useCamera3d(PERSPECTIVE);
            useSpawn(Radio)();
            return createScene();
        });
        await loaded(store);
        sound.play();

        const panner: TFakePanner = contextOf(store).panners[0];
        expect([panner.coneInnerAngle, panner.coneOuterAngle, panner.coneOuterGain]).toEqual([60, 180, 0.2]);
        near(panner.orientationX.value, -1);
        near(panner.orientationZ.value, 0);
    });

    it('faces along its turn on a flat scene, with y going over negated', async () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        const Radio = () => {
            useTransform({ rotation: Math.PI / 2 });
            sound = useSound({ src: '/audio/radio.mp3' }, { spatial: true, cone: { inner: 90, outer: 270, outerVolume: 0 } });
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Radio)();
            return createScene();
        });
        await loaded(store);
        sound.play();

        // A quarter turn clockwise on screen points down the screen, which is down for the ears.
        const panner = contextOf(store).panners[0];
        near(panner.orientationX.value, 0);
        near(panner.orientationY.value, -1);
    });
});

describe('a sound that fills an area', () => {
    it('is full inside, fades outside, and never gets a side', async () => {
        const { store } = createTestGame();
        let player!: TTransform3d;
        let sound!: TSoundHandle;
        const Meadow = () => {
            useTransform({ x: 10 });
            sound = useSound({ src: '/audio/birds.mp3' }, { spatial: true, loop: true, zone: { shape: { kind: 'box', size: [4, 4, 4] }, fade: 2 } });
        };
        const Player = () => {
            player = useTransform({ x: 10 });
            useAudioListener();
        };
        startTestScene(store, 'Level', () => {
            useCamera3d(PERSPECTIVE);
            useSpawn(Meadow)();
            useSpawn(Player)();
            return createScene();
        });
        await loaded(store);
        sound.play();
        const context = contextOf(store);

        // The area wins over the point: nothing pans it.
        expect(context.panners).toHaveLength(0);
        const area = context.sources[0].connectedTo as unknown as { gain: { value: number } };
        expect(area.gain.value).toBe(1);

        // One past the edge of a fade of two.
        player.x = 13;
        updateAudio(store);
        near(area.gain.value, 0.5);

        player.x = 15;
        updateAudio(store);
        expect(area.gain.value).toBe(0);
    });
});

describe('zoneVolume', () => {
    const still = { position: { x: 0, y: 0, z: 0 }, quaternion: identity(), scale: { x: 1, y: 1, z: 1 } };

    it('measures a box in the world, grown with its object and turned with it', () => {
        const box = { shape: { kind: 'box' as const, size: [2, 2, 2] as [number, number, number] }, fade: 4 };
        expect(zoneVolume3d(box, still, { x: 0.9, y: 0, z: 0 })).toBe(1);
        near(zoneVolume3d(box, still, { x: 3, y: 0, z: 0 })!, 0.5);

        // Twice as long along x: the edge moves out, and the fade stays in the world's units.
        const long = { ...still, scale: { x: 2, y: 1, z: 1 } };
        expect(zoneVolume3d(box, long, { x: 1.9, y: 0, z: 0 })).toBe(1);
        near(zoneVolume3d(box, long, { x: 4, y: 0, z: 0 })!, 0.5);

        // Turned a quarter, that long side now lies along z.
        const turned = { ...long, quaternion: fromEuler(0, Math.PI / 2, 0) };
        expect(zoneVolume3d(box, turned, { x: 0, y: 0, z: 1.9 })).toBe(1);
        expect(zoneVolume3d(box, turned, { x: 1.9, y: 0, z: 0 })).toBeLessThan(1);
    });

    it('fills a ball, and everything under an endless floor', () => {
        const ball = { shape: { kind: 'sphere' as const, radius: 1 }, fade: 2 };
        near(zoneVolume3d(ball, still, { x: 0, y: 2, z: 0 })!, 0.5);

        const water = { shape: { kind: 'plane' as const }, fade: 1 };
        expect(zoneVolume3d(water, still, { x: 50, y: -3, z: 9 })).toBe(1);
        near(zoneVolume3d(water, still, { x: 0, y: 0.5, z: 0 })!, 0.5);
    });

    it('stops dead at the edge with no fade', () => {
        const hard = { shape: { kind: 'sphere' as const, radius: 1 }, fade: 0 };
        expect(zoneVolume3d(hard, still, { x: 1, y: 0, z: 0 })).toBe(1);
        expect(zoneVolume3d(hard, still, { x: 1.01, y: 0, z: 0 })).toBe(0);
    });

    it('does the same on the plane, where under the floor is further down the screen', () => {
        const flat = { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 };
        const rect = { shape: { kind: 'rect' as const, width: 40, height: 20 }, fade: 10 };
        expect(zoneVolume2d(rect, flat, { x: 119, y: 100 })).toBe(1);
        near(zoneVolume2d(rect, flat, { x: 125, y: 100 })!, 0.5);
        // Turned a quarter, the long side runs down the screen.
        expect(zoneVolume2d(rect, { ...flat, rotation: Math.PI / 2 }, { x: 100, y: 119 })).toBe(1);

        const water = { shape: { kind: 'plane' as const }, fade: 10 };
        expect(zoneVolume2d(water, flat, { x: 0, y: 150 })).toBe(1);
        near(zoneVolume2d(water, flat, { x: 0, y: 95 })!, 0.5);
    });

    it('has no answer for a shape of the other dimension', () => {
        expect(zoneVolume3d({ shape: { kind: 'rect', width: 1, height: 1 }, fade: 1 }, still, { x: 0, y: 0, z: 0 })).toBeNull();
        expect(zoneVolume2d({ shape: { kind: 'box', size: [1, 1, 1] }, fade: 1 }, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, { x: 0, y: 0 })).toBeNull();
    });
});

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createModel } from '../src/gameobjects/model';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas/create_sprite_atlas';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useSkeletalAnimation } from '../src/hooks/animation/use_skeletal_animation';
import { useSpriteAnimation } from '../src/hooks/animation/use_sprite_animation';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf } from './helpers/test_gltf';
import type { TBox } from '../src/box';
import type { TGltfModel } from '../src/loaders';
import type { TSkeletalAnimation } from '../src/hooks';
import type { TSpriteAnimation, TSpriteAnimationOptions } from '../src/hooks/animation/types/t_sprite_animation';
import type { TTestModel } from './helpers/test_gltf';
import type { TTexture } from '../src/loaders';

/**
 * Moments marked inside a movement, and the end of one.
 *
 * The rule both halves of the engine keep: a moment is passed **once per time through**, however
 * the frames happen to fall on it. A frame long enough to step clean over a mark still counts it,
 * because a blow that stops landing when the machine stutters is worse than one that lands late.
 */

const sheet = {
    key: 'walk', src: '/walk.png', status: 'ready', width: 288, height: 48,
    gpu: { resourceType: 'texture' },
} as unknown as TTexture;

/**
 * A scene with one animated sprite, plus the handle and a way to run frames through it.
 */
const animated = (options: TSpriteAnimationOptions) => {
    const { store } = createTestGame();
    const atlas = createSpriteAtlas({ texture: sheet, columns: 6 });
    let anim!: TSpriteAnimation;

    const root: TBox = startTestScene(store, 'Level', () => {
        const sprite = createSprite({ atlas, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        anim = useSpriteAnimation(sprite, options);
        return createScene();
    });

    return { anim, tick: (seconds: number) => runHookUpdates(root, seconds) };
};

describe('a sprite run that reaches its end', () => {
    const DIE = { frames: [0, 1, 2], fps: 10, loop: false };

    it('tells whoever is listening, once, and says which run it was', () => {
        const { anim, tick } = animated({ clips: { die: DIE }, play: 'die' });
        const ended: string[] = [];
        anim.onEnd((clip) => ended.push(clip));

        tick(0.25);
        expect(ended).toEqual([]);
        // Three pictures at ten a second: the third is reached at 0.2 and the run ends at 0.3.
        tick(0.1);
        expect(ended).toEqual(['die']);

        tick(1);
        expect(ended).toEqual(['die']);
    });

    it('says nothing for a run that goes round for ever', () => {
        const { anim, tick } = animated({ clips: { walk: { frames: [0, 1, 2], fps: 10 } }, play: 'walk' });
        const ended: string[] = [];
        anim.onEnd((clip) => ended.push(clip));

        tick(2);
        expect(ended).toEqual([]);
    });

    it('says nothing when it was stopped, because being stopped is not reaching the end', () => {
        const { anim, tick } = animated({ clips: { die: DIE }, play: 'die' });
        const ended: string[] = [];
        anim.onEnd((clip) => ended.push(clip));

        tick(0.15);
        anim.stop();
        tick(1);
        expect(ended).toEqual([]);
    });

    it('lets the listener start the next run from inside it', () => {
        const { anim, tick } = animated({
            clips: { die: DIE, idle: { frames: [4, 5], fps: 10 } },
            play: 'die',
        });
        anim.onEnd(() => anim.play('idle'));

        tick(0.35);
        expect(anim.clip).toBe('idle');
        expect(anim.playing).toBe(true);
    });

    it('stops telling the one that asked to be let go', () => {
        const { anim, tick } = animated({ clips: { die: DIE }, play: 'die' });
        const ended: string[] = [];
        const stop = anim.onEnd((clip) => ended.push(clip));

        stop();
        tick(0.35);
        expect(ended).toEqual([]);
    });
});

describe('moments marked on a sprite run', () => {
    // The picture 4 is shown twice, going out and coming back, and only one of them is the blow.
    const SWING = {
        frames: [3, 4, 5, 4, 3],
        fps: 10,
        loop: false,
        events: [{ at: 2, name: 'hit' }],
    };

    it('passes the mark when the run reaches that place', () => {
        const { anim, tick } = animated({ clips: { swing: SWING }, play: 'swing' });
        const heard: Array<[string, string]> = [];
        anim.onEvent((event, clip) => heard.push([event, clip]));

        tick(0.15);
        expect(heard).toEqual([]);
        tick(0.1);
        expect(heard).toEqual([['hit', 'swing']]);
    });

    it('counts the place in the run, not the picture on the sheet', () => {
        // Picture 4 sits at places 1 and 3. Marking place 2 means the blow lands once, at the top
        // of the swing, and neither of the two showings of picture 4 sets it off.
        const { anim, tick } = animated({ clips: { swing: SWING }, play: 'swing' });
        const heard: string[] = [];
        anim.onEvent((event) => heard.push(event));

        tick(1);
        expect(heard).toEqual(['hit']);
    });

    it('counts a mark on the first picture, and counts it inside the frame loop', () => {
        // Taken on after the hook returned, which is the ordinary way round: a mark at 0 counted
        // while the scene was still being built would be told to nobody.
        const { anim, tick } = animated({
            clips: { cast: { frames: [0, 1], fps: 10, loop: false, events: [{ at: 0, name: 'spark' }] } },
            play: 'cast',
        });
        const heard: string[] = [];
        anim.onEvent((event) => heard.push(event));

        tick(0.01);
        expect(heard).toEqual(['spark']);
    });

    it('counts every place a long frame stepped over', () => {
        const { anim, tick } = animated({
            clips: {
                run: { frames: [0, 1, 2, 3], fps: 10, events: [{ at: 1, name: 'left' }, { at: 3, name: 'right' }] },
            },
            play: 'run',
        });
        const heard: string[] = [];
        anim.onEvent((event) => heard.push(event));

        // One frame covering the whole run: both footsteps still happened.
        tick(0.35);
        expect(heard).toEqual(['left', 'right']);
    });

    it('counts it once a lap on a run that goes round', () => {
        const { anim, tick } = animated({
            clips: { walk: { frames: [0, 1], fps: 10, events: [{ at: 0, name: 'step' }] } },
            play: 'walk',
        });
        const heard: string[] = [];
        anim.onEvent((event) => heard.push(event));

        tick(0.05);
        expect(heard).toEqual(['step']);
        // Two more pictures is one more lap.
        tick(0.2);
        expect(heard).toEqual(['step', 'step']);
    });

    it('stops telling the one that asked to be let go', () => {
        const { anim, tick } = animated({ clips: { swing: SWING }, play: 'swing' });
        const heard: string[] = [];
        const stop = anim.onEvent((event) => heard.push(event));

        stop();
        tick(1);
        expect(heard).toEqual([]);
    });
});

/**
 * A triangle on one bone, with two one-second movements.
 */
const RIGGED: TTestModel = {
    nodes: [
        { name: 'Mesh', skin: 0, primitives: [{
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 2],
            joints: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        }] },
        { name: 'Bone' },
    ],
    skins: [{ joints: [1] }],
    animations: [
        { name: 'Attack', channels: [{ node: 1, path: 'translation', times: [0, 1], values: [0, 0, 0, 10, 0, 0] }] },
        { name: 'Idle', channels: [{ node: 1, path: 'translation', times: [0, 1], values: [0, 0, 0, 0, 20, 0] }] },
    ],
};

const withRig = async (options: Record<string, unknown> = {}) => {
    const { json, bin } = asGltf(RIGGED);
    const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
    const { store } = createTestGame();
    let model!: TGltfModel;
    let moves!: TSkeletalAnimation;
    const scene: TBox = startTestScene(store, 'Level', () => {
        model = useLoadGltf({ src: 'model.gltf' });
        createModel({ model });
        moves = useSkeletalAnimation(model, options as never);
        return createScene();
    });
    await whenLoaded(model);
    // The first frame is the one that honours the movement asked for before the file arrived, and
    // nothing else happens in it. Settled here, of no length, so each test below reads as its own
    // timing rather than as that timing plus one dead frame.
    runHookUpdates(scene, 0);
    return { scene, moves, restore: fake.restore };
};

const step = (scene: TBox, seconds: number): void => { runHookUpdates(scene, seconds); };

afterEach(() => { mock.restore(); });

describe('moments marked on a model movement', () => {
    const HIT = { Attack: [{ at: 0.4, name: 'hit' }] };

    it('passes the mark when the movement reaches that second', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Attack', loop: false, events: HIT });
        const heard: Array<[string, string]> = [];
        moves.onEvent((event, clip) => heard.push([event, clip]));

        step(scene, 0.3);
        expect(heard).toEqual([]);
        step(scene, 0.2);
        expect(heard).toEqual([['hit', 'Attack']]);
        restore();
    });

    it('passes it once, not on every frame after it', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Attack', loop: false, events: HIT });
        const heard: string[] = [];
        moves.onEvent((event) => heard.push(event));

        for (let i = 0; i < 10; i++) {
            step(scene, 0.1);
        }
        expect(heard).toEqual(['hit']);
        restore();
    });

    it('counts a mark a long frame stepped clean over', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Attack', loop: false, events: HIT });
        const heard: string[] = [];
        moves.onEvent((event) => heard.push(event));

        // One frame covering the whole movement: the blow still landed.
        step(scene, 1);
        expect(heard).toEqual(['hit']);
        restore();
    });

    it('counts a mark on the very first instant', async () => {
        const { scene, moves, restore } = await withRig({
            play: 'Attack', loop: false, events: { Attack: [{ at: 0, name: 'start' }] },
        });
        const heard: string[] = [];
        moves.onEvent((event) => heard.push(event));

        step(scene, 0.01);
        expect(heard).toEqual(['start']);
        restore();
    });

    it('counts it once a time through when the movement goes round', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Attack', loop: true, events: HIT });
        const heard: string[] = [];
        moves.onEvent((event) => heard.push(event));

        step(scene, 0.5);
        expect(heard).toEqual(['hit']);
        // Round once more: past the end of the lap and over the mark again.
        step(scene, 0.6);
        step(scene, 0.4);
        expect(heard).toEqual(['hit', 'hit']);
        restore();
    });

    it('counts a mark on the last instant, and counts it before saying the movement ended', async () => {
        const { scene, moves, restore } = await withRig({
            play: 'Attack', loop: false, events: { Attack: [{ at: 1, name: 'land' }] },
        });
        const order: string[] = [];
        moves.onEvent((event) => order.push(event));
        moves.onEnd(() => order.push('ended'));

        step(scene, 1.5);
        expect(order).toEqual(['land', 'ended']);
        restore();
    });

    it('passes nothing while the movement runs backwards', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Attack', loop: true, events: HIT });
        const heard: string[] = [];
        moves.onEvent((event) => heard.push(event));

        moves.setSpeed(-1);
        step(scene, 0.5);
        step(scene, 0.5);
        expect(heard).toEqual([]);
        restore();
    });

    it('passes only the marks of the movement coming in while two are being eased between', async () => {
        const { scene, moves, restore } = await withRig({
            play: 'Attack',
            loop: true,
            fade: 0.5,
            events: { Attack: [{ at: 0.4, name: 'hit' }], Idle: [{ at: 0.4, name: 'breathe' }] },
        });
        const heard: string[] = [];
        moves.onEvent((event) => heard.push(event));

        step(scene, 0.1);
        moves.play('Idle');
        // Half a second of easing, during which both movements are sampled but only one is playing.
        step(scene, 0.5);
        expect(heard).toEqual(['breathe']);
        restore();
    });

    it('stops telling the one that asked to be let go', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Attack', loop: false, events: HIT });
        const heard: string[] = [];
        const stop = moves.onEvent((event) => heard.push(event));

        stop();
        step(scene, 1);
        expect(heard).toEqual([]);
        restore();
    });
});

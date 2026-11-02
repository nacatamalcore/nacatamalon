import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createModel } from '../src/gameobjects/model';
import { createScene } from '../src/scene/create_scene';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useSkeletalAnimation } from '../src/hooks/animation/use_skeletal_animation';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { destroy, flushDestroyed } from '../src/destroy';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf } from './helpers/test_gltf';
import type { TBox } from '../src/box';
import type { TGltfModel } from '../src/loaders';
import type { TModel } from '../src/gameobjects/model';
import type { TSkeletalAnimation, TSkeletalAnimationOptions } from '../src/hooks';
import type { TTestModel } from './helpers/test_gltf';

/**
 * A movement on part of the body, on top of another animator of the same model.
 */

const ONE_TRIANGLE = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    joints: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};

/**
 * Legs and a spine that hang from the hips, and an arm from the spine. A tail stands on its own, at
 * five, and only `Wag` moves it.
 */
const BODY: TTestModel = {
    nodes: [
        { name: 'Mesh', skin: 0, primitives: [ONE_TRIANGLE] },
        { name: 'Hips', children: [2, 3, 5] },
        { name: 'Legs' },
        { name: 'Spine', children: [4] },
        { name: 'Arm' },
        { name: 'Tail', translation: [5, 0, 0] },
    ],
    skins: [{ joints: [1, 2, 3, 4, 5] }],
    animations: [
        { name: 'Run', channels: [1, 2, 3, 4].map((node) => ({ node, path: 'translation' as const, times: [0, 1], values: [0, 0, 0, 10, 0, 0] })) },
        { name: 'Wave', channels: [2, 3, 4].map((node) => ({ node, path: 'translation' as const, times: [0, 1], values: [0, 100, 0, 0, 100, 0] })) },
        { name: 'Bow', channels: [{ node: 3, path: 'translation' as const, times: [0, 1], values: [0, 0, 7, 0, 0, 7] }] },
        { name: 'Wag', channels: [{ node: 5, path: 'translation' as const, times: [0, 1], values: [0, 50, 0, 0, 50, 0] }] },
    ],
};

const withBody = async (top: TSkeletalAnimationOptions, body: TSkeletalAnimationOptions = { play: 'Run' }) => {
    const { json, bin } = asGltf(BODY);
    const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
    const { store } = createTestGame();
    let file!: TGltfModel;
    let model!: TModel;
    let below!: TSkeletalAnimation;
    let above!: TSkeletalAnimation;
    const scene: TBox = startTestScene(store, 'Level', () => {
        file = useLoadGltf({ src: 'model.gltf' });
        model = createModel({ model: file });
        below = useSkeletalAnimation(model, body);
        above = useSkeletalAnimation(model, top);
        return createScene();
    });
    await whenLoaded(file);
    const step = (seconds: number): void => { runHookUpdates(scene, seconds); };
    const bone = (name: string) => {
        const skeleton = model.skeletons[0];
        const pose = skeleton.laid === null ? skeleton.pose : skeleton.laid();
        return [...pose[skeleton.jointNames.indexOf(name)].t];
    };
    step(0);
    return { below, above, step, bone, restore: fake.restore };
};

afterEach(() => { mock.restore(); });

describe('only', () => {
    it('moves the bones named and what hangs from them, and leaves the rest to the one below', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'] });
        above.play('Wave');
        step(0.5);

        expect(bone('Spine')[1]).toBe(100);
        expect(bone('Arm')[1]).toBe(100);
        expect(bone('Legs')).toEqual([5, 0, 0]);
        expect(bone('Hips')).toEqual([5, 0, 0]);
        restore();
    });

    it('leaves the bones alone with nothing playing, rather than taking the first movement', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'] });
        step(0.5);

        expect(above.clip).toBeNull();
        expect(bone('Spine')).toEqual([5, 0, 0]);
        restore();
    });

    it('takes several bones that do not hang from one another', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Legs', 'Arm'] });
        above.play('Wave');
        step(0.5);

        expect(bone('Legs')[1]).toBe(100);
        expect(bone('Arm')[1]).toBe(100);
        expect(bone('Spine')).toEqual([5, 0, 0]);
        restore();
    });

    it('lets a bone its movement does not turn keep showing the one below', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'] });
        above.play('Bow');
        step(0.5);

        expect(bone('Spine')[2]).toBe(7);
        expect(bone('Arm')).toEqual([5, 0, 0]);
        restore();
    });

    it('eases in over the movement below as it goes on', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'], fade: 1 });
        above.play('Wave');
        step(0.5);

        expect(bone('Spine')[1]).toBeCloseTo(50, 3);
        expect(bone('Spine')[0]).toBeCloseTo(2.5, 3);
        step(0.5);
        expect(bone('Spine')[1]).toBeCloseTo(100, 3);
        restore();
    });

    it('hands the bones back when a movement ends, saying so once', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'], fade: 1, clips: { Wave: { loop: false } } });
        const ended = mock();
        above.onEnd(ended);
        above.play('Wave');
        step(1);
        step(0.1);
        expect(ended).toHaveBeenCalledTimes(1);
        expect(above.playing).toBe(false);

        step(0.5);
        const halfWay = bone('Spine')[1];
        expect(halfWay).toBeGreaterThan(0);
        expect(halfWay).toBeLessThan(100);

        step(0.5);
        expect(bone('Spine')[1]).toBe(0);
        expect(bone('Spine')).toEqual(bone('Legs'));
        expect(ended).toHaveBeenCalledTimes(1);
        restore();
    });

    it('keeps them when the movement says what comes next, or a listener starts another', async () => {
        const next = await withBody({ only: ['Spine'], clips: { Bow: { loop: false, next: 'Wave' } } });
        next.above.play('Bow');
        next.step(1);
        next.step(0.1);
        expect(next.above.clip).toBe('Wave');
        expect(next.bone('Spine')[1]).toBe(100);
        next.restore();

        const told = await withBody({ only: ['Spine'], clips: { Bow: { loop: false } } });
        told.above.onEnd(() => { told.above.play('Wave'); });
        told.above.play('Bow');
        told.step(1);
        told.step(0.1);
        expect(told.bone('Spine')[1]).toBe(100);
        told.restore();
    });

    it('holds the pose over a body that goes on when paused', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'] });
        above.play('Bow');
        step(0.25);
        above.pause();
        step(0.25);

        expect(bone('Spine')[2]).toBe(7);
        expect(bone('Legs')[0]).toBe(5);
        restore();
    });

    it('hands them back when stopped, and the body keeps its movement', async () => {
        const { above, below, step, bone, restore } = await withBody({ only: ['Spine'] });
        above.play('Wave');
        step(0.25);
        above.stop();
        step(0.25);

        expect(bone('Spine')).toEqual([5, 0, 0]);
        expect(below.playing).toBe(true);
        expect(below.clip).toBe('Run');
        restore();
    });

    it('does not leave behind a bone the body never writes', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Tail'], fade: 1, clips: { Wag: { loop: false } } });
        above.play('Wag');
        step(0.5);
        expect(bone('Tail')[1]).toBeCloseTo(25, 3);
        // Read as new, what it left there would be eased towards itself rather than from the rest.
        step(0.25);
        expect(bone('Tail')[1]).toBeCloseTo(37.5, 3);

        step(0.25);
        step(0.1);
        step(1);
        expect(bone('Tail')).toEqual([5, 0, 0]);
        restore();
    });

    it('eases between two of its own movements, going back to the body on bones only one turns', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'] });
        above.play('Wave');
        step(0.25);
        above.play('Bow', { fade: 1 });
        step(0.5);

        expect(bone('Spine')[1]).toBeCloseTo(50, 3);
        expect(bone('Spine')[2]).toBeCloseTo(3.5, 3);
        step(0.5);
        expect(bone('Spine')[1]).toBeCloseTo(0, 3);
        expect(bone('Spine')[2]).toBe(7);
        restore();
    });

    it('says when a bone is not there and which ones are', async () => {
        const warn = mock();
        const original = console.warn;
        console.warn = warn;
        const { above, step, bone, restore } = await withBody({ only: ['Torso'] });
        above.play('Wave');
        step(0.25);

        expect(warn.mock.calls[0]?.[0]).toContain("no bone called 'Torso'");
        expect(warn.mock.calls[0]?.[0]).toContain('Spine');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(bone('Spine')[1]).toBe(0);
        console.warn = original;
        restore();
    });

    it('says when a movement it was told to play from the start is not in the file, and stays out of the way', async () => {
        const warn = mock();
        const original = console.warn;
        console.warn = warn;
        const { above, step, bone, restore } = await withBody({ only: ['Spine'], play: 'Dance' });
        step(0.25);
        console.warn = original;

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain("no movement called 'Dance'");
        expect(above.clip).toBeNull();
        expect(bone('Spine')).toEqual([2.5, 0, 0]);
        restore();
    });

    it('waits for the file like any other, when told what to play from the start', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'], play: 'Wave' });
        step(0.25);

        expect(above.clip).toBe('Wave');
        expect(bone('Spine')[1]).toBe(100);
        restore();
    });
});

describe('what the body and the layers do to each other', () => {
    it('a layer does not stay behind in a bone the body eased over while it showed', async () => {
        const { below, above, step, bone, restore } = await withBody({ only: ['Tail'] });
        above.play('Wag');
        step(0.5);
        below.play('Wave', { fade: 0.25 });
        step(0.5);
        above.stop();
        step(0.1);

        expect(bone('Tail')).toEqual([5, 0, 0]);
        restore();
    });

    it('two layers on one bone do not leave each other behind', async () => {
        const { json, bin } = asGltf(BODY);
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let file!: TGltfModel;
        let model!: TModel;
        let first!: TSkeletalAnimation;
        let second!: TSkeletalAnimation;
        const scene: TBox = startTestScene(store, 'Level', () => {
            file = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: file });
            useSkeletalAnimation(model, { play: 'Run' });
            first = useSkeletalAnimation(model, { only: ['Tail'] });
            second = useSkeletalAnimation(model, { only: ['Tail'] });
            return createScene();
        });
        await whenLoaded(file);
        const tail = () => {
            const skeleton = model.skeletons[0];
            return [...skeleton.laid!()[skeleton.jointNames.indexOf('Tail')].t];
        };
        runHookUpdates(scene, 0);
        first.play('Wag');
        second.play('Wag');
        runHookUpdates(scene, 0.5);
        expect(tail()[1]).toBe(50);

        second.stop();
        runHookUpdates(scene, 0.1);
        expect(tail()[1]).toBe(50);
        first.stop();
        runHookUpdates(scene, 0.1);
        expect(tail()).toEqual([5, 0, 0]);
        fake.restore();
    });

    it('a layer shows over a body that was stopped, and hands back the rest position', async () => {
        const { below, above, step, bone, restore } = await withBody({ only: ['Tail'] });
        above.play('Wag');
        step(0.5);
        below.stop();
        step(0.1);
        above.stop();
        step(0.1);

        expect(bone('Tail')).toEqual([5, 0, 0]);
        restore();
    });

    it('goes on top of a body made after it in a box inside', async () => {
        const { json, bin } = asGltf(BODY);
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let file!: TGltfModel;
        let model!: TModel;
        const scene: TBox = startTestScene(store, 'Level', () => {
            file = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: file });
            const Body = () => { useSkeletalAnimation(model, { play: 'Run' }); };
            useSpawn(Body)();
            useSkeletalAnimation(model, { only: ['Spine'], play: 'Wave' });
            return createScene();
        });
        await whenLoaded(file);
        runHookUpdates(scene, 0);
        runHookUpdates(scene, 0.5);
        runHookUpdates(scene, 0);

        const skeleton = model.skeletons[0];
        expect(skeleton.laid!()[skeleton.jointNames.indexOf('Spine')].t[1]).toBe(100);
        fake.restore();
    });

    it('is taken off when the box that made it goes', async () => {
        const { json, bin } = asGltf(BODY);
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let file!: TGltfModel;
        let model!: TModel;
        let gone!: () => void;
        const scene: TBox = startTestScene(store, 'Level', () => {
            file = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: file });
            useSkeletalAnimation(model, { play: 'Run' });
            const Waving = () => { useSkeletalAnimation(model, { only: ['Spine'], play: 'Wave' }); };
            const waving = useSpawn(Waving)();
            gone = () => { destroy(waving); };
            return createScene();
        });
        await whenLoaded(file);
        runHookUpdates(scene, 0);
        runHookUpdates(scene, 0.5);
        const skeleton = model.skeletons[0];
        expect(skeleton.laid!()[skeleton.jointNames.indexOf('Spine')].t[1]).toBe(100);

        gone();
        flushDestroyed(store);
        runHookUpdates(scene, 0.25);
        expect(skeleton.laid!()[skeleton.jointNames.indexOf('Spine')].t[1]).toBe(0);
        fake.restore();
    });
});

describe('asking again', () => {
    it('eases in by its fade when it was told what to play before the file arrived', async () => {
        const { step, bone, restore } = await withBody({ only: ['Spine'], fade: 1, play: 'Wave' });
        step(0);
        step(0.5);
        expect(bone('Spine')[1]).toBeCloseTo(50, 3);
        restore();
    });

    it('does not jump when asked for the same movement while on its way out', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Tail'], fade: 1 });
        above.play('Wag');
        step(1);
        above.stop();
        step(0.25);
        const was = bone('Tail')[1];
        above.play('Wag', { fade: 1 });
        step(0.05);

        expect(Math.abs(bone('Tail')[1] - was)).toBeLessThan(5);
        restore();
    });

    it('goes again from the start when played with no name, after it was stopped or ended', async () => {
        const { above, step, bone, restore } = await withBody({ only: ['Spine'], fade: 0.5, clips: { Bow: { loop: false } } });
        above.play('Bow');
        step(0.75);
        above.stop();
        step(0.1);

        above.play();
        expect(above.playing).toBe(true);
        expect(above.time).toBe(0);
        step(1.1);
        const ended = mock();
        above.onEnd(ended);
        step(0.1);
        expect(above.playing).toBe(false);

        above.play();
        expect(above.playing).toBe(true);
        expect(above.time).toBe(0);
        expect(ended).not.toHaveBeenCalled();
        expect(bone('Spine')[2]).toBeGreaterThan(0);
        restore();
    });
});

describe('from where it is told a movement ended', () => {
    it('a play with no name goes again from the start, rather than ending every frame', async () => {
        const { above, step, restore } = await withBody({ only: ['Spine'], clips: { Bow: { loop: false } } });
        const ended = mock();
        let again = true;
        above.onEnd(() => {
            ended();
            if (again) above.play();
            again = false;
        });
        above.play('Bow');
        step(1);
        expect(ended).toHaveBeenCalledTimes(1);
        expect(above.playing).toBe(true);
        expect(above.time).toBe(0);

        step(0.5);
        expect(above.time).toBe(0.5);
        expect(ended).toHaveBeenCalledTimes(1);
        restore();
    });
});

describe('stopping', () => {
    it('before the file arrives, plays nothing when it lands', async () => {
        const { json, bin } = asGltf(BODY);
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let file!: TGltfModel;
        let model!: TModel;
        const scene: TBox = startTestScene(store, 'Level', () => {
            file = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: file });
            useSkeletalAnimation(model, { play: 'Run' }).stop();
            return createScene();
        });
        await whenLoaded(file);
        runHookUpdates(scene, 0);
        runHookUpdates(scene, 0.5);

        expect(model.skeletons[0].pose[0].t).toEqual([0, 0, 0]);
        fake.restore();
    });

    it('before the file arrives, plays what it was waiting for when played with no name', async () => {
        const { json, bin } = asGltf(BODY);
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let file!: TGltfModel;
        let model!: TModel;
        let moves!: TSkeletalAnimation;
        const scene: TBox = startTestScene(store, 'Level', () => {
            file = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: file });
            moves = useSkeletalAnimation(model, { play: 'Wave' });
            moves.stop();
            moves.stop();
            moves.play();
            return createScene();
        });
        await whenLoaded(file);
        runHookUpdates(scene, 0);
        runHookUpdates(scene, 0.25);

        expect(moves.clip).toBe('Wave');
        expect(moves.playing).toBe(true);
        expect(model.skeletons[0].pose[1].t[1]).toBe(100);
        fake.restore();
    });

    it('from a mark, says no more marks that frame', async () => {
        const { above, step, restore } = await withBody({
            only: ['Spine'],
            clips: { Bow: { events: [{ at: 0.1, name: 'a' }, { at: 0.2, name: 'b' }] } },
        });
        const told: string[] = [];
        above.onEvent((name) => { told.push(name); above.stop(); });
        above.play('Bow');
        step(0.5);

        expect(told).toEqual(['a']);
        restore();
    });

    it('from a mark, lets everyone listening hear that mark', async () => {
        const { above, step, restore } = await withBody({
            only: ['Spine'],
            clips: { Bow: { events: [{ at: 0.1, name: 'a' }] } },
        });
        const told: string[] = [];
        above.onEvent(() => { told.push('first'); above.stop(); });
        above.onEvent(() => { told.push('second'); });
        above.play('Bow');
        step(0.5);

        expect(told).toEqual(['first', 'second']);
        restore();
    });

    it('then asked by name before the file arrives, keeps that name', async () => {
        const { json, bin } = asGltf(BODY);
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let file!: TGltfModel;
        let model!: TModel;
        let moves!: TSkeletalAnimation;
        const scene: TBox = startTestScene(store, 'Level', () => {
            file = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: file });
            moves = useSkeletalAnimation(model, { play: 'Wave' });
            moves.stop();
            moves.play('Bow');
            moves.play();
            return createScene();
        });
        await whenLoaded(file);
        runHookUpdates(scene, 0);

        expect(moves.clip).toBe('Bow');
        fake.restore();
    });

    it('from where it is told a movement ended, what comes after it does not start', async () => {
        const { above, step, restore } = await withBody({ only: ['Spine'], clips: { Bow: { loop: false, next: 'Wave' } } });
        above.onEnd(() => { above.stop(); });
        above.play('Bow');
        step(1);
        step(0.1);

        expect(above.clip).toBe('Bow');
        expect(above.playing).toBe(false);
        restore();
    });
});

describe('two animators on one model', () => {
    it('stopping the one below keeps the one above showing', async () => {
        const { below, above, step, bone, restore } = await withBody({ only: ['Spine'] });
        above.play('Wave');
        step(0.25);
        below.stop();
        step(0.25);

        expect(bone('Legs')).toEqual([0, 0, 0]);
        expect(bone('Spine')[1]).toBe(100);
        restore();
    });

    it('a stop on one does not leave the other writing to bones nobody reads', async () => {
        const { below, above, step, bone, restore } = await withBody({}, { only: ['Legs'], play: 'Run' });
        step(0.25);
        below.stop();
        step(0.25);
        const was = bone('Hips')[0];
        step(0.25);
        expect(above.clip).toBe('Run');
        expect(bone('Hips')[0]).toBeGreaterThan(was);
        restore();
    });
});

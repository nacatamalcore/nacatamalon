import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createModel } from '../src/gameobjects/model';
import { createScene } from '../src/scene/create_scene';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useSkeletalAnimation } from '../src/hooks/animation/use_skeletal_animation';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf } from './helpers/test_gltf';
import type { TBox } from '../src/box';
import type { TGltfModel } from '../src/loaders';
import type { TSkeletalAnimation } from '../src/hooks';
import type { TTestModel } from './helpers/test_gltf';

/**
 * Playing a model's movements.
 *
 * The timing is what is worth testing: the model comes back still loading, so everything asked for
 * in the scene body is asked for before there is anything to ask.
 */

/**
 * A triangle hanging off one bone.
 */
const ON_ONE_BONE = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    joints: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};

/**
 * That bone slides ten along x over a second in one movement, and twenty up in the other.
 */
const RIGGED: TTestModel = {
    nodes: [
        { name: 'Mesh', skin: 0, primitives: [ON_ONE_BONE] },
        { name: 'Bone' },
    ],
    skins: [{ joints: [1] }],
    animations: [
        { name: 'Walk', channels: [{ node: 1, path: 'translation', times: [0, 1], values: [0, 0, 0, 10, 0, 0] }] },
        { name: 'Jump', channels: [{ node: 1, path: 'translation', times: [0, 1], values: [0, 0, 0, 0, 20, 0] }] },
    ],
};

const rigged = () => {
    const { json, bin } = asGltf(RIGGED);
    return serveGltf({ 'model.gltf': json, 'model.bin': bin });
};

/**
 * Builds a scene with a rigged model in it and hands back everything needed to drive it.
 */
const withRig = async (options: Record<string, unknown> = {}) => {
    const fake = rigged();
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
    return { store, scene, model, moves, restore: fake.restore };
};

/**
 * Where the one bone is, which is what the movement writes.
 */
const bone = (model: TGltfModel): number => model.skeletons[0].pose[0].t[0];
const step = (scene: TBox, seconds: number): void => { runHookUpdates(scene, seconds); };

afterEach(() => { mock.restore(); });

describe('playing a movement', () => {
    it('honours a movement asked for before the file had arrived', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });

        // Asked for in the scene body, when the table of movements was still empty.
        expect(moves.clip).toBeNull();
        step(scene, 0);
        expect(moves.clip).toBe('Walk');
        expect(moves.playing).toBe(true);
        restore();
    });

    it('moves the bones as time passes', async () => {
        const { scene, model, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        expect(bone(model)).toBeCloseTo(0);

        step(scene, 0.5);
        expect(bone(model)).toBeCloseTo(5);
        restore();
    });

    it('takes the first movement the file has when none was named', async () => {
        const { scene, moves, restore } = await withRig();
        step(scene, 0);

        expect(moves.clip).toBe('Walk');
        restore();
    });

    it('goes round for ever by default', async () => {
        const { scene, model, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 1.25);

        // A quarter past the end is a quarter in.
        expect(bone(model)).toBeCloseTo(2.5);
        restore();
    });

    it('runs at the speed it is told', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        moves.setSpeed(2);
        step(scene, 0.25);

        expect(bone(model)).toBeCloseTo(5);
        restore();
    });
});

describe('stopping and holding', () => {
    it('holds the pose it was in when paused', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 0.5);
        moves.pause();
        step(scene, 0.5);

        expect(moves.playing).toBe(false);
        expect(bone(model)).toBeCloseTo(5);
        restore();
    });

    it('puts the bones back the way the model was made when stopped', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 0.5);
        moves.stop();

        expect(bone(model)).toBeCloseTo(0);
        expect(moves.playing).toBe(false);
        restore();
    });

    it('carries on from where it was when played again with no name', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 0.5);
        moves.pause();
        moves.play();
        step(scene, 0.25);

        expect(bone(model)).toBeCloseTo(7.5);
        restore();
    });
});

describe('a movement that does not go round', () => {
    it('settles on its last moment and says it is over, once', async () => {
        const { scene, moves, model, restore } = await withRig({ play: 'Walk', loop: false });
        step(scene, 0);

        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));

        step(scene, 0.9);
        expect(ended).toEqual([]);
        step(scene, 0.5);
        expect(ended).toEqual(['Walk']);
        expect(bone(model)).toBeCloseTo(10);

        step(scene, 1);
        expect(ended).toEqual(['Walk']);
        restore();
    });

    it('never says it is over while it goes round', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));

        for (let i = 0; i < 20; i++) {
            step(scene, 0.2);
        }
        expect(ended).toEqual([]);
        restore();
    });

    it('can be told to stop going round while it is playing', async () => {
        const { scene, moves, model, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        moves.setLoop(false);
        step(scene, 2);

        expect(moves.playing).toBe(false);
        expect(bone(model)).toBeCloseTo(10);
        restore();
    });

    it('stops telling whoever asked to stop being told', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Walk', loop: false });
        step(scene, 0);
        const ended: string[] = [];
        const forget = moves.onEnd((clip) => ended.push(clip));
        forget();
        step(scene, 2);

        expect(ended).toEqual([]);
        restore();
    });

    it('lets whoever is told start the next movement', async () => {
        const { scene, moves, restore } = await withRig({ play: 'Walk', loop: false });
        step(scene, 0);
        moves.onEnd(() => moves.play('Jump'));
        step(scene, 2);

        expect(moves.clip).toBe('Jump');
        restore();
    });
});

describe('easing from one movement to another', () => {
    it('passes through neither one nor the other while it eases', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 1);

        moves.play('Jump', { fade: 1 });
        step(scene, 0.5);

        // Halfway between where walking had the bone and where jumping starts it.
        expect(bone(model)).toBeGreaterThan(0);
        expect(bone(model)).toBeLessThan(10);
        expect(model.skeletons[0].pose[0].t[1]).toBeGreaterThan(0);
        restore();
    });

    it('arrives at the new movement and stays there', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        moves.play('Jump', { fade: 0.5 });
        step(scene, 1);
        step(scene, 0.0001);

        expect(moves.clip).toBe('Jump');
        expect(bone(model)).toBeCloseTo(0, 2);
        restore();
    });

    it('cuts straight across when nothing says to ease', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 0.9);
        moves.play('Jump');
        step(scene, 0);

        expect(bone(model)).toBeCloseTo(0);
        restore();
    });

    it('eases a finished one-shot out from its last frame, even when the next one goes round', async () => {
        // Sitting down and then sitting: `onEnd` turns the loop on and plays the next one. The loop
        // is the new movement's, and the one easing out had finished, so it stays where it ended.
        const { scene, model, moves, restore } = await withRig({ play: 'Walk', loop: false });
        step(scene, 0);
        step(scene, 1);
        expect(moves.playing).toBe(false);
        expect(bone(model)).toBeCloseTo(10);

        moves.setLoop(true);
        moves.play('Jump', { fade: 1 });
        step(scene, 0.5);

        // Halfway from the end of walking (10) to the start of jumping (0). Going round again would
        // ease from 5 instead, and give 2.5.
        expect(bone(model)).toBeCloseTo(5);
        restore();
    });

    it('keeps the speed the movement easing out was playing at', async () => {
        const { scene, model, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        step(scene, 0.2);

        moves.play('Jump', { fade: 1 });
        moves.setSpeed(0);
        step(scene, 0.5);

        // Walking went on at its own speed, to 0.7 and a bone at 7, and is halfway eased out.
        expect(bone(model)).toBeCloseTo(3.5);
        restore();
    });
});

describe('when something is asked for that is not there', () => {
    it('says so once the file has arrived and lists what it does know', async () => {
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };

        const { scene, moves, restore } = await withRig({ play: 'Walk' });
        step(scene, 0);
        moves.play('Backflip');

        console.warn = original;
        expect(warnings.join(' ')).toContain('Walk');
        expect(moves.clip).toBe('Walk');
        restore();
    });

    it('does nothing at all for a model that has no bones', async () => {
        const plain = asGltf({ nodes: [{ name: 'Rock', primitives: [{ positions: [0, 0, 0], indices: [0] }] }] });
        const fake = serveGltf({ 'model.gltf': plain.json, 'model.bin': plain.bin });
        const { store } = createTestGame();
        let model!: TGltfModel;
        let moves!: TSkeletalAnimation;
        const scene = startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'model.gltf' });
            moves = useSkeletalAnimation(model);
            return createScene();
        });
        await whenLoaded(model);

        expect(() => step(scene, 0.5)).not.toThrow();
        expect(moves.clip).toBeNull();
        fake.restore();
    });
});

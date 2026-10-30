import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas/create_sprite_atlas';
import { createModel } from '../src/gameobjects/model';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useSpriteAnimation } from '../src/hooks/animation/use_sprite_animation';
import { useSkeletalAnimation } from '../src/hooks/animation/use_skeletal_animation';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useTween } from '../src/hooks/tween/use_tween';
import { whenLoaded } from '../src/loaders';
import { parseAtlasDoc } from '../src/atlas/document/parse_atlas_doc';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf } from './helpers/test_gltf';
import type { TBox } from '../src/box';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TSpriteAnimation, TSpriteAnimationOptions } from '../src/hooks/animation/types/t_sprite_animation';
import type { TSkeletalAnimation, TSkeletalAnimationOptions } from '../src/hooks/animation/types/t_skeletal_animation';
import type { TTweenStarter } from '../src/hooks/tween/types/t_tween';
import type { TGltfModel, TTexture } from '../src/loaders';
import type { TModel } from '../src/gameobjects/model';

/**
 * Going round a number of times, and there and back, in the words a tween already uses: `repeat` is
 * how many extra times (negative for ever), `yoyo` comes back the other way each time, and
 * `onRepeat` says each time it starts again. The same for a tween, a sprite's run and a model's
 * movement.
 */

afterEach(() => { mock.restore(); });

// ---------------------------------------------------------------- a tween

const tweened = () => {
    const { store } = createTestGame();
    let tween!: TTweenStarter;
    const root = startTestScene(store, 'Level', () => {
        tween = useTween();
        return createScene();
    });
    return { tween, tick: (seconds: number) => runHookUpdates(root, seconds) };
};

describe('a tween that repeats', () => {
    it('says each time it starts again, with how many so far, and not when it ends', () => {
        const { tween, tick } = tweened();
        const told: number[] = [];
        let ended = 0;
        const handle = tween({ from: 0, to: 1, duration: 1, repeat: 2, onUpdate: () => {} });
        handle.onRepeat((times) => told.push(times));
        handle.onEnd(() => { ended++; });
        handle.play();
        for (let i = 0; i < 4; i++) tick(1);
        expect(told).toEqual([1, 2]);
        expect(ended).toBe(1);
    });

    it('stops saying it once the listener is handed back, and a group never says it', () => {
        const { tween, tick } = tweened();
        const told: number[] = [];
        const handle = tween({ from: 0, to: 1, duration: 1, repeat: -1, onUpdate: () => {} });
        const stop = handle.onRepeat((times) => told.push(times));
        handle.play();
        tick(1);
        stop();
        tick(1);
        expect(told).toEqual([1]);
        const group = tween.all(tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} }));
        expect(typeof group.onRepeat(() => {})).toBe('function');
    });
});

// ---------------------------------------------------------------- a sprite's run

const sheet = {
    key: 'walk', src: '/walk.png', status: 'ready', width: 288, height: 48,
    gpu: { resourceType: 'texture' },
} as unknown as TTexture;

const animated = (options: TSpriteAnimationOptions) => {
    const { store } = createTestGame();
    const atlas = createSpriteAtlas({ texture: sheet, columns: 6 });
    let sprite!: TSprite;
    let anim!: TSpriteAnimation;
    const root: TBox = startTestScene(store, 'Level', () => {
        sprite = createSprite({ atlas, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        anim = useSpriteAnimation(sprite, options);
        return createScene();
    });
    const shown = () => Math.round((sprite.uvOffset?.x ?? 0) * 6);
    // The pictures it shows, a tenth of a second each at 10 fps, the first one included.
    const run = (pictures: number): number[] => {
        const seen = [shown()];
        for (let i = 1; i < pictures; i++) {
            runHookUpdates(root, 0.1);
            seen.push(shown());
        }
        return seen;
    };
    return { anim, run };
};

describe('a sprite\'s run that repeats', () => {
    it('runs three times with repeat 2, then rests on its last picture and says it ended', () => {
        const { anim, run } = animated({ clips: { hit: { frames: [0, 1, 2], fps: 10, repeat: 2 } }, play: 'hit' });
        const told: number[] = [];
        const ended: string[] = [];
        anim.onRepeat((clip, times) => told.push(times));
        anim.onEnd((clip) => ended.push(clip));
        expect(run(12)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 2, 2, 2]);
        expect(told).toEqual([1, 2]);
        expect(ended).toEqual(['hit']);
        expect(anim.playing).toBe(false);
    });

    it('lets repeat decide over loop, and goes for ever with a negative one', () => {
        const once = animated({ clips: { hit: { frames: [0, 1], fps: 10, loop: true, repeat: 0 } }, play: 'hit' });
        expect(once.run(4)).toEqual([0, 1, 1, 1]);
        const always = animated({ clips: { hit: { frames: [0, 1], fps: 10, loop: false, repeat: -1 } }, play: 'hit' });
        expect(always.run(5)).toEqual([0, 1, 0, 1, 0]);
    });

    it('goes there and back with yoyo, showing each end once', () => {
        const { anim, run } = animated({ clips: { idle: { frames: [0, 1, 2, 3], fps: 10, yoyo: true } }, play: 'idle' });
        const told: number[] = [];
        anim.onRepeat((clip, times) => told.push(times));
        expect(run(11)).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2]);
        // Turned at the far end, at the near one, at the far one again.
        expect(told).toEqual([1, 2, 3]);
    });

    it('ends where the last time through ends: back at the start after there and back once', () => {
        const { anim, run } = animated({ clips: { open: { frames: [0, 1, 2], fps: 10, yoyo: true, repeat: 1 } }, play: 'open' });
        const ended: string[] = [];
        anim.onEnd((clip) => ended.push(clip));
        expect(run(7)).toEqual([0, 1, 2, 1, 0, 0, 0]);
        expect(ended).toEqual(['open']);
    });

    it('passes its marks on the way there and not on the way back', () => {
        const { anim, run } = animated({ clips: { idle: { frames: [0, 1, 2], fps: 10, yoyo: true, events: [{ at: 1, name: 'step' }] } }, play: 'idle' });
        const marks: number[] = [];
        let picture = 0;
        anim.onEvent(() => marks.push(picture));
        // 0 1 2 1 0 1 2: there, back, there.
        for (const seen of run(7)) picture = seen;
        expect(marks.length).toBe(2);
    });

    it('plays the next run after the last time through', () => {
        const { anim, run } = animated({ clips: { hit: { frames: [0, 1], fps: 10, repeat: 1, next: 'stand' }, stand: { frames: [5], fps: 10 } }, play: 'hit' });
        run(5);
        expect(anim.clip).toBe('stand');
    });

    it('does not say the end of a run that onRepeat started, when one frame went round and ended', () => {
        // Ten pictures a frame: round once and over in the same one.
        const { anim, run } = animated({ clips: { hit: { frames: [0], fps: 100, repeat: 1 }, stand: { frames: [1, 2], fps: 10 } }, play: 'hit' });
        const ended: string[] = [];
        anim.onEnd((clip) => ended.push(clip));
        anim.onRepeat(() => anim.play('stand'));
        run(2);
        expect(anim.clip).toBe('stand');
        expect(anim.playing).toBe(true);
        expect(ended).toEqual([]);
    });

    it('tells each mark of a run started from the first picture\'s mark once, its first one first', () => {
        const { anim, run } = animated({
            clips: {
                hit: { frames: [0, 1], fps: 10, events: [{ at: 0, name: 'go' }] },
                stand: { frames: [2, 3], fps: 10, events: [{ at: 0, name: 'still' }, { at: 1, name: 'sway' }] },
            },
            play: 'hit',
        });
        const marks: string[] = [];
        anim.onEvent((event) => {
            marks.push(event);
            if (event === 'go') anim.play('stand');
        });
        run(3);
        expect(marks).toEqual(['go', 'still', 'sway']);
    });

    it('does not end the same run started again from onRepeat', () => {
        const { anim, run } = animated({ clips: { hit: { frames: [0], fps: 100, repeat: 1 } }, play: 'hit' });
        const ended: string[] = [];
        anim.onEnd((clip) => ended.push(clip));
        anim.onRepeat(() => anim.play('hit'));
        run(2);
        expect(anim.playing).toBe(true);
        expect(ended).toEqual([]);
    });
});

describe('a sheet that says how its runs repeat', () => {
    it('reads repeat and yoyo, and refuses a repeat that is not a whole number', () => {
        const grid = { format: 1, kind: 'atlas', texture: 'a.png', grid: { frameWidth: 16, frameHeight: 16 } };
        const doc = parseAtlasDoc({ ...grid, sequences: { idle: { frames: [0, 1], repeat: 2, yoyo: true } } }, 'a.atlas');
        expect(doc.sequences?.idle).toMatchObject({ repeat: 2, yoyo: true });
        expect(() => parseAtlasDoc({ ...grid, sequences: { idle: { frames: [0], repeat: 1.5 } } }, 'a.atlas'))
            .toThrow(/"repeat" that is not a whole number/);
    });
});

// ---------------------------------------------------------------- a model's movement

const ON_ONE_BONE = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    joints: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};

/** A bone that slides ten along x over a second in one movement, and rises twenty in the other. */
const withRig = async (options: TSkeletalAnimationOptions) => {
    const { json, bin } = asGltf({
        nodes: [{ name: 'Mesh', skin: 0, primitives: [ON_ONE_BONE] }, { name: 'Bone' }],
        skins: [{ joints: [1] }],
        animations: [
            { name: 'Slide', channels: [{ node: 1, path: 'translation', times: [0, 1], values: [0, 0, 0, 10, 0, 0] }] },
            { name: 'Rise', channels: [{ node: 1, path: 'translation', times: [0, 1], values: [0, 0, 0, 0, 20, 0] }] },
        ],
    });
    serveGltf({ 'model.gltf': json, 'model.bin': bin });
    const { store } = createTestGame();
    let file!: TGltfModel;
    let model!: TModel;
    let moves!: TSkeletalAnimation;
    const scene = startTestScene(store, 'Level', () => {
        file = useLoadGltf({ src: 'model.gltf' });
        model = createModel({ model: file });
        moves = useSkeletalAnimation(model, options);
        return createScene();
    });
    await whenLoaded(file);
    // The frame the file shows up on starts the movement.
    runHookUpdates(scene, 0);
    const at = (): number => Math.round(model.skeletons[0]!.pose[0]!.t[0]! * 100) / 100;
    const up = (): number => Math.round(model.skeletons[0]!.pose[0]!.t[1]! * 100) / 100;
    return { moves, at, up, step: (seconds: number) => runHookUpdates(scene, seconds) };
};

describe('a model\'s movement that repeats', () => {
    it('goes round three times with repeat 2, says each time, then ends', async () => {
        const { moves, at, step } = await withRig({ repeat: 2 });
        const told: number[] = [];
        const ended: string[] = [];
        moves.onRepeat((clip, times) => told.push(times));
        moves.onEnd((clip) => ended.push(clip));
        step(0.5);
        expect(at()).toBe(5);
        step(1);
        expect(at()).toBe(5);
        step(1.25);
        expect(told).toEqual([1, 2]);
        expect(ended).toEqual([]);
        step(1);
        expect(ended).toEqual(['Slide']);
        expect(at()).toBe(10);
    });

    it('comes back the other way with yoyo, and ends where it set off after there and back', async () => {
        const { moves, at, step } = await withRig({ yoyo: true, repeat: 1 });
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));
        step(0.75);
        expect(at()).toBe(7.5);
        // Past the end by a quarter: a quarter of the way back.
        step(0.5);
        expect(at()).toBe(7.5);
        step(0.5);
        expect(at()).toBe(2.5);
        step(0.5);
        expect(ended).toEqual(['Slide']);
        expect(at()).toBe(0);
    });

    it('passes its marks on the way there, once each time, and not on the way back', async () => {
        const { moves, step } = await withRig({ yoyo: true, clips: { Slide: { events: [{ at: 0.5, name: 'mid' }] } } });
        let marks = 0;
        moves.onEvent(() => { marks++; });
        // There (mark), back (none), there again (mark).
        for (let i = 0; i < 12; i++) step(0.25);
        expect(marks).toBe(2);
    });

    it('takes setLoop on the movement playing now', async () => {
        const { moves, step } = await withRig({});
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));
        step(2.5);
        expect(ended).toEqual([]);
        moves.setLoop(false);
        step(1);
        expect(ended).toEqual(['Slide']);
    });
});

describe('each movement of a model played its own way', () => {
    it('goes round or plays once by what its own clip says, with no setLoop between', async () => {
        const { moves, step } = await withRig({ play: 'Slide', clips: { Rise: { loop: false } } });
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));
        // Slide says nothing of its own: it goes round, as the animator does.
        step(2.5);
        expect(ended).toEqual([]);
        moves.play('Rise');
        step(1.5);
        expect(ended).toEqual(['Rise']);
    });

    it('takes its own repeat and yoyo over the animator\'s', async () => {
        const { moves, at, step } = await withRig({ play: 'Slide', repeat: -1, clips: { Slide: { repeat: 0, yoyo: true } } });
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));
        step(1.25);
        // Once, so no way back: it ended at the end.
        expect(ended).toEqual(['Slide']);
        expect(at()).toBe(10);
    });

    it('plays what comes after it, and says once when there is no such movement', async () => {
        const warn = mock(() => {});
        const was = console.warn;
        console.warn = warn;
        try {
            const { moves, up, step } = await withRig({ play: 'Slide', clips: { Slide: { loop: false, next: 'Rise' }, Rise: { loop: false, next: 'Fly' } } });
            step(1.25);
            expect(moves.clip).toBe('Rise');
            step(0.5);
            expect(up()).toBe(10);
            step(1);
            step(1);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0])).toContain("no movement called 'Fly' to play after 'Rise'");
        } finally {
            console.warn = was;
        }
    });

    it('lets a listener of onEnd choose what comes next over what the clip says', async () => {
        const { moves, step } = await withRig({ play: 'Slide', clips: { Slide: { loop: false, next: 'Rise' } } });
        moves.onEnd(() => { moves.play('Slide'); });
        step(1.25);
        expect(moves.clip).toBe('Slide');
    });

    it('does not end a movement that onRepeat started, when one frame went round and ended', async () => {
        // A hundred times as fast: round once and over inside a frame.
        const { moves, step } = await withRig({ play: 'Slide', repeat: 1, speed: 100 });
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));
        moves.onRepeat(() => moves.play('Rise'));
        step(0.021);
        expect(moves.clip).toBe('Rise');
        expect(moves.playing).toBe(true);
        expect(ended).toEqual([]);
    });

    it('does not end the same movement started again from onRepeat', async () => {
        const { moves, step } = await withRig({ play: 'Slide', repeat: 1, speed: 100 });
        const ended: string[] = [];
        moves.onEnd((clip) => ended.push(clip));
        moves.onRepeat(() => moves.play('Slide'));
        step(0.021);
        expect(moves.playing).toBe(true);
        expect(ended).toEqual([]);
    });
});

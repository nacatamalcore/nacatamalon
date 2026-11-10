import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { crossDissolve, crossfade, crossIris, crossWipe, dissolve, fade, iris, pixelate, push, wipe } from '../src/transition';
import { registerScene } from '../src/scene/register_scene';
import { stepTransition } from '../src/transition/step_transition';
import { tick } from '../src/game/loop/tick';
import { useScene } from '../src/hooks/scene/use_scene';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createHeadlessGame } from '../src/headless';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { buildPostShader } from '../src/render/webgpu/post/post_shader';
import { buildPostShaderGlsl } from '../src/render/webgl2/post/post_shader';
import { countPostSteps } from '../src/render/shared/post_steps';
import { easeInQuad } from '../src/math/easing';
import { newBox } from '../src/box';
import type { TPostEffect } from '../src/post/types/t_post_effect';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TTexture } from '../src/loaders/texture/types/t_texture';
import type { TTransition } from '../src/transition';
import type { TTransitionState } from '../src/transition/types/t_transition_state';

/**
 * A transition that crosses: the scene coming in shown from the start, mixed with the last picture
 * of the one going out, in one run instead of two halves.
 *
 * What is pinned is the clock and the lifecycle, which are where it differs from the transitions
 * that cover: the swap comes as soon as the scene coming in has loaded, `progress` spends the whole
 * duration after it, and the effect is told when to take the picture and when to keep it. The
 * picture itself is the card's, and the browser checks look at it there.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1 / 60;

/**
 * A mask still on its way, whose arrival the test decides.
 */
const loadingMask = (): TTexture => ({ type: 'texture', key: 'mask', src: 'mask.png', width: 0, height: 0, status: 'loading', gpu: null });

const CROSSING: Array<[string, TTransition]> = [
    ['crossfade', crossfade(0.6)],
    ['push', push(0.5, 'left')],
    ['crossWipe', crossWipe(0.6, 'down')],
    ['crossIris', crossIris(0.6, { x: 0.2, y: 0.8 })],
    ['crossDissolve', crossDissolve(0.8, loadingMask(), { softness: 0.1 })],
];

/**
 * A crossing transition in flight with nothing real behind it, its picture already drawn unless
 * told: enough to move the clock on.
 */
const inFlight = (duration: number, loaded = true, outgoing: TPostEffect['outgoing'] = 'taken'): TTransitionState => ({
    effect: { type: 'post', outgoing } as TPostEffect,
    half: duration,
    elapsed: 0,
    progress: 0,
    ease: null,
    cross: true,
    phase: 'cover',
    incoming: newBox('in'),
    outgoing: newBox('out'),
    rebuild: null,
    loaded,
    done: false,
});

/**
 * A game whose frames are driven by hand, starting in room `A` with a handle on it, and a room `B`.
 */
const twoRooms = () => {
    const { store } = createTestGame({}, createFakeCanvas(480, 320));
    const ctx = createFrameContext();
    let now = 0;
    const frame = (): void => {
        const prev = now;
        now += FRAME * 1000;
        tick(store, ctx, now, prev);
    };
    const frames = (seconds: number): void => {
        for (let left = seconds; left > 0; left -= FRAME) {
            frame();
        }
    };

    const counted = { cleaned: 0 };
    registerScene(store, 'B', () => createScene());
    let handle!: TSceneHandle;
    startTestScene(store, 'A', () => {
        handle = useScene();
        useCleanup(() => { counted.cleaned += 1; });
        return createScene();
    });
    return { store, frame, frames, counted, handle: () => handle };
};

describe('the transitions that cross', () => {
    it('all cross, carry both halves and a kind for every uniform', () => {
        for (const [name, transition] of CROSSING) {
            expect(transition.cross, name).toBe(true);
            expect(transition.fragment, name).toContain('sampleOutgoing(');
            expect(transition.fragmentGlsl, name).toContain('sampleOutgoing(');
            expect(Object.keys(transition.uniformSig ?? {}).sort(), name).toEqual(Object.keys(transition.uniforms ?? {}).sort());
        }
    });

    it('are given sampleOutgoing by both cards', () => {
        const transition = crossfade(0.6);
        expect(buildPostShader(transition.fragment, {})).toContain('fn sampleOutgoing(');
        expect(buildPostShaderGlsl(transition.fragmentGlsl!, {}).fragment).toContain('vec4 sampleOutgoing(');
    });

    it('and the ones that cover do not cross', () => {
        for (const transition of [fade(0.3), wipe(0.3), iris(0.4), pixelate(0.4), dissolve(0.6, loadingMask())]) {
            expect(transition.cross, transition.name).toBeUndefined();
        }
    });

    it('take a direction as a vector, a centre, and a softness between 0 and 1', () => {
        expect(push(0.5, 'left').uniforms!.direction).toEqual([-1, 0]);
        expect(crossWipe(0.6, 'down').uniforms!.direction).toEqual([0, 1]);
        expect(crossIris(0.6).uniforms!.center).toEqual([0.5, 0.5]);
        expect(crossDissolve(0.8, loadingMask(), { softness: 3 }).uniforms!.softness).toBe(1);
        expect(crossDissolve(0.8, loadingMask()).uniforms!.softness).toBe(0);
    });
});

describe('how a transition that crosses is moved on', () => {
    it('swaps on the first step, from nothing, and spends the whole duration after it', () => {
        const state = inFlight(0.6);

        expect(stepTransition(state, FRAME)).toBe('swap');
        expect(state.phase).toBe('reveal');
        expect(state.progress).toBe(0);
        expect(state.effect.outgoing).toBe('keep');

        expect(stepTransition(state, 0.3)).toBe('running');
        expect(state.progress).toBeCloseTo(0.5, 6);
        expect(state.done).toBe(false);

        stepTransition(state, 0.3);
        expect(state.progress).toBe(1);
        expect(state.done).toBe(true);
    });

    it('waits for what is coming in with its clock still, taking the picture all the while', () => {
        const state = inFlight(0.6, false, 'take');

        expect(stepTransition(state, 0.5)).toBe('running');
        expect(stepTransition(state, 0.5)).toBe('running');
        expect(state.phase).toBe('cover');
        expect(state.progress).toBe(0);
        expect(state.elapsed).toBe(0);
        expect(state.effect.outgoing).toBe('take');

        state.loaded = true;
        state.effect.outgoing = 'taken';
        expect(stepTransition(state, FRAME)).toBe('swap');
        expect(state.progress).toBe(0);
    });

    it('waits for a frame drawn with its picture, and swaps anyway past a second without one', () => {
        const state = inFlight(0.6, true, 'take');
        // Two steps of the clock in one picture: the second must not swap before anything was drawn.
        expect(stepTransition(state, 0)).toBe('running');
        expect(stepTransition(state, FRAME)).toBe('running');
        expect(state.phase).toBe('cover');

        // A card that never draws does not hold the change for ever: past a second it is a cut,
        // straight to the end and done on the next step.
        expect(stepTransition(state, 1)).toBe('swap');
        expect(state.progress).toBe(1);
        expect(state.effect.outgoing).toBe('keep');
        stepTransition(state, FRAME);
        expect(state.done).toBe(true);
    });

    it('swaps again as a cut when the first swap was one, for a restart still loading its new copy', () => {
        const state = inFlight(0.6, true, 'take');
        stepTransition(state, 1);
        expect(state.progress).toBe(1);
        // What the restart does while its new copy loads: back to waiting, with the clock at the end
        // it reached.
        expect(state.elapsed).toBe(state.half);
        state.phase = 'cover';
        state.loaded = false;
        expect(stepTransition(state, FRAME)).toBe('running');
        state.loaded = true;
        expect(stepTransition(state, FRAME)).toBe('swap');
        expect(state.progress).toBe(1);
    });

    it('with no duration, does not wait for a picture nobody would see', () => {
        const state = inFlight(0, true, 'take');
        expect(stepTransition(state, FRAME)).toBe('swap');
        expect(state.progress).toBe(1);
    });

    it('moves along its curve over the one run', () => {
        const state = { ...inFlight(0.6), ease: easeInQuad };
        stepTransition(state, FRAME);
        stepTransition(state, 0.3);
        expect(state.progress).toBeCloseTo(0.25, 6);
    });

    it('with no duration, is over as soon as it has swapped', () => {
        const state = inFlight(0);
        expect(stepTransition(state, FRAME)).toBe('swap');
        expect(state.progress).toBe(1);
        stepTransition(state, FRAME);
        expect(state.done).toBe(true);
    });
});

describe('a change that crosses', () => {
    it('asked between two frames, draws one with its picture first, and stops the scene going out on the next', () => {
        const { store, frame, frames, counted, handle } = twoRooms();
        handle().change('B', { transition: crossfade(0.5) });
        const state = store.get('transition').active!;
        expect(state.half).toBe(0.5);
        expect(state.effect.outgoing).toBe('take');
        const incoming = state.incoming!;
        expect(incoming.held).toBe(true);

        // Nothing drawn with the picture yet, so no swap: this frame is the one that takes it.
        frame();
        expect(counted.cleaned).toBe(0);
        expect(state.phase).toBe('cover');
        expect(state.effect.outgoing).toBe('taken');

        frame();
        expect(counted.cleaned).toBe(1);
        expect(incoming.held).toBe(false);
        expect(state.phase).toBe('reveal');
        expect(state.effect.outgoing).toBe('keep');

        frames(0.5);
        frame();
        expect(store.get('transition').active).toBeNull();
    });

    it('lasts what it was given, where one that covers spends half on each side of the swap', () => {
        const { store, handle } = twoRooms();
        handle().change('B', { transition: fade(0.5) });
        const covering = store.get('transition').active!;
        expect(covering.half).toBe(0.25);
        expect(covering.effect.outgoing).toBeUndefined();
    });

    it('waits for its mask with the scene going out still playing', () => {
        const { store, frames, counted, handle } = twoRooms();
        const mask = loadingMask();
        handle().change('B', { transition: crossDissolve(0.4, mask) });
        const state = store.get('transition').active!;

        frames(0.3);
        expect(state.phase).toBe('cover');
        expect(counted.cleaned).toBe(0);

        mask.status = 'ready';
        frames(FRAME);
        expect(state.phase).toBe('reveal');
        expect(counted.cleaned).toBe(1);
    });

    it('opens a scene over the one playing, and closes it the same way', () => {
        const { store, frame, frames, handle } = twoRooms();
        registerScene(store, 'Menu', () => createScene());
        handle().launch('Menu', { transition: crossfade(0.3) });
        const opening = store.get('transition').active!;
        frame();
        frame();
        expect(opening.phase).toBe('reveal');
        expect(opening.incoming!.held).toBe(false);
        frames(0.4);
        expect(store.get('transition').active).toBeNull();

        handle().stop('Menu', { transition: crossfade(0.3) });
        const closing = store.get('transition').active!;
        const menu = closing.outgoing!;
        frame();
        frame();
        expect(closing.phase).toBe('reveal');
        expect(store.get('world').scenes.includes(menu)).toBe(false);
    });

    it('restarts a scene with the new copy built once the old one\'s picture is taken', () => {
        const { store, frame } = twoRooms();
        const copies: TSceneHandle[] = [];
        startTestScene(store, 'Level', () => {
            copies.push(useScene());
            return createScene();
        });
        copies[0]!.change('Level', { transition: crossWipe(0.4) });
        const state = store.get('transition').active!;
        expect(copies).toHaveLength(1);

        frame();
        expect(copies).toHaveLength(1);
        frame();
        expect(copies).toHaveLength(2);
        expect(state.phase).toBe('reveal');
        expect(state.incoming!.held).toBe(false);
        expect(state.effect.outgoing).toBe('keep');
    });
});

describe('a crossing in a game with no card', () => {
    it('swaps as soon as a covering one would start, with no wait for a picture', () => {
        const counted = { a: 0, b: 0 };
        let handle!: TSceneHandle;
        const game = createHeadlessGame({
            width: 320,
            height: 180,
            scenes: {
                A: () => {
                    handle = useScene();
                    useUpdate(() => { counted.a += 1; });
                    return createScene();
                },
                B: () => {
                    useUpdate(() => { counted.b += 1; });
                    return createScene();
                },
            },
            initialScene: 'A',
        });
        game.run(2);
        const before = counted.a;
        handle.change('B', { transition: crossfade(0.5) });
        game.run(4);
        expect(counted.a - before).toBeLessThanOrEqual(2);
        expect(counted.b).toBeGreaterThan(0);
        game.destroy();
    });
});

describe('the picture of the scene going out', () => {
    it('costs one more draw while it is being taken, and none once it is kept', () => {
        const effect = { type: 'post', outgoing: 'take' } as TPostEffect;
        expect(countPostSteps([effect])).toBe(2);
        effect.outgoing = 'taken';
        expect(countPostSteps([effect])).toBe(2);
        effect.outgoing = 'keep';
        expect(countPostSteps([effect])).toBe(1);
    });
});

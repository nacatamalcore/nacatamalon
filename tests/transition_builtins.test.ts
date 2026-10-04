import { describe, expect, it } from 'bun:test';
import { fade, iris, pixelate, wipe } from '../src/transition/builtin';
import { canDrawTransition } from '../src/transition/start_transition';
import { stepTransition } from '../src/transition/step_transition';
import { createTestGame } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TPostEffect } from '../src/post/types/t_post_effect';
import type { TTransition } from '../src/transition';
import type { TTransitionState } from '../src/transition/types/t_transition_state';

/**
 * The four the engine ships, and the arithmetic that drives any of them.
 *
 * What is pinned here is the shape of the contract rather than the picture: whether the two halves
 * both exist, whether the duration means what it says, and whether `progress` and `phase` move the
 * way a shader is written to expect. Whether a fade actually looks like a fade is a question only a
 * card can answer, and the browser checks ask it there.
 */

const ALL: Array<[string, TTransition]> = [
    ['fade', fade(300)],
    ['wipe', wipe(300, 'right')],
    ['iris', iris(400)],
    ['pixelate', pixelate(400)],
];

/**
 * A transition in flight with nothing real behind it: enough to move the clock on.
 */
const inFlight = (duration: number, loaded = true): TTransitionState => ({
    effect: { type: 'post' } as TPostEffect,
    half: duration / 2000,
    elapsed: 0,
    progress: 0,
    phase: 'cover',
    incoming: { name: 'in' } as TBox,
    outgoing: { name: 'out' } as TBox,
    loaded,
    done: false,
});

describe('the transitions the engine ships', () => {
    it('all carry both halves, because these four are the engine\'s own', () => {
        for (const [name, transition] of ALL) {
            expect(transition.fragment.length, name).toBeGreaterThan(0);
            expect(transition.fragmentGlsl, name).toBeDefined();
            expect(transition.fragmentGlsl!.length, name).toBeGreaterThan(0);
        }
    });

    it('declare a kind for every knob they set, and no knob they do not', () => {
        for (const [name, transition] of ALL) {
            const values = Object.keys(transition.uniforms ?? {}).sort();
            const kinds = Object.keys(transition.uniformSig ?? {}).sort();
            expect(kinds, name).toEqual(values);
        }
    });

    it('take the duration as written, and it is the whole thing', () => {
        expect(fade(300).duration).toBe(300);
        // Half of it covers and half uncovers, so what the clock counts per half is 150ms.
        expect(inFlight(300).half).toBeCloseTo(0.15, 6);
    });

    it('send a wipe\'s direction as a vector, one per side, never as the word', () => {
        const axes = (['left', 'right', 'up', 'down'] as const)
            .map((direction) => wipe(300, direction).uniforms!.direction as number[]);

        for (const axis of axes) {
            expect(Math.hypot(axis[0], axis[1])).toBeCloseTo(1, 6);
        }
        // Four distinct axes, and opposite pairs really are opposite. Summed rather than negated
        // and compared: a negated zero is a different value to `toEqual` and the same direction to
        // everything that matters.
        expect(new Set(axes.map((axis) => axis.join(','))).size).toBe(4);
        for (const [a, b] of [[0, 1], [2, 3]]) {
            expect(axes[a][0] + axes[b][0]).toBeCloseTo(0, 6);
            expect(axes[a][1] + axes[b][1]).toBeCloseTo(0, 6);
        }
    });

    it('lets an iris be closed on somewhere other than the middle', () => {
        expect(iris(400).uniforms!.centre).toEqual([0.5, 0.5]);
        expect(iris(400, undefined, { x: 0.2, y: 0.8 }).uniforms!.centre).toEqual([0.2, 0.8]);
    });
});

describe('how a transition is moved on', () => {
    it('runs 0 to 1 covering, then 0 to 1 again uncovering', () => {
        const state = inFlight(300);

        expect(stepTransition(state, 0.075)).toBe('running');
        expect(state.phase).toBe('cover');
        expect(state.progress).toBeCloseTo(0.5, 6);

        // The frame that fills the cover is the frame that swaps, and the uncover starts at its
        // own beginning rather than counting back down: a wipe has to leave the way it came in.
        expect(stepTransition(state, 0.075)).toBe('swap');
        expect(state.phase).toBe('reveal');
        expect(state.progress).toBeCloseTo(0, 6);

        expect(stepTransition(state, 0.075)).toBe('running');
        expect(state.progress).toBeCloseTo(0.5, 6);
        expect(state.done).toBe(false);
    });

    it('is marked done only once, and one frame before it is taken away', () => {
        const state = inFlight(300);
        stepTransition(state, 0.15);
        stepTransition(state, 0.15);

        // The frame that reached the end still has the effect in it, so the last cover anybody
        // saw was the cover fully gone.
        expect(state.progress).toBe(1);
        expect(state.done).toBe(true);
    });

    it('holds at full cover until what is coming in has landed', () => {
        const state = inFlight(300, false);

        expect(stepTransition(state, 0.15)).toBe('running');
        expect(state.progress).toBe(1);
        expect(state.phase).toBe('cover');

        expect(stepTransition(state, 0.2)).toBe('running');
        expect(state.phase).toBe('cover');

        state.loaded = true;
        expect(stepTransition(state, 0.016)).toBe('swap');
    });

    it('carries the overshoot into the uncover, but never more than one frame of it', () => {
        // Covered with time to spare: the leftover goes into the second half so the whole thing
        // keeps to the duration it was given.
        const quick = inFlight(300);
        stepTransition(quick, 0.2);
        expect(quick.elapsed).toBeCloseTo(0.05, 6);

        // Held at full cover for two seconds waiting on a load: carrying *that* leftover would
        // skip the uncover altogether, so it is capped at the frame that released it.
        const slow = inFlight(300, false);
        stepTransition(slow, 2);
        slow.loaded = true;
        stepTransition(slow, 0.016);
        expect(slow.elapsed).toBeCloseTo(0.016, 6);
    });

    it('treats no duration as a cover that lasts exactly as long as the load', () => {
        const state = inFlight(0, false);

        expect(stepTransition(state, 0.016)).toBe('running');
        expect(state.progress).toBe(1);

        state.loaded = true;
        expect(stepTransition(state, 0.016)).toBe('swap');
    });
});

describe('a card that cannot draw it', () => {
    it('takes any of the four, on either backend', () => {
        const { store } = createTestGame();
        for (const [name, transition] of ALL) {
            expect(canDrawTransition(store, transition), name).toBe(true);
        }
    });

    it('refuses a WGSL-only transition on WebGL2, rather than running it blind', () => {
        const { store, renderer } = createTestGame();
        const wgslOnly: TTransition = { name: 'mine', duration: 300, fragment: 'fn effect() {}' };

        expect(canDrawTransition(store, wgslOnly)).toBe(true);

        (renderer as { capabilities: { backend: string; msaa: number } }).capabilities = { backend: 'WEBGL2', msaa: 1 };
        // A cover nobody can draw is worse than no cover: the scene coming in would sit held and
        // unseen for the whole duration and then appear all at once.
        expect(canDrawTransition(store, wgslOnly)).toBe(false);
        expect(canDrawTransition(store, fade(300))).toBe(true);
    });
});

import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useTween } from '../src/hooks/tween/use_tween';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { easeInQuad, linear } from '../src/math/easing';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TTweenStarter } from '../src/hooks/tween/types/t_tween';
import type { TRuntimeStore } from '../src/store';

/**
 * A scene whose only job is to hold a tween starter, plus a hand-cranked clock. No renderer runs
 * here: `runHookUpdates` is exactly what the loop calls, so a test frame and a real one are the
 * same call with a delta the test chooses.
 */
const scened = (): { tween: TTweenStarter; tick: (seconds: number) => void; store: TRuntimeStore; root: TBox } => {
    const { store } = createTestGame();
    let tween!: TTweenStarter;

    const root = startTestScene(store, 'Level', () => {
        tween = useTween();
        return createScene();
    });

    return { tween, tick: (seconds: number) => runHookUpdates(root, seconds), store, root };
};

/**
 * Collects every value a tween reports, so a whole trip can be read at the end.
 */
const recorder = () => {
    const values: number[] = [];
    return { values, onUpdate: (value: number) => { values.push(value); } };
};

describe('useTween', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useTween()).toThrow('[NacatamalOn] useTween');
    });

    it('carries the value from one end to the other', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate }).play();

        tick(0.5);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);
    });

    it('lands exactly on the destination once the time is up', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 1, duration: 1, onUpdate: seen.onUpdate }).play();

        // Ten frames of a tenth of a second do not add up to one second: 0.1 cannot be written
        // exactly in binary, so the clock lands a hair short and the value with it. What is
        // promised is that it never goes past the destination...
        for (let i = 0; i < 10; i += 1) {
            tick(0.1);
        }
        expect(seen.values.at(-1)).toBeLessThanOrEqual(1);
        expect(seen.values.at(-1)).toBeCloseTo(1, 10);

        // ...and that the moment the clock does reach the duration, the value is the destination
        // itself and not something near it. That is why it is worked out from the two ends every
        // frame instead of being added up.
        tick(0.1);
        expect(seen.values.at(-1)).toBe(1);
    });

    it('does not overshoot when a frame runs long', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 0.2, onUpdate: seen.onUpdate }).play();
        tick(5);

        expect(seen.values.at(-1)).toBe(100);
    });

    it('bends the trip through the easing curve', () => {
        const { tween, tick } = scened();
        const straight = recorder();
        const bent = recorder();

        tween({ from: 0, to: 100, duration: 1, ease: linear, onUpdate: straight.onUpdate }).play();
        tween({ from: 0, to: 100, duration: 1, ease: easeInQuad, onUpdate: bent.onUpdate }).play();
        tick(0.5);

        expect(straight.values.at(-1)).toBeCloseTo(50, 10);
        expect(bent.values.at(-1)).toBeCloseTo(25, 10);
    });

    it('waits out its delay before moving', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 1, delay: 0.3, onUpdate: seen.onUpdate }).play();

        tick(0.2);
        expect(seen.values).toEqual([]);

        tick(0.2);
        // Only the 0.1 left over after the delay counts as movement, not the whole frame.
        expect(seen.values.at(-1)).toBeCloseTo(10, 10);
    });

    it('runs one extra time with repeat: 1', () => {
        const { tween, tick } = scened();
        let completed = 0;

        const handle = tween({ from: 0, to: 10, duration: 1, repeat: 1, onUpdate: () => {} });
        handle.onEnd(() => { completed += 1; });
        handle.play();

        tick(1);
        expect(completed).toBe(0);

        tick(1);
        expect(completed).toBe(1);
    });

    it('never ends with a negative repeat', () => {
        const { tween, tick } = scened();
        let completed = 0;

        const handle = tween({
            from: 0, to: 10, duration: 0.1, repeat: -1,
            onUpdate: () => {},
        });
        handle.onEnd(() => { completed += 1; });
        handle.play();

        for (let i = 0; i < 100; i += 1) {
            tick(0.1);
        }

        expect(completed).toBe(0);
        expect(handle.playing).toBe(true);
    });

    it('comes back the other way with yoyo', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 1, repeat: 1, yoyo: true, onUpdate: seen.onUpdate }).play();

        tick(1);
        expect(seen.values.at(-1)).toBe(100);

        tick(0.5);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);

        tick(0.5);
        expect(seen.values.at(-1)).toBe(0);
    });

    it('announces the end once and only once', () => {
        const { tween, tick } = scened();
        let completed = 0;

        const handle = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        handle.onEnd(() => { completed += 1; });
        handle.play();

        tick(0.5);
        tick(0.5);
        tick(0.5);

        expect(completed).toBe(1);
    });

    it('stops in silence with stop', () => {
        const { tween, tick } = scened();
        const seen = recorder();
        let completed = 0;

        const handle = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        handle.onEnd(() => { completed += 1; });
        handle.play();

        tick(0.5);
        const atStop = seen.values.length;
        handle.stop();
        tick(0.5);

        expect(handle.playing).toBe(false);
        expect(completed).toBe(0);
        expect(seen.values.length).toBe(atStop);
    });

    it('jumps to the end and announces it when finished', () => {
        const { tween } = scened();
        const seen = recorder();
        let completed = 0;

        const handle = tween({ from: 0, to: 100, duration: 10, onUpdate: seen.onUpdate });
        handle.onEnd(() => { completed += 1; });
        handle.play();
        handle.finish();

        expect(seen.values.at(-1)).toBe(100);
        expect(completed).toBe(1);
        expect(handle.playing).toBe(false);
    });

    it('does not announce twice if finished after it already ended', () => {
        const { tween, tick } = scened();
        let completed = 0;

        const handle = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        handle.onEnd(() => { completed += 1; });
        handle.play();

        tick(0.5);
        handle.finish();

        expect(completed).toBe(1);
    });

    it('freezes on pause and picks up where it left off', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        const handle = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        handle.play();

        tick(0.25);
        handle.pause();
        tick(10);
        expect(seen.values.at(-1)).toBeCloseTo(25, 10);

        // From where it stopped, not from where the clock would have taken it.
        handle.resume();
        tick(0.25);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);
    });

    it('delivers the destination at once with no duration', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 42, duration: 0, onUpdate: seen.onUpdate }).play();
        tick(0.016);

        expect(seen.values).toEqual([42]);
    });

    it('starts a tween chained from onEnd on the next frame, not this one', () => {
        const { tween, tick } = scened();
        const second = recorder();

        const first = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        first.onEnd(() => {
            tween({ from: 100, to: 200, duration: 1, onUpdate: second.onUpdate }).play();
        });
        first.play();

        tick(0.5);
        expect(second.values).toEqual([]);

        tick(0.5);
        expect(second.values.at(-1)).toBeCloseTo(150, 10);
    });

    it('goes away with its scene', () => {
        const { tween, store } = scened();
        const seen = recorder();

        // Driven the way the loop drives it, over the list of running scenes, because that list
        // is the whole of the cleanup: a stopped scene is not updated because it is no longer on
        // it, and its tweens stop with it without anything being unregistered.
        const frame = (seconds: number) => {
            for (const scene of [...store.get('world').scenes]) {
                runHookUpdates(scene, seconds);
            }
        };

        tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate }).play();
        frame(0.5);
        const atStop = seen.values.length;

        stopScene(store, 'Level');
        frame(0.5);

        expect(store.get('world').scenes).toHaveLength(0);
        expect(seen.values.length).toBe(atStop);
    });

    it('keeps the tweens of two scenes apart', () => {
        const { store } = createTestGame();
        const first = recorder();
        const second = recorder();

        const menu = startTestScene(store, 'Menu', () => {
            useTween()({ from: 0, to: 100, duration: 1, onUpdate: first.onUpdate }).play();
            return createScene();
        });
        startTestScene(store, 'Level', () => {
            useTween()({ from: 0, to: 100, duration: 1, onUpdate: second.onUpdate }).play();
            return createScene();
        });

        runHookUpdates(menu, 0.5);

        expect(first.values.at(-1)).toBeCloseTo(50, 10);
        expect(second.values).toEqual([]);
    });
});

/**
 * Something with numbers in it, shaped like a sprite: what a target tween moves.
 */
const thing = () => ({ transform: { x: 0, y: 0 }, tint: { r: 1, g: 1, b: 1, a: 1 } });

describe('useTween with a target', () => {
    it('moves the fields named in to, and lands exactly on them', () => {
        const { tween, tick } = scened();
        const hero = thing();

        tween({ target: hero, to: { transform: { x: 100, y: 50 }, tint: { a: 0 } }, duration: 1 }).play();

        tick(0.5);
        expect(hero.transform.x).toBeCloseTo(50, 10);
        expect(hero.transform.y).toBeCloseTo(25, 10);
        expect(hero.tint.a).toBeCloseTo(0.5, 10);

        tick(0.5);
        expect(hero.transform).toEqual({ x: 100, y: 50 });
        expect(hero.tint.a).toBe(0);
        // What was not named is left alone.
        expect(hero.tint.r).toBe(1);
    });

    it('starts a field with no from where it is when it starts moving, after its delay', () => {
        const { tween, tick } = scened();
        const hero = thing();

        tween({ target: hero, to: { transform: { x: 100 } }, duration: 1, delay: 0.5 }).play();

        // Moved by something else while the tween waits: the tween starts from here.
        tick(0.25);
        hero.transform.x = 60;
        tick(0.25);
        tick(0.5);

        expect(hero.transform.x).toBeCloseTo(80, 10);
    });

    it('uses a from when it is given', () => {
        const { tween, tick } = scened();
        const hero = thing();

        tween({ target: hero, from: { transform: { x: 200 } }, to: { transform: { x: 100 } }, duration: 1 }).play();
        tick(0.5);

        expect(hero.transform.x).toBeCloseTo(150, 10);
    });

    it('follows the path again every frame, so a part swapped halfway is the one moved', () => {
        const { tween, tick } = scened();
        const hero = thing();

        tween({ target: hero, to: { tint: { a: 0 } }, duration: 1 }).play();
        tick(0.5);
        const old = hero.tint;
        hero.tint = { r: 1, g: 0, b: 0, a: 1 };
        tick(0.25);

        expect(hero.tint.a).toBeCloseTo(0.25, 10);
        expect(old.a).toBeCloseTo(0.5, 10);
    });

    it('warns once about a path that is not a number and moves the rest', () => {
        const { tween, tick } = scened();
        const hero = thing();
        const warn = console.warn;
        const warnings: string[] = [];
        console.warn = (message: string) => { warnings.push(message); };

        try {
            tween({ target: hero, to: { transform: { x: 100 }, missing: { z: 3 } } as never, duration: 1 }).play();
            tick(0.5);
            tick(0.5);
        } finally {
            console.warn = warn;
        }

        expect(hero.transform.x).toBe(100);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("'missing.z'");
    });

    it('comes back the other way with yoyo', () => {
        const { tween, tick } = scened();
        const hero = thing();

        tween({ target: hero, to: { transform: { x: 100 } }, duration: 1, repeat: 1, yoyo: true }).play();
        tick(1);
        tick(0.5);
        expect(hero.transform.x).toBeCloseTo(50, 10);
        tick(0.5);
        expect(hero.transform.x).toBe(0);
    });

    it('jumps to the end with finish, even before it started moving', () => {
        const { tween } = scened();
        const hero = thing();

        const handle = tween({ target: hero, to: { transform: { x: 100 } }, duration: 1, delay: 5 });
        handle.play();
        handle.finish();

        expect(hero.transform.x).toBe(100);
    });

    it('takes a real sprite, and its fields by their path', () => {
        const { store } = createTestGame();
        let x = 0;
        const root = startTestScene(store, 'Level', () => {
            const hero = createSprite({ width: 8, height: 8, transform: { x: 0, y: 0 } });
            const walk = useTween()({ target: hero, to: { transform: { x: 40 }, tint: { a: 0.5 } }, duration: 1 });
            walk.onEnd(() => { x = hero.transform.x; });
            walk.play();
            return createScene();
        });

        runHookUpdates(root, 1);
        expect(x).toBe(40);
    });
});

describe('onEnd and onStop on a tween', () => {
    it('hears the end when it arrives and when it is finished, never when it is stopped', () => {
        const { tween, tick } = scened();
        const heard: string[] = [];

        const arrives = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        arrives.onEnd(() => heard.push('arrived'));
        const finished = tween({ from: 0, to: 1, duration: 10, onUpdate: () => {} });
        finished.onEnd(() => heard.push('finished'));
        const stopped = tween({ from: 0, to: 1, duration: 10, onUpdate: () => {} });
        stopped.onEnd(() => heard.push('stopped'));
        for (const handle of [arrives, finished, stopped]) handle.play();

        finished.finish();
        stopped.stop();
        tick(0.5);

        expect(heard).toEqual(['finished', 'arrived']);
    });

    it('runs every listener once, in order, and stops for one that stopped listening', () => {
        const { tween, tick } = scened();
        const heard: string[] = [];

        const handle = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        handle.onEnd(() => heard.push('a'));
        const stop = handle.onEnd(() => heard.push('b'));
        handle.onEnd(() => heard.push('c'));
        stop();
        handle.play();

        tick(0.5);
        tick(0.5);

        expect(heard).toEqual(['a', 'c']);
    });

    it('hears a stop once, and not one after it already ended', () => {
        const { tween, tick } = scened();
        let stops = 0;

        const handle = tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
        handle.onStop(() => { stops += 1; });
        handle.play();
        handle.stop();
        handle.stop();

        const ended = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        ended.onStop(() => { stops += 1; });
        ended.play();
        tick(0.5);
        ended.stop();
        ended.finish();

        expect(stops).toBe(1);
    });
});

describe('a tween declared, then played', () => {
    it('moves nothing until it is played', () => {
        const { tween, tick } = scened();
        const hero = thing();

        const walk = tween({ target: hero, to: { transform: { x: 100 } }, duration: 1 });
        tick(0.5);
        expect(hero.transform.x).toBe(0);
        expect(walk.playing).toBe(false);

        walk.play();
        expect(walk.playing).toBe(true);
        tick(0.5);
        expect(hero.transform.x).toBeCloseTo(50, 10);
    });

    it('played on the frame it is declared from a callback, moves from the next', () => {
        const { tween, tick } = scened();
        const seen = recorder();
        // Played between frames, as a key press or a collision does.
        tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate }).play();
        tick(0.25);
        expect(seen.values.at(-1)).toBeCloseTo(25, 10);
    });

    it('played again once over, makes the same trip from the same start, every time', () => {
        const { tween, tick } = scened();
        const door = thing();
        let ends = 0;

        const open = tween({ target: door, to: { transform: { y: -40 } }, duration: 0.5 });
        open.onEnd(() => { ends += 1; });
        open.play();
        tick(0.5);
        expect(door.transform.y).toBe(-40);

        // Over: playing it again closes it at once and opens it again.
        open.play();
        expect(door.transform.y).toBe(0);
        tick(0.25);
        expect(door.transform.y).toBeCloseTo(-20, 10);
        tick(0.25);
        expect(door.transform.y).toBe(-40);
        expect(ends).toBe(2);
    });

    it('played while it plays, starts again from the beginning', () => {
        const { tween, tick } = scened();
        const door = thing();
        let ends = 0;

        const open = tween({ target: door, to: { transform: { y: -40 } }, duration: 1 });
        open.onEnd(() => { ends += 1; });
        open.play();
        tick(0.5);
        open.play();
        expect(door.transform.y).toBe(0);
        tick(0.5);
        expect(door.transform.y).toBeCloseTo(-20, 10);
        tick(0.5);
        expect(door.transform.y).toBe(-40);
        // Started again is not ended: one end, of the play that arrived.
        expect(ends).toBe(1);
    });

    it('moves a field by an amount from wherever it is, each time it is played', () => {
        const { tween, tick } = scened();
        const hero = thing();
        hero.transform.x = 100;

        const knockback = tween({ target: hero, by: { transform: { x: -12 } }, duration: 0.2 });
        knockback.play();
        tick(0.2);
        expect(hero.transform.x).toBe(88);

        // Walked on in between: the next push starts from there.
        hero.transform.x = 50;
        knockback.play();
        expect(hero.transform.x).toBe(50);
        tick(0.2);
        expect(hero.transform.x).toBe(38);
    });

    it('takes a to and a by for different fields, and refuses one field in both or nothing to move', () => {
        const { tween, tick } = scened();
        const hero = thing();
        hero.transform.x = 10;

        tween({ target: hero, to: { tint: { a: 0 } }, by: { transform: { x: 5 } }, duration: 1 }).play();
        tick(1);
        expect(hero.transform.x).toBe(15);
        expect(hero.tint.a).toBe(0);

        expect(() => tween({ target: hero, to: { transform: { x: 1 } }, by: { transform: { x: 1 } }, duration: 1 })).toThrow("'transform.x' is in both");
        expect(() => tween({ target: hero, duration: 1 })).toThrow('nothing to move');
    });

    it('stops where it is, and played again starts from the beginning', () => {
        const { tween, tick } = scened();
        const door = thing();

        const open = tween({ target: door, to: { transform: { y: -40 } }, duration: 1 });
        open.play();
        tick(0.5);
        open.stop();
        tick(0.5);
        expect(door.transform.y).toBeCloseTo(-20, 10);

        open.play();
        expect(door.transform.y).toBe(0);
    });

    it('does nothing on resume once stopped', () => {
        const { tween, tick } = scened();
        const seen = recorder();
        const handle = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        handle.play();
        tick(0.5);
        handle.stop();
        handle.resume();
        tick(0.5);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);
        expect(handle.playing).toBe(false);
    });

    it('goes back to where its play started with reset, telling onStop only if it was playing', () => {
        const { tween, tick } = scened();
        const door = thing();
        const hero = thing();
        let stops = 0;

        const open = tween({ target: door, to: { transform: { y: -40 } }, duration: 1 });
        open.onStop(() => { stops += 1; });
        // Never played: there is no start to go back to.
        open.reset();
        expect(door.transform.y).toBe(0);

        open.play();
        tick(0.5);
        open.reset();
        expect(door.transform.y).toBe(0);
        expect(open.playing).toBe(false);
        expect(stops).toBe(1);

        open.play();
        tick(1);
        open.reset();
        expect(door.transform.y).toBe(0);
        expect(stops).toBe(1);

        // One moved by an amount goes back to where that play found it.
        hero.transform.x = 30;
        const push = tween({ target: hero, by: { transform: { x: 10 } }, duration: 1 });
        push.play();
        tick(1);
        push.reset();
        expect(hero.transform.x).toBe(30);
    });

    it('finishes at the end of its last trip, however many repeats there were to come', () => {
        const { tween } = scened();
        const seen = recorder();
        const handle = tween({ from: 0, to: 100, duration: 1, repeat: 1, yoyo: true, onUpdate: seen.onUpdate });
        handle.play();
        handle.finish();
        // There and back: it ends where it started.
        expect(seen.values.at(-1)).toBe(0);
    });

    it('does nothing on finish, stop or pause before it is played', () => {
        const { tween, tick } = scened();
        const seen = recorder();
        let heard = 0;
        const handle = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        handle.onEnd(() => { heard += 1; });
        handle.onStop(() => { heard += 1; });
        handle.finish();
        handle.stop();
        handle.pause();
        tick(1);
        expect(seen.values).toEqual([]);
        expect(heard).toBe(0);
    });

    it('warns once about a tween declared from a callback and never played', () => {
        const { tween, tick } = scened();
        const warn = console.warn;
        const warnings: string[] = [];
        console.warn = (message: string) => { warnings.push(message); };
        try {
            tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
            tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
            tick(0.1);
            expect(warnings).toEqual([]);
            tick(0.1);
            tick(0.1);
        } finally {
            console.warn = warn;
        }
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('never played');
    });

    it('does not warn about one declared while the scene is built, kept to be played later', () => {
        const { store } = createTestGame();
        const warn = console.warn;
        const warnings: string[] = [];
        console.warn = (message: string) => { warnings.push(message); };
        try {
            const root = startTestScene(store, 'Level', () => {
                useTween()({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
                return createScene();
            });
            for (let i = 0; i < 5; i += 1) runHookUpdates(root, 0.1);
        } finally {
            console.warn = warn;
        }
        expect(warnings).toEqual([]);
    });
});

describe('tween.chain', () => {
    it('plays them one after another, each step with no from starting where the one before left it', () => {
        const { tween, tick } = scened();
        const hero = thing();
        let ends = 0;

        const walk = tween.chain(
            tween({ target: hero, to: { transform: { x: 100 } }, duration: 1 }),
            tween({ target: hero, to: { transform: { y: 50 } }, duration: 1 }),
            tween({ target: hero, to: { transform: { x: 0 } }, duration: 1 }),
        );
        walk.onEnd(() => { ends += 1; });
        walk.play();

        tick(1);
        expect(hero.transform).toEqual({ x: 100, y: 0 });
        tick(0.5);
        expect(hero.transform.y).toBeCloseTo(25, 10);
        tick(0.5);
        tick(0.5);
        expect(hero.transform.x).toBeCloseTo(50, 10);
        expect(ends).toBe(0);
        tick(0.5);
        expect(hero.transform).toEqual({ x: 0, y: 50 });
        expect(ends).toBe(1);
        expect(walk.playing).toBe(false);
    });

    it('gives the time one step leaves over to the next, so it lasts what its steps add up to', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween.chain(
            tween({ from: 0, to: 1, duration: 0.3, onUpdate: () => {} }),
            tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate }),
        ).play();

        tick(0.5);
        expect(seen.values.at(-1)).toBeCloseTo(20, 10);
    });

    it('tells each step its own end as it ends', () => {
        const { tween, tick } = scened();
        const heard: string[] = [];
        const a = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        const b = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        a.onEnd(() => heard.push('a'));
        b.onEnd(() => heard.push('b'));
        const both = tween.chain(a, b);
        both.onEnd(() => heard.push('chain'));
        both.play();
        tick(0.5);
        tick(0.5);
        expect(heard).toEqual(['a', 'b', 'chain']);
    });

    it('finishes every step left, in order, and ends', () => {
        const { tween } = scened();
        const hero = thing();
        let ends = 0;
        const walk = tween.chain(
            tween({ target: hero, to: { transform: { x: 100 } }, duration: 1 }),
            tween({ target: hero, by: { transform: { x: 10 } }, duration: 1 }),
        );
        walk.onEnd(() => { ends += 1; });
        walk.play();
        walk.finish();
        expect(hero.transform.x).toBe(110);
        expect(ends).toBe(1);
    });

    it('stops the step playing, which hears it, and the chain, which says it once', () => {
        const { tween, tick } = scened();
        const heard: string[] = [];
        const seen = recorder();
        const a = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        const b = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        a.onStop(() => heard.push('a'));
        b.onStop(() => heard.push('b'));
        const both = tween.chain(a, b);
        both.onStop(() => heard.push('chain'));
        both.onEnd(() => heard.push('end'));
        both.play();
        tick(0.75);
        both.stop();
        tick(5);
        expect(heard).toEqual(['b', 'chain']);
        expect(seen.values.at(-1)).toBeCloseTo(25, 10);
    });

    it('played again, puts every field back where the first play found it before it starts', () => {
        const { tween, tick } = scened();
        const door = thing();
        const hero = thing();
        const through = tween.chain(
            tween({ target: door, to: { transform: { y: -40 } }, duration: 1 }),
            tween({ target: hero, to: { transform: { x: 300 } }, duration: 1 }),
        );
        through.play();
        tick(1);
        tick(1);
        expect([door.transform.y, hero.transform.x]).toEqual([-40, 300]);

        through.play();
        expect([door.transform.y, hero.transform.x]).toEqual([0, 0]);
        tick(1);
        tick(0.5);
        expect(hero.transform.x).toBeCloseTo(150, 10);
    });

    it('stops going on when a step\'s onEnd stops it, or plays it again', () => {
        const { tween, tick } = scened();
        const seen = recorder();
        const a = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} });
        const b = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        const both = tween.chain(a, b);
        a.onEnd(() => both.stop());
        both.play();
        tick(1);
        tick(1);
        expect(seen.values).toEqual([]);
        expect(both.playing).toBe(false);
    });

    it('ends on the next frame with nothing in it, not at once', () => {
        const { tween, tick } = scened();
        let ends = 0;
        const empty = tween.chain();
        empty.onEnd(() => { ends += 1; });
        empty.play();
        expect(ends).toBe(0);
        tick(0.016);
        expect(ends).toBe(1);
    });

    it('goes into another chain, and a group into it', () => {
        const { tween, tick } = scened();
        const hero = thing();
        let ends = 0;
        const outer = tween.chain(
            tween.chain(
                tween({ target: hero, to: { transform: { x: 10 } }, duration: 1 }),
                tween({ target: hero, to: { transform: { x: 20 } }, duration: 1 }),
            ),
            tween.all(
                tween({ target: hero, to: { transform: { y: 5 } }, duration: 1 }),
                tween({ target: hero, to: { tint: { a: 0 } }, duration: 2 }),
            ),
        );
        outer.onEnd(() => { ends += 1; });
        outer.play();
        tick(2);
        expect(hero.transform.x).toBe(20);
        tick(1);
        expect(hero.transform.y).toBe(5);
        expect(ends).toBe(0);
        tick(1);
        expect(hero.tint.a).toBe(0);
        expect(ends).toBe(1);
    });

    it('refuses a tween already played, one already in a chain, and what is not a tween', () => {
        const { tween } = scened();
        const played = tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
        played.play();
        expect(() => tween.chain(played)).toThrow('has been played already');

        const taken = tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
        tween.chain(taken);
        expect(() => tween.all(taken)).toThrow('already in a tween.chain or a tween.all');

        expect(() => tween.chain({} as never)).toThrow('is not a tween');
    });

    it('lets only the chain be played, paused or stopped, not what is in it', () => {
        const { tween } = scened();
        const step = tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} });
        tween.chain(step);
        for (const call of [() => step.play(), () => step.pause(), () => step.resume(), () => step.stop(), () => step.finish(), () => step.reset()]) {
            expect(call).toThrow('inside a tween.chain or a tween.all');
        }
    });
});

describe('tween.all', () => {
    it('ends once, when the last of them ends, whatever their durations and delays', () => {
        const { tween, tick } = scened();
        let ends = 0;

        const group = tween.all(...[0.2, 0.5, 0.3].map((duration, i) => tween({ from: 0, to: 1, duration, delay: i * 0.1, onUpdate: () => {} })));
        group.onEnd(() => { ends += 1; });
        group.play();

        tick(0.5);
        expect(ends).toBe(0);
        expect(group.playing).toBe(true);

        tick(0.1);
        expect(ends).toBe(1);
        expect(group.playing).toBe(false);

        tick(1);
        expect(ends).toBe(1);
    });

    it('ends on the next frame with nothing in it, not at once', () => {
        const { tween, tick } = scened();
        let ends = 0;

        const empty = tween.all();
        empty.onEnd(() => { ends += 1; });
        empty.play();
        expect(ends).toBe(0);

        tick(0.016);
        expect(ends).toBe(1);
    });

    it('stops all of them with stop, saying so once', () => {
        const { tween } = scened();
        let stops = 0;

        const group = tween.all(...[1, 2].map((duration) => tween({ from: 0, to: 1, duration, onUpdate: () => {} })));
        group.onStop(() => { stops += 1; });
        group.play();
        group.stop();

        expect(stops).toBe(1);
        expect(group.playing).toBe(false);
    });

    it('finishes all of them with finish, and ends', () => {
        const { tween } = scened();
        const seen = recorder();
        let ends = 0;

        const group = tween.all(tween({ from: 0, to: 100, duration: 5, onUpdate: seen.onUpdate }));
        group.onEnd(() => { ends += 1; });
        group.play();
        group.finish();

        expect(seen.values.at(-1)).toBe(100);
        expect(ends).toBe(1);
    });

    it('pauses and resumes all of them', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        const group = tween.all(tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate }));
        group.play();
        tick(0.25);
        group.pause();
        tick(10);
        expect(seen.values.at(-1)).toBeCloseTo(25, 10);

        group.resume();
        tick(0.25);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);
    });

    it('can go into another group', () => {
        const { tween, tick } = scened();
        let ends = 0;

        const inner = tween.all(tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {} }));
        const outer = tween.all(inner, tween({ from: 0, to: 1, duration: 1, onUpdate: () => {} }));
        outer.onEnd(() => { ends += 1; });
        outer.play();

        tick(0.5);
        expect(ends).toBe(0);
        tick(0.5);
        expect(ends).toBe(1);
    });

    it('played again, plays all of them again', () => {
        const { tween, tick } = scened();
        const a = thing();
        const b = thing();
        const both = tween.all(
            tween({ target: a, to: { transform: { x: 10 } }, duration: 1 }),
            tween({ target: b, to: { transform: { x: 20 } }, duration: 2 }),
        );
        both.play();
        tick(2);
        both.play();
        expect([a.transform.x, b.transform.x]).toEqual([0, 0]);
        tick(1);
        expect([a.transform.x, b.transform.x]).toEqual([10, 10]);
    });
});

describe('what the review of declared tweens found', () => {
    it('finishes a chain asked from the onEnd of its own step, once', () => {
        const { tween, tick } = scened();
        const hero = thing();
        let ends = 0;
        const a = tween({ target: hero, to: { transform: { x: 10 } }, duration: 0.5 });
        const b = tween({ target: hero, to: { transform: { x: 20 } }, duration: 1 });
        const both = tween.chain(a, b);
        a.onEnd(() => { ends += 1; both.finish(); });
        both.play();
        tick(0.5);
        expect(ends).toBe(1);
        expect(hero.transform.x).toBe(20);
        expect(both.playing).toBe(false);
    });

    it('does not put back what an older play moved by an amount, on reset before this one moved it', () => {
        const { tween, tick } = scened();
        const hero = thing();
        const push = tween({ target: hero, by: { transform: { x: 10 } }, duration: 1, delay: 1 });
        push.play();
        push.finish();
        expect(hero.transform.x).toBe(10);
        push.play();
        tick(0.5);
        push.reset();
        expect(hero.transform.x).toBe(10);

        const walk = tween.chain(
            tween({ target: hero, by: { transform: { x: 10 } }, duration: 1 }),
            tween({ target: hero, by: { transform: { y: 10 } }, duration: 1 }),
        );
        walk.play();
        tick(1);
        tick(1);
        expect(hero.transform.y).toBe(10);
        walk.play();
        tick(0.5);
        walk.reset();
        // This play never reached the second step: the y it left stays.
        expect(hero.transform.y).toBe(10);
        expect(hero.transform.x).toBe(20);
    });
});

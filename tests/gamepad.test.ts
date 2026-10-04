import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { useGamepad } from '../src/hooks/input/use_gamepad';
import { createFrameContext, tick } from '../src/game/loop';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createFakePad, installFakePads } from './helpers/test_gamepad';
import type { TFakePad } from './helpers/test_gamepad';
import type { TGamepad, TGamepadInfo, TGamepadTarget } from '../src/input';

/**
 * Standard numbers, so the tests read as buttons and not as magic.
 */
const A = 0;
const START = 9;
const LT = 6;
const LEFT_X = 0;
const LEFT_Y = 1;

let pads: ReturnType<typeof installFakePads>;

beforeEach(() => { pads = installFakePads(); });
afterEach(() => { pads.restore(); });

/**
 * A game with one scene holding a pad handle, and the loop's sampling by hand.
 */
const withPad = (target: TGamepadTarget = 'first') => {
    const { store } = createTestGame();
    let pad!: TGamepad;
    startTestScene(store, 'Level', () => { pad = useGamepad(target); return createScene(); });
    const frame = (): void => { store.get('input').gamepads.beginFrame(); };
    return { store, pad, frame };
};

describe('useGamepad', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useGamepad()).toThrow('[NacatamalOn] useGamepad');
    });

    it('reports nothing at all with no pad connected', () => {
        const { pad, frame } = withPad();
        frame();

        expect(pad.connected).toBe(false);
        expect(pad.isDown('a')).toBe(false);
        expect(pad.leftStick()).toEqual({ x: 0, y: 0 });
        expect(pad.buttonCount).toBe(0);
    });

    it('tells held from just pressed, and just released, between two frames', () => {
        const { pad, frame } = withPad();
        const fake = createFakePad();
        pads.pads[0] = fake;
        // The frame it appears: whatever it arrived with is not a press anybody made.
        fake.press(A);
        frame();
        expect(pad.connected).toBe(true);
        expect(pad.isDown('a')).toBe(true);
        expect(pad.justPressed('a')).toBe(false);

        fake.release(A);
        frame();
        expect(pad.justReleased('a')).toBe(true);

        fake.press(A);
        frame();
        expect(pad.justPressed('a')).toBe(true);
        frame();
        // Held, but no longer new.
        expect(pad.isDown('a')).toBe(true);
        expect(pad.justPressed('a')).toBe(false);
    });

    it('lets go of everything when the pad is unplugged, once', () => {
        const { pad, frame } = withPad();
        const fake = createFakePad();
        pads.pads[0] = fake;
        frame();
        fake.press(START);
        frame();
        expect(pad.isDown('start')).toBe(true);

        pads.pads[0] = null;
        frame();

        expect(pad.connected).toBe(false);
        expect(pad.justReleased('start')).toBe(true);
        frame();
        expect(pad.justReleased('start')).toBe(false);
    });

    it('follows the first pad connected, whatever port it turns up in', () => {
        const { pad, frame } = withPad();
        const fake = createFakePad(2, { id: 'Pad in port two' });
        pads.pads[2] = fake;
        frame();

        expect(pad.index).toBe(2);
        expect(pad.id).toBe('Pad in port two');
    });

    it('stays on its port when one is named, even when it is empty', () => {
        const { pad, frame } = withPad(1);
        pads.pads[0] = createFakePad(0);
        frame();

        expect(pad.index).toBe(1);
        expect(pad.connected).toBe(false);
    });

    it('keeps the stick dead zone round, so a gentle diagonal stays a diagonal', () => {
        const { pad, frame } = withPad();
        const fake = createFakePad();
        pads.pads[0] = fake;
        // Just past the dead zone on both axes at once: per axis this would be zeroed twice.
        fake.push(LEFT_X, 0.22);
        fake.push(LEFT_Y, 0.22);
        frame();

        const stick = pad.leftStick();
        expect(stick.x).toBeGreaterThan(0);
        expect(stick.y).toBeGreaterThan(0);
        // Still a diagonal: both the same, not one of them swallowed.
        expect(stick.x).toBeCloseTo(stick.y, 6);

        // Read one axis at a time, the same push is inside the dead zone.
        expect(pad.axis('leftX')).toBeCloseTo(0.025, 3);
    });

    it('leaves the triggers alone, with no dead zone', () => {
        const { pad, frame } = withPad();
        const fake = createFakePad();
        pads.pads[0] = fake;
        fake.press(LT, 0.05);
        frame();

        expect(pad.value('lt')).toBeCloseTo(0.05, 6);
        expect(pad.isDown('lt')).toBe(true);
    });

    it('reads a pad with fewer buttons than a standard one without inventing any', () => {
        const { pad, frame } = withPad();
        pads.pads[0] = createFakePad(0, { buttons: 12, axes: 2, mapping: '' });
        frame();

        expect(pad.buttonCount).toBe(12);
        expect(pad.mapping).toBe('');
        expect(pad.isDown('guide')).toBe(false);
    });

    it('gives presses by raw number too, which is the only way to read an unrecognised pad', () => {
        const { pad, frame } = withPad();
        const fake = createFakePad(0, { mapping: '' });
        pads.pads[0] = fake;
        frame();
        fake.press(4);
        frame();

        expect(pad.rawButton(4)).toBe(true);
        expect(pad.rawJustPressed(4)).toBe(true);
        expect(pad.rawButton(99)).toBe(false);
    });

    it('says it cannot rumble when the browser offers nothing', async () => {
        const { pad, frame } = withPad();
        pads.pads[0] = createFakePad();
        frame();

        expect(pad.canRumble).toBe(false);
        expect(await pad.rumble()).toBe(false);
    });

    it('rumbles through the browser when there is a motor, and says what it answered', async () => {
        const { pad, frame } = withPad();
        const fake = createFakePad();
        const played: unknown[] = [];
        fake.vibrationActuator = {
            playEffect: async (...args: unknown[]) => { played.push(args); return 'complete'; },
        };
        pads.pads[0] = fake;
        frame();

        expect(await pad.rumble({ duration: 999999, strong: 2, weak: -1 })).toBe(true);
        expect(played).toEqual([['dual-rumble', { duration: 5000, startDelay: 0, strongMagnitude: 1, weakMagnitude: 0 }]]);
    });

    it('does not ask the browser anything when nobody asked for a pad', () => {
        const { store } = createTestGame();
        let asked = 0;
        const navigatorObject = globalThis.navigator as unknown as { getGamepads?: () => unknown };
        const real = navigatorObject.getGamepads;
        navigatorObject.getGamepads = () => { asked += 1; return pads.pads; };

        startTestScene(store, 'Level', () => createScene());
        store.get('input').gamepads.beginFrame();
        navigatorObject.getGamepads = real;

        expect(asked).toBe(0);
    });

    it('stops listening for pads arriving when the scene goes', () => {
        const { store } = createTestGame();
        const seen: TGamepadInfo[] = [];
        startTestScene(store, 'Level', () => {
            useGamepad().onConnect((info) => { seen.push(info); });
            return createScene();
        });

        const announce = (pad: TFakePad): void => {
            globalThis.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
        };
        announce(createFakePad(0, { id: 'first' }));
        expect(seen.length).toBe(1);

        stopScene(store, 'Level');
        announce(createFakePad(0, { id: 'second' }));

        expect(seen.length).toBe(1);
        expect(seen[0].id).toBe('first');
    });
});

describe('the loop and the pads', () => {
    it('asks the pads even while the game is paused', () => {
        const { store } = createTestGame();
        let pad!: TGamepad;
        startTestScene(store, 'Level', () => { pad = useGamepad(); return createScene(); });
        const fake = createFakePad();
        pads.pads[0] = fake;

        // The real loop, with the next frame it asks for going nowhere.
        const previousRaf = globalThis.requestAnimationFrame;
        globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
        const ctx = createFrameContext();
        tick(store, ctx, 0, 0);

        // Paused: the loop skips every update, and must not skip the pads, or the frame it resumes
        // would report everything the player did in the menu as just pressed.
        store.setState('loop', { pausedBy: ['menu'] });
        fake.press(A);
        tick(store, ctx, 16, 0);
        globalThis.requestAnimationFrame = previousRaf;

        expect(pad.isDown('a')).toBe(true);
        expect(pad.justPressed('a')).toBe(true);
    });
});

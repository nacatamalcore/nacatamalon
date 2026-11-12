import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createMode7 } from '../src/gameobjects/sprite/create_mode7';
import { mode7ToScreen, placeOnMode7, screenToMode7 } from '../src/gameobjects/sprite/mode7_points';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TMode7, TMode7Options } from '../src/gameobjects/sprite/create_mode7';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * A floor in perspective: what `createMode7` makes, and the CPU's half of its arithmetic, which has
 * to agree with the shader's for anything placed on the floor to stand where it was put.
 */

const floorWith = (options: TMode7Options = {}): TMode7 => {
    let floor!: TMode7;
    const { store } = createTestGame();
    startTestScene(store, 'Track', () => {
        floor = createMode7(options);
        return createScene();
    });
    return floor;
};

describe('createMode7', () => {
    it('is one sprite as large as the screen, from its top left, with the view as its own numbers', () => {
        const floor = floorWith({ x: 100, y: 200, angle: 0.5 });
        expect(floor.type).toBe('sprite');
        expect(floor.width).toBe(320);
        expect(floor.height).toBe(224);
        expect(floor.anchor).toEqual({ x: 0, y: 0 });
        expect(floor.material?.fragment).toContain('mu.horizon');
        expect(floor.uniforms).toMatchObject({ x: 100, y: 200, angle: 0.5, height: 32, horizon: 75, fov: 45, repeat: 1 });
        expect(floor.zIndex).toBe(-5000);
    });

    it('shows a colour past the edges when asked for one, and fades into its haze', () => {
        const floor = floorWith({ outside: '#ff0000', haze: { color: '#0000ff', from: 100, to: 400 } });
        expect(floor.uniforms.repeat).toBe(0);
        expect(floor.uniforms.outside).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        expect(floor.uniforms.hazeColor).toEqual({ r: 0, g: 0, b: 1, a: 1 });
        expect(floor.uniforms).toMatchObject({ hazeFrom: 100, hazeTo: 400 });
    });

    it('has no haze unless asked', () => {
        const floor = floorWith();
        expect(floor.uniforms.hazeTo).toBe(0);
        expect(floor.uniforms.hazeColor.a).toBe(0);
    });

    it('keeps the size it was made with, which the shader and the CPU both read', () => {
        const floor = floorWith();
        expect(floor.uniforms.size).toEqual({ x: 320, y: 224 });
        expect(floor.material?.fragment).toContain('mu.size');
        expect(floor.material?.fragment).not.toContain('mu.resolution');
    });

    it('owns its colours: changing one floor\'s changes no other, nor its material', () => {
        const first = floorWith();
        first.uniforms.hazeColor.a = 0.8;
        first.uniforms.size.x = 1;
        expect(first.uniforms.outside.a).toBe(0);
        const second = floorWith();
        expect(second.uniforms.hazeColor.a).toBe(0);
        expect(second.uniforms.outside.a).toBe(0);
        const own = first.material!.uniforms as Record<string, { a?: number; x?: number }>;
        expect(own.hazeColor!.a).toBe(0);
        expect(own.size!.x).toBe(320);
    });

    it('is as large as the view it is made in: half of a split screen', () => {
        let floor!: TMode7;
        const { store } = createTestGame();
        startTestScene(store, 'Track', () => {
            createSpriteTexture({ width: 159, height: 224, sees: 'world' }, () => {
                floor = createMode7({});
            });
            return createScene();
        });
        expect(floor.width).toBe(159);
        expect(floor.height).toBe(224);
    });

    it('is refused outside a scene', () => {
        expect(() => createMode7({})).toThrow(/createMode7/);
    });
});

describe('mode7ToScreen and screenToMode7', () => {
    it('take a point to the floor and back to the same point, whichever way the camera looks', () => {
        for (const angle of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
            const floor = floorWith({ x: 400, y: 300, angle, height: 24, horizon: 70, fov: 50 });
            for (const [ahead, side] of [[40, 0], [120, -30], [600, 200], [15, 5]] as const) {
                // A point `ahead` in front of the camera and `side` to its right.
                const x = 400 + Math.sin(angle) * ahead + Math.cos(angle) * side;
                const y = 300 - Math.cos(angle) * ahead + Math.sin(angle) * side;
                const at = mode7ToScreen(floor, x, y)!;
                expect(at.depth).toBeCloseTo(ahead, 6);
                const back = screenToMode7(floor, at.x, at.y);
                if (at.x < 0 || at.x > 320 || at.y > 224) {
                    // Off the floor: there is nothing there to click.
                    expect(back).toBeNull();
                    continue;
                }
                expect(back!.x).toBeCloseTo(x, 6);
                expect(back!.y).toBeCloseTo(y, 6);
            }
        }
    });

    it('sees straight ahead in the middle, nearer lower and larger, and far away just under the horizon', () => {
        const floor = floorWith({ x: 0, y: 0, height: 20, horizon: 60 });
        const near = mode7ToScreen(floor, 0, -50)!;
        const far = mode7ToScreen(floor, 0, -5000)!;
        expect(near.x).toBeCloseTo(160, 6);
        expect(near.y).toBeGreaterThan(far.y);
        expect(near.scale).toBeGreaterThan(far.scale);
        expect(far.y).toBeGreaterThan(60);
        expect(far.y).toBeLessThan(62);
    });

    it('turns with the camera: looking right, what is to the right of the map is straight ahead', () => {
        const floor = floorWith({ x: 0, y: 0, angle: Math.PI / 2 });
        expect(mode7ToScreen(floor, 100, 0)!.x).toBeCloseTo(160, 6);
        expect(mode7ToScreen(floor, 100, 50)!.x).toBeGreaterThan(160);
    });

    it('has nothing behind the camera, nor above the horizon or off the floor', () => {
        const floor = floorWith({ x: 0, y: 0, horizon: 60 });
        expect(mode7ToScreen(floor, 0, 10)).toBeNull();
        expect(mode7ToScreen(floor, 0, 0)).toBeNull();
        expect(screenToMode7(floor, 160, 30)).toBeNull();
        expect(screenToMode7(floor, 160, 60)).toBeNull();
        expect(screenToMode7(floor, -5, 200)).toBeNull();
        expect(screenToMode7(floor, 160, 300)).toBeNull();
    });

    it('agrees with the shader on a floor stretched since it was made: both measure its own pixels', () => {
        const floor = floorWith({ x: 0, y: 0, height: 20, horizon: 60 });
        const before = mode7ToScreen(floor, 40, -150)!;
        // Half as wide and twice as tall on the screen: the picture is stretched, and so is where
        // the point is seen, which is what the shader shows (it reads across the sprite, 0 to 1).
        floor.width = 160;
        floor.height = 448;
        const after = mode7ToScreen(floor, 40, -150)!;
        expect(after.x).toBeCloseTo(before.x / 2, 6);
        expect(after.y).toBeCloseTo(before.y * 2, 6);
        expect(after.scale).toBeCloseTo(before.scale / 2, 6);
        const back = screenToMode7(floor, after.x, after.y)!;
        expect(back.x).toBeCloseTo(40, 6);
        expect(back.y).toBeCloseTo(-150, 6);
    });

    it('measures from where the floor is: a floor moved is still read right', () => {
        const floor = floorWith({ x: 0, y: 0 });
        const before = mode7ToScreen(floor, 30, -100)!;
        floor.transform.x += 10;
        floor.transform.y += 5;
        const after = mode7ToScreen(floor, 30, -100)!;
        expect(after.x).toBeCloseTo(before.x + 10, 6);
        expect(after.y).toBeCloseTo(before.y + 5, 6);
        expect(screenToMode7(floor, after.x, after.y)!.x).toBeCloseTo(30, 6);
    });
});

describe('placeOnMode7', () => {
    const scene = () => {
        let floor!: TMode7;
        let near!: TSprite;
        let far!: TSprite;
        const { store } = createTestGame();
        startTestScene(store, 'Track', () => {
            floor = createMode7({ x: 0, y: 0 });
            near = createSprite({ width: 16, height: 32, anchor: { x: 0.5, y: 1 } });
            far = createSprite({ width: 16, height: 32, anchor: { x: 0.5, y: 1 } });
            return createScene();
        });
        return { floor, near, far };
    };

    it('stands a sprite where the floor shows the point, scaled by its distance, the nearer in front', () => {
        const { floor, near, far } = scene();
        expect(placeOnMode7(floor, near, 0, -60)).toBe(true);
        expect(placeOnMode7(floor, far, 0, -400)).toBe(true);
        const at = mode7ToScreen(floor, 0, -60)!;
        expect(near.transform).toMatchObject({ x: at.x, y: at.y, scaleX: at.scale, scaleY: at.scale });
        expect(near.visible).toBe(true);
        expect(near.zIndex!).toBeGreaterThan(far.zIndex!);
        expect(near.zIndex!).toBeLessThan(0);
        expect(far.zIndex!).toBeGreaterThan(-1);
        expect(far.zIndex!).toBeGreaterThan(floor.zIndex!);
    });

    it('hides what is behind the camera, and what is far off to the side', () => {
        const { floor, near, far } = scene();
        expect(placeOnMode7(floor, near, 0, 40)).toBe(false);
        expect(near.visible).toBe(false);
        expect(placeOnMode7(floor, far, 3000, -50)).toBe(false);
        expect(far.visible).toBe(false);
        // Back in front, it is shown again.
        expect(placeOnMode7(floor, near, 0, -60)).toBe(true);
        expect(near.visible).toBe(true);
    });
});

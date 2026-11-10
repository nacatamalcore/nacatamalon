import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useHitbox } from '../src/hooks/hitbox';
import { usePhysicsBody2d, usePhysicsBody3d, useRetroBody2d, useRetroWorld2d } from '../src/hooks/physics';
import { registerPhysicsProvider } from '../src/physics';
import { retroPhysics2dProvider, castRetroRay2d } from '../src/physics/retro2d/provider';
import { updateDebug, isDebugDrawable } from '../src/debug/draw_debug';
import { DEBUG_COLORS } from '../src/debug/t_debug_draw';
import { serializeScene } from '../src/scene/document';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TShapes, TShape } from '../src/gameobjects/shapes/types/t_shapes';
import type { TLines } from '../src/gameobjects/lines/types/t_lines';
import { placementOf } from '../src/box';
import type { TBox } from '../src/box';

/**
 * The debug mode: what a game is made of, drawn over it on request, and never written down.
 */

afterEach(() => registerPhysicsProvider(null));

const overlayOf = (root: TBox): TShapes | undefined =>
    root.drawables.find((drawable) => isDebugDrawable(drawable) && drawable.type === 'shapes') as TShapes | undefined;

const colorOf = (shape: TShape): unknown => (shape.stroke as { color: unknown } | undefined)?.color;

describe('the debug mode', () => {
    it('draws nothing until asked, then every kind of collider and hitbox, and hides when turned off', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useRetroWorld2d();
            useSpawn(function Crate() {
                createSprite({ width: 20, height: 20, transform: { x: 50, y: 50 } });
                useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
            })();
            useSpawn(function Wheel() {
                createSprite({ width: 10, height: 10, transform: { x: 100, y: 50 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'circle', radius: 5 } });
            })();
            useSpawn(function Coin() {
                createSprite({ width: 8, height: 8, transform: { x: 150, y: 50 } });
                useHitbox({ width: 6, height: 6 });
            })();
            useSpawn(function Cube() {
                useTransform({ x: 0, y: 0, z: 0 });
                usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });

        updateDebug(store);
        expect(overlayOf(root)).toBeUndefined();

        const game = createGameHandle(store);
        game.setDebugEnabled(true);
        expect(game.isDebugEnabled()).toBe(true);
        updateDebug(store);
        const overlay = overlayOf(root)!;
        expect(overlay.visible).toBe(true);
        const colors = overlay.shapes.map(colorOf);
        // The crate (retro, dynamic), the wheel (full, still) and its spoke, the coin's hitbox.
        expect(colors).toContain(DEBUG_COLORS.moving);
        expect(colors).toContain(DEBUG_COLORS.still);
        expect(colors).toContain(DEBUG_COLORS.hitbox);
        expect(overlay.shapes.find((shape) => shape.type === 'circle')).toMatchObject({ x: 100, y: 50, radius: 5 });
        // The cube's twelve edges, in space.
        const lines = root.drawables.find((drawable) => isDebugDrawable(drawable) && drawable.type === 'lines') as TLines;
        expect(lines.visible).toBe(true);

        game.setDebugEnabled(false);
        updateDebug(store);
        expect(overlay.visible).toBe(false);
        expect(lines.visible).toBe(false);
    });

    it('does not give an object that draws nothing else somewhere to be', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => createScene());
        store.setState('config', { debug: true });
        updateDebug(store);
        expect(overlayOf(root)).toBeDefined();
        expect(placementOf(root)).toBeNull();
    });

    it('is never written into the scene', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Coin() {
                createSprite({ width: 8, height: 8, transform: { x: 150, y: 50 } });
                useHitbox({ width: 6, height: 6 });
            })();
            return createScene();
        });
        const before = JSON.stringify(serializeScene(root));
        store.setState('config', { debug: true });
        updateDebug(store);
        expect(overlayOf(root)).toBeDefined();
        expect(JSON.stringify(serializeScene(root))).toBe(before);
    });

    it('shows the rays a retro world cast, and its edges for bodies that stop at them', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const { store } = createTestGame();
        let crate!: TBox;
        const root = startTestScene(store, 'Level', () => {
            useRetroWorld2d({ bounds: { x: 0, y: 0, width: 200, height: 100 } });
            crate = useSpawn(function Crate() {
                createSprite({ width: 20, height: 20, transform: { x: 50, y: 50 } });
                useRetroBody2d({ body: 'static', bounds: 'stop', collider: { shape: 'rect', width: 20, height: 20 } });
            })();
            return createScene();
        });
        castRetroRay2d(crate, { x: 0, y: 0 }, { x: 1, y: 0 }, { maxDistance: 30 });
        store.setState('config', { debug: true });
        updateDebug(store);
        const shapes = overlayOf(root)!.shapes;
        expect(shapes.some((shape) => colorOf(shape) === DEBUG_COLORS.ray && shape.type === 'line')).toBe(true);
        expect(shapes.find((shape) => colorOf(shape) === DEBUG_COLORS.bounds)).toMatchObject({ type: 'rect', x: 0, y: 0, width: 200, height: 100 });
        // Drawn once: the next frame shows the rays of that frame.
        updateDebug(store);
        expect(overlayOf(root)!.shapes.some((shape) => colorOf(shape) === DEBUG_COLORS.ray)).toBe(false);
    });
});

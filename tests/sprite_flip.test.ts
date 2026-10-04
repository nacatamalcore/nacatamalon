import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas';
import { spriteUvWindow } from '../src/render/shared';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawSprite, TFrameContext } from '../src/render/interface';
import type { TTexture } from '../src/loaders';

/**
 * A sprite as the renderer sees it, with only the fields the window is worked out from.
 */
const shown = (fields: Partial<TDrawSprite>): TDrawSprite => ({
    type: 'sprite',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    texture: null,
    tint: { r: 1, g: 1, b: 1, a: 1 },
    ...fields,
});

/**
 * A texture that has arrived, so a sprite can be sized by it.
 */
const ready = (): TTexture => ({ type: 'texture', key: 'sheet', src: 'sheet.png', width: 64, height: 32, status: 'ready', gpu: { resourceType: 'texture' } });

describe('mirroring a sprite', () => {
    it('reads the whole picture backwards', () => {
        expect(spriteUvWindow(shown({}))).toEqual({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
        // The window starts at the far edge and walks back to where it began.
        expect(spriteUvWindow(shown({ flipX: true }))).toEqual({ offsetX: 1, offsetY: 0, scaleX: -1, scaleY: 1 });
        expect(spriteUvWindow(shown({ flipY: true }))).toEqual({ offsetX: 0, offsetY: 1, scaleX: 1, scaleY: -1 });
        expect(spriteUvWindow(shown({ flipX: true, flipY: true }))).toEqual({ offsetX: 1, offsetY: 1, scaleX: -1, scaleY: -1 });
    });

    it('mirrors one frame of a sheet and nothing around it', () => {
        // The second of four frames across: from a quarter of the way in, a quarter wide.
        const frame = shown({ uvOffset: { x: 0.25, y: 0 }, uvScale: { x: 0.25, y: 1 }, flipX: true });

        // It reads from the frame's right edge back to its left, and never into its neighbours.
        expect(spriteUvWindow(frame)).toEqual({ offsetX: 0.5, offsetY: 0, scaleX: -0.25, scaleY: 1 });
    });

    it('does not move the sprite, which is what tells it from a negative scale', () => {
        const { store } = createTestGame();
        let mirrored!: ReturnType<typeof createSprite>;
        startTestScene(store, 'Level', () => {
            const atlas = createSpriteAtlas({ texture: ready(), columns: 4 });
            mirrored = createSprite({ atlas, frame: 1, width: 20, height: 20, flipX: true, anchor: { x: 0, y: 0 }, transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 } });
            return createScene();
        });

        // Its corner is where it was put, and it is still touched there: a character turning around
        // must not change what can be clicked.
        expect(mirrored.transform.x).toBe(100);
        expect(pickTargets(store, 105, 55)).toEqual([mirrored]);
        expect(pickTargets(store, 95, 55)).toEqual([]);
    });

    it('reaches the renderer as part of the sprite', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 8, height: 8, flipX: true, flipY: true });
            return createScene();
        });

        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const drawable = (ctx.passes[0].drawables ?? [])[0] as TDrawSprite;

        expect(drawable.flipX).toBe(true);
        expect(drawable.flipY).toBe(true);
    });
});

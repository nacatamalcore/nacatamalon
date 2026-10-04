import { describe, expect, it } from 'bun:test';
import { atlasFrame } from '../src/atlas/atlas_frame';
import { createSpriteAtlas } from '../src/atlas/create_sprite_atlas';
import { setSpriteFrame } from '../src/atlas/set_sprite_frame';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTexture } from '../src/loaders';

const sheet = (width = 288, height = 48): TTexture => ({
    key: 'walk', src: '/walk.png', status: 'ready', width, height,
    gpu: { resourceType: 'texture' },
} as unknown as TTexture);

describe('createSpriteAtlas', () => {
    it('counts its frames', () => {
        expect(createSpriteAtlas({ texture: sheet(), columns: 6 }).frames).toBe(6);
        expect(createSpriteAtlas({ texture: sheet(), columns: 4, rows: 3 }).frames).toBe(12);
    });

    it('refuses a grid that is not one', () => {
        expect(() => createSpriteAtlas({ texture: sheet(), columns: 0 })).toThrow(/whole columns and rows/);
        expect(() => createSpriteAtlas({ texture: sheet(), columns: 2.5 })).toThrow(/whole columns and rows/);
        expect(() => createSpriteAtlas({ texture: sheet(), columns: 4, rows: -1 })).toThrow(/whole columns and rows/);
    });

    it('needs nothing loaded: a frame is a fraction of the image', () => {
        const loading = { key: 'x', src: '/x.png', status: 'loading', gpu: null } as unknown as TTexture;
        const atlas = createSpriteAtlas({ texture: loading, columns: 4 });

        expect(atlasFrame(atlas, 2).uvOffset).toEqual({ x: 0.5, y: 0 });
    });
});

describe('atlasFrame', () => {
    it('walks left to right, then down', () => {
        const atlas = createSpriteAtlas({ texture: sheet(96, 96), columns: 2, rows: 2 });

        expect(atlasFrame(atlas, 0)).toEqual({ uvOffset: { x: 0, y: 0 }, uvScale: { x: 0.5, y: 0.5 } });
        expect(atlasFrame(atlas, 1).uvOffset).toEqual({ x: 0.5, y: 0 });
        expect(atlasFrame(atlas, 2).uvOffset).toEqual({ x: 0, y: 0.5 });
        expect(atlasFrame(atlas, 3).uvOffset).toEqual({ x: 0.5, y: 0.5 });
    });

    it('throws for a frame that is not there, rather than showing a neighbour', () => {
        const atlas = createSpriteAtlas({ texture: sheet(), columns: 6 });

        expect(() => atlasFrame(atlas, 6)).toThrow(/frames 0 to 5/);
        expect(() => atlasFrame(atlas, -1)).toThrow(/frames 0 to 5/);
        expect(() => atlasFrame(atlas, 1.5)).toThrow(/frames 0 to 5/);
    });
});

describe('createSprite with a sheet', () => {
    const spriteFrom = (options: Parameters<typeof createSprite>[0]) => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite(options);
            return createScene();
        });
        return sprite;
    };

    it('takes the image and the window from the sheet', () => {
        const texture = sheet();
        const atlas = createSpriteAtlas({ texture, columns: 6 });
        const sprite = spriteFrom({ atlas, frame: 3 });

        expect(sprite.texture).toBe(texture);
        expect(sprite.uvOffset).toEqual({ x: 0.5, y: 0 });
        expect(sprite.uvScale).toEqual({ x: 1 / 6, y: 1 });
    });

    it('shows the first frame when none is asked for', () => {
        const atlas = createSpriteAtlas({ texture: sheet(), columns: 6 });

        expect(spriteFrom({ atlas }).uvOffset).toEqual({ x: 0, y: 0 });
    });

    it('lets an explicit window win over the sheet', () => {
        const atlas = createSpriteAtlas({ texture: sheet(), columns: 6 });
        const sprite = spriteFrom({ atlas, frame: 3, uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } });

        expect(sprite.uvScale).toEqual({ x: 1, y: 1 });
    });

    it('shows nothing of a sheet frame that does not exist', () => {
        const atlas = createSpriteAtlas({ texture: sheet(), columns: 6 });

        expect(() => spriteFrom({ atlas, frame: 99 })).toThrow(/frames 0 to 5/);
    });
});

describe('setSpriteFrame', () => {
    const spriteOnSheet = () => {
        const { store } = createTestGame();
        const atlas = createSpriteAtlas({ texture: sheet(), columns: 6 });
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ atlas });
            return createScene();
        });
        return { sprite, atlas };
    };

    it('moves the window to another frame', () => {
        const { sprite } = spriteOnSheet();

        setSpriteFrame(sprite, 2);

        expect(sprite.uvOffset).toEqual({ x: 2 / 6, y: 0 });
    });

    it('follows the sprite to another sheet, image and all', () => {
        const { sprite } = spriteOnSheet();
        const other = sheet();
        other.key = 'attack';

        sprite.atlas = createSpriteAtlas({ texture: other, columns: 6 });
        setSpriteFrame(sprite, 1);

        expect(sprite.texture).toBe(other);
        expect(sprite.uvOffset).toEqual({ x: 1 / 6, y: 0 });
    });

    it('ignores a sprite that came from no sheet', () => {
        const { store } = createTestGame();
        let plain!: TSprite;
        startTestScene(store, 'Level', () => {
            plain = createSprite({ width: 8, height: 8 });
            return createScene();
        });

        expect(() => setSpriteFrame(plain, 3)).not.toThrow();
        expect(plain.uvOffset).toBeUndefined();
    });
});

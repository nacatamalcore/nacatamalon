import { describe, expect, it } from 'bun:test';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createScene } from '../src/scene/create_scene';
import { ownerOfDrawable } from '../src/box/drawable_owner';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTexture } from '../src/loaders';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

const readyTexture = (key: string): TTexture => ({
    key, src: `/${key}.png`, status: 'ready', width: 4, height: 4,
    gpu: { resourceType: 'texture' },
} as unknown as TTexture);

describe('createSprite', () => {
    it('lands in the scene, in the order it was written', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            createSprite({ width: 8, height: 8, tint, transform: at(0) });
            createSprite({ width: 8, height: 8, tint, transform: at(1) });
            return createScene();
        });

        expect(root.drawables).toHaveLength(2);
        expect(root.drawables.map((drawable) => (drawable as TSprite).transform.x)).toEqual([0, 1]);
    });

    it('is born alive, with an id and a type of its own', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, tint, transform: at(0) });
            return createScene();
        });

        expect(sprite.type).toBe('sprite');
        expect(sprite.id).toBeString();
        expect(sprite.destroyed).toBe(false);
    });

    it('remembers where it was placed, so it can be destroyed later', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, tint, transform: at(0) });
            return createScene();
        });

        expect(ownerOfDrawable(sprite)).toEqual({ box: root, store });
    });

    it('is white, at the origin and untextured when asked for nothing', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({});
            return createScene();
        });

        expect(sprite.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
        expect(sprite.texture).toBeNull();
        expect(sprite.tint).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(sprite.width).toBeUndefined();
        expect(sprite.height).toBeUndefined();
    });

    it('finds a texture by the key it was loaded under', () => {
        const { store } = createTestGame();
        const texture = readyTexture('hero');
        store.get('assets').textures.set('hero', texture);

        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ key: 'hero', transform: at(0) });
            return createScene();
        });

        expect(sprite.texture).toBe(texture);
    });

    it('prefers the texture it was handed over any key', () => {
        const { store } = createTestGame();
        const byKey = readyTexture('hero');
        const given = readyTexture('villain');
        store.get('assets').textures.set('hero', byKey);

        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ key: 'hero', texture: given, transform: at(0) });
            return createScene();
        });

        expect(sprite.texture).toBe(given);
    });

    it('throws on a key nobody loaded, rather than drawing a white square', () => {
        const { store } = createTestGame();

        expect(() => startTestScene(store, 'Level', () => {
            createSprite({ key: 'missing' });
            return createScene();
        })).toThrow(/no texture loaded under key 'missing'/);
    });

    it('throws outside a scene body, which is where creating one is not possible yet', () => {
        expect(() => createSprite({ width: 8, height: 8, tint, transform: at(0) })).toThrow();
    });
});

describe('a partial placement', () => {
    it('is enough: what is left out is no turn and a scale of 1', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, transform: { x: 30, y: 40 } });
            return createScene();
        });

        expect(sprite.transform).toEqual({ x: 30, y: 40, rotation: 0, scaleX: 1, scaleY: 1 });
    });

    it('is copied, so the object handed in stays the caller\'s', () => {
        const { store } = createTestGame();
        const mine = { x: 1, y: 2 };
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, transform: mine });
            return createScene();
        });
        sprite.transform.x = 99;

        expect(mine.x).toBe(1);
    });

    it('is the same for a text', async () => {
        const { createText } = await import('../src/gameobjects/text/create_text');
        const { store } = createTestGame();
        const font = { type: 'font', key: 'f', src: '/f.json', atlasSrc: '/f.png', status: 'loading', meta: null, texture: null } as never;
        let text!: { transform: unknown };
        startTestScene(store, 'Level', () => {
            text = createText({ text: 'HI', font, transform: { x: 5 } });
            return createScene();
        });

        expect(text.transform).toEqual({ x: 5, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    });
});

/**
 * The size a sprite was given is a number on what comes back, so it can be used in sums at once.
 * Checked by the type checker as much as by the test: `bun run typecheck` covers this file, and a
 * sprite whose `width` were still `number | undefined` would fail to compile here.
 */
describe('the size it was given', () => {
    it('comes back as numbers when both were given, ready for arithmetic', () => {
        const { store } = createTestGame();
        let right = 0;
        startTestScene(store, 'Level', () => {
            const paddle = createSprite({ width: 64, height: 10, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 100 } });
            // No `!` and no `?? 0`: given, so known.
            right = paddle.transform.x + paddle.width / 2 + paddle.height * 0;
            return createScene();
        });

        expect(right).toBe(132);
    });

    it('still refuses an option that is not one, the way a single signature did', () => {
        const typo = () => {
            // @ts-expect-error `widht` is not an option: the overloads keep the check on unknown keys.
            createSprite({ widht: 64, height: 10 });
        };
        expect(typeof typo).toBe('function');
    });
});

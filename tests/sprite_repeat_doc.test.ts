import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { parseSceneDoc, sceneFromDoc, serializeScene, SCENE_FORMAT } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TComponentDoc } from '../src/scene/document';

/** A scene of one box drawing the sprites given, as a tool writes one. */
const level = (...sprites: Record<string, unknown>[]) => parseSceneDoc({
    format: SCENE_FORMAT,
    version: 1,
    name: 'Level',
    assets: [],
    root: {
        id: 'root',
        name: 'Level',
        transform: null,
        components: [],
        children: [{
            id: 'wall',
            name: 'Wall',
            transform: { x: 0, y: 0 },
            components: sprites.map((sprite, at) => ({ type: 'sprite', id: `art-${at}`, texture: null, tint: { r: 1, g: 1, b: 1, a: 1 }, width: 64, height: 16, ...sprite })),
            children: [],
        }],
    },
}, 'scenes/level.scene.json');

const built = (doc: ReturnType<typeof level>) => {
    const { store } = createTestGame();
    const scene = startTestScene(store, 'Level', () => {
        sceneFromDoc(doc, 'scenes/level.scene.json')();
        return createScene();
    });
    const wall = scene.children.find((b) => b.name === 'Wall')!;
    return { scene, sprites: wall.drawables as TSprite[] };
};

describe('a sprite that repeats or sits at a distance, in a scene document', () => {
    it('reads repeat, repeatOffset and parallax and builds the sprite with them', () => {
        const doc = level({ repeat: true, repeatOffset: { x: 4, y: 0 }, parallax: { x: 0.3, y: 1 } });
        const component = doc.root.children[0]!.components[0] as Extract<TComponentDoc, { type: 'sprite' }>;
        expect(component.repeat).toBe(true);
        expect(component.repeatOffset).toEqual({ x: 4, y: 0 });
        expect(component.parallax).toEqual({ x: 0.3, y: 1 });

        const [sprite] = built(doc).sprites;
        expect(sprite!.repeat).toBe(true);
        expect(sprite!.repeatOffset).toEqual({ x: 4, y: 0 });
        expect(sprite!.parallax).toEqual({ x: 0.3, y: 1 });
    });

    it('writes them back, and only when they say something', () => {
        const { scene } = built(level(
            { repeat: true, repeatOffset: { x: 4, y: 2 }, parallax: { x: 0.5, y: 0 } },
            { repeat: true, repeatOffset: { x: 0, y: 0 }, parallax: { x: 1, y: 1 } },
            {},
        ));
        const [far, plain, stretched] = serializeScene(scene).root.children[0]!.components as Array<Record<string, unknown>>;
        expect(far).toMatchObject({ repeat: true, repeatOffset: { x: 4, y: 2 }, parallax: { x: 0.5, y: 0 } });
        expect(plain!.repeat).toBe(true);
        expect('repeatOffset' in plain!).toBe(false);
        expect('parallax' in plain!).toBe(false);
        expect('repeat' in stretched!).toBe(false);
        expect('parallax' in stretched!).toBe(false);
    });

    it('leaves out what is written wrong rather than refusing the scene', () => {
        const component = level({ repeat: 'yes', parallax: 3 }).root.children[0]!.components[0] as Record<string, unknown>;
        expect('repeat' in component).toBe(false);
        expect('parallax' in component).toBe(false);
    });
});

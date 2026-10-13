import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { boxFromDoc, parseSceneDoc, SCENE_FORMAT } from '../src/scene/document';
import { useSpawn } from '../src/hooks/spawn';
import { clearScripts, registerScript } from '../src/scripts';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

afterEach(() => clearScripts());

/** A reusable box's document, as the editor writes one: a coin with a shine in it, that behaves. */
const coin = () => parseSceneDoc({
    format: SCENE_FORMAT,
    version: 1,
    name: 'Coin',
    assets: [],
    root: {
        id: 'coin-root',
        name: 'Coin',
        transform: { x: 0, y: 0 },
        components: [],
        children: [{
            id: 'coin',
            name: 'Coin',
            transform: { x: 10, y: 20 },
            components: [
                { type: 'sprite', id: 'coin-art', texture: null, tint: { r: 1, g: 0.8, b: 0, a: 1 }, width: 8, height: 8 },
                { type: 'script', id: 'coin-spin', ref: 'test-shiny' },
            ],
            children: [{ id: 'shine', name: 'Shine', transform: { x: 2, y: -2 }, components: [], children: [] }],
        }],
    },
}, 'boxes/Coin.box');

describe('boxFromDoc', () => {
    it('makes the box of a document while the game runs, copy after copy, each its own', () => {
        const shone: string[] = [];
        registerScript('test-shiny', (self) => { shone.push(self.id); });
        const { store } = createTestGame();
        let spawn!: (doc: ReturnType<typeof coin>, place?: { x?: number; y?: number }) => TGameObject;
        const scene = startTestScene(store, 'Level', () => {
            spawn = useSpawn(boxFromDoc, { parent: 'scene' });
            return createScene();
        });

        // Later, as a game drops coins: one where the file says, one somewhere else.
        const first = spawn(coin());
        const second = spawn(coin(), { x: 50 });

        expect(scene.children.filter((b) => b.name === 'Coin')).toEqual([first, second]);
        expect(first.transform).toMatchObject({ x: 10, y: 20 });
        expect(second.transform).toMatchObject({ x: 50, y: 20 });
        expect(first.drawables.map((d) => d.type)).toEqual(['sprite']);
        expect(first.children.map((c) => c.name)).toEqual(['Shine']);
        // Ids of their own, never the document's, never each other's.
        const ids = [first.id, second.id, first.children[0]!.id, second.children[0]!.id];
        expect(new Set(ids).size).toBe(4);
        expect(ids).not.toContain('coin');
        expect(ids).not.toContain('shine');
        // Its behaviours run, on each copy.
        expect(shone).toEqual([first.id, second.id]);
        // Made by something already alive, so not part of the level when it is written down.
        expect(first.spawned).toBe(true);
    });

    it('says how it is meant to be used when called by itself', () => {
        expect(() => boxFromDoc(coin())).toThrow('useSpawn(boxFromDoc)(doc)');
    });
});

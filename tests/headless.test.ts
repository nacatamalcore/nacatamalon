import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { useKeyboard } from '../src/hooks/input/use_keyboard';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { useRandom } from '../src/hooks/random/use_random';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createPixels } from '../src/pixels';
import { encodePng } from '../src/pixels/encode_png';
import { registerPhysicsProvider } from '../src/physics';
import { rapier2dProvider } from '../src/physics/rapier2d/provider';
import { box3dProvider } from '../src/physics/box3d/provider';
import { createMesh } from '../src/gameobjects/mesh';
import { useCubeGeometry } from '../src/hooks/geometry';
import { usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useTransform } from '../src/hooks/transform/use_transform';
import type { THeadlessGame } from '../src/headless';
import type { TSceneFn } from '../src/scene';

/**
 * A game with no browser: run from a test, a frame at a time, the same every time.
 */

const games: THeadlessGame[] = [];
const folders: string[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

const make = (...args: Parameters<typeof createHeadlessGame>): THeadlessGame => {
    const game = createHeadlessGame(...args);
    games.push(game);
    return game;
};

/** A player that walks right while the arrow is held, at 60 pixels a second. */
function Player() {
    const keys = useKeyboard();
    const sprite = createSprite({ width: 16, height: 16, transform: { x: 40, y: 90 } });
    useUpdate((delta) => {
        if (keys.isDown('ArrowRight')) sprite.transform.x += 60 * delta;
    });
}

const Level: TSceneFn = () => {
    useSpawn(Player)();
    createText({ text: 'SCORE 0', transform: { x: 8, y: 8 } });
    return createScene();
};

describe('a game with no browser', () => {
    it('starts on its first scene, held still, with what it made there to look at', () => {
        const game = make({ width: 320, height: 180, scenes: { Level } });

        expect(game.scenes).toEqual(['Level']);
        expect(game.frame).toBe(0);
        expect(game.find('Player')).toBeDefined();
        expect(game.find('Nobody')).toBeUndefined();
    });

    it('moves only when asked, a step of the game per frame', () => {
        const game = make({ width: 320, height: 180, scenes: { Level } });
        const sprite = () => game.find('Player')!.drawables[0] as { transform: { x: number } };

        game.run(30);
        expect(sprite().transform.x).toBe(40);

        game.press('ArrowRight');
        game.run(60);
        game.release('ArrowRight');
        game.run(10);

        expect(sprite().transform.x).toBeCloseTo(100, 5);
        expect(game.frame).toBe(100);
        expect(game.time).toBeCloseTo(100 / 60, 9);
    });

    it('is the same every time: the same keys, the same frames, the same random numbers', () => {
        const rolls = (): number[] => {
            const seen: number[] = [];
            const Dice: TSceneFn = () => {
                const random = useRandom();
                useUpdate(() => { seen.push(random.rand()); });
                return createScene();
            };
            const game = make({ width: 64, height: 64, scenes: { Dice } });
            game.run(20);
            game.destroy();
            return seen;
        };

        expect(rolls()).toEqual(rolls());
    });

    it('says what is on the screen and where, a text with what it says, as soon as it has loaded', async () => {
        const game = make({ width: 320, height: 180, scenes: { Level } });
        await game.loaded();

        const score = game.drawn().find((picture) => picture.text === 'SCORE 0');
        expect(score).toMatchObject({ kind: 'text', left: 8, top: 8, seen: 1 });
        expect(score!.width).toBeGreaterThan(0);
        expect(game.drawn().some((picture) => picture.kind === 'sprite' && picture.name === 'Player')).toBe(true);
    });

    it('reads what the game loads from its assets folder', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-headless-'));
        folders.push(folder);
        mkdirSync(join(folder, 'assets'));
        writeFileSync(join(folder, 'assets', 'hero.png'), encodePng(createPixels(24, 32)));
        const Room: TSceneFn = () => {
            useLoadTexture({ src: '/assets/hero.png', key: 'hero' });
            createSprite({ key: 'hero', transform: { x: 100, y: 50 } });
            return createScene();
        };
        const game = make({ width: 320, height: 180, scenes: { Room }, assets: folder });
        await game.loaded();
        game.run(1);

        const hero = game.drawn().find((picture) => picture.kind === 'sprite');
        expect(hero).toMatchObject({ width: 24, height: 32 });
    });

    it('throws what a scene threw, in the run that made it throw', () => {
        const Broken: TSceneFn = () => {
            let frames = 0;
            useUpdate(() => {
                frames += 1;
                if (frames === 3) throw new Error('the floor gave way');
            });
            return createScene();
        };
        const game = make({ width: 64, height: 64, scenes: { Broken } });
        const said = spyOn(console, 'error').mockImplementation(() => {});

        game.run(2);
        expect(() => game.run(5)).toThrow('the floor gave way');
        said.mockRestore();
    });

    it('gives the browser back its own when the last game goes', () => {
        const before = globalThis.fetch;
        const game = createHeadlessGame({ width: 64, height: 64, scenes: { Level } });
        expect(globalThis.fetch).not.toBe(before);
        game.destroy();

        expect(globalThis.fetch).toBe(before);
        expect(() => game.run()).toThrow('after destroy()');
    });
});

describe('physics with no browser', () => {
    afterEach(() => registerPhysicsProvider(null));

    it('waits in loaded() for the 2D world, then a crate falls onto the ground and stays', async () => {
        registerPhysicsProvider(rapier2dProvider);
        function Crate() {
            createSprite({ width: 20, height: 20, transform: { x: 100, y: 20 } });
            usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
        }
        function Ground() {
            createSprite({ width: 300, height: 20, transform: { x: 160, y: 170 } });
            usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 300, height: 20 } });
        }
        const Flat: TSceneFn = () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            useSpawn(Ground)();
            useSpawn(Crate)();
            return createScene();
        };
        const game = make({ width: 320, height: 180, scenes: { Flat } });
        await game.loaded();
        const y = () => (game.find('Crate')!.drawables[0] as { transform: { y: number } }).transform.y;

        game.run(1);
        expect(y()).toBeGreaterThan(20);
        game.run(179);
        // On the ground: its top is at 160, and the crate is 20 tall.
        expect(y()).toBeCloseTo(150, 0);
        const resting = y();
        game.run(60);
        expect(y()).toBe(resting);
    });

    it('waits in loaded() for the 3D world, then a box falls onto the floor', async () => {
        registerPhysicsProvider(box3dProvider);
        function Box() {
            useTransform({ y: 5 });
            createMesh({ geometry: useCubeGeometry() });
            usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
        }
        function Floor() {
            useTransform({ y: -0.5, scaleX: 20, scaleZ: 20 });
            createMesh({ geometry: useCubeGeometry() });
            usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 1, 1] } });
        }
        const Solid: TSceneFn = () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(Box)();
            return createScene();
        };
        const game = make({ width: 320, height: 180, scenes: { Solid } });
        await game.loaded();

        game.run(1);
        expect(game.find('Box')!.transform!.y).toBeLessThan(5);
        game.run(179);
        expect(game.find('Box')!.transform!.y).toBeCloseTo(0.5, 1);
    });
});


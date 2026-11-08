import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createShapes } from '../src/gameobjects/shapes';
import { createTilemap } from '../src/gameobjects/tilemap';
import { createMesh } from '../src/gameobjects/mesh';
import { createParticles } from '../src/gameobjects/particles/create_particles';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { useMask } from '../src/hooks/mask';
import { useSelf } from '../src/hooks';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useLight2d, useAmbientLight2d } from '../src/hooks/light';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useUpdate } from '../src/hooks/loop/use_update';
import { pixelsFromRows } from '../src/pixels';
import { encodePng } from '../src/pixels/encode_png';
import { getColor } from '../src/color';
import type { THeadlessGame } from '../src/headless';
import type { TPixels } from '../src/pixels';
import type { TSceneFn } from '../src/scene';

/**
 * A picture of a game run with no browser, drawn without a graphics card, the way the card draws it.
 */

const games: THeadlessGame[] = [];
const folders: string[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

const BACKGROUND = { r: 0, g: 0, b: 0, a: 1 };

const make = (scene: TSceneFn, width = 32, height = 24): THeadlessGame => {
    const game = createHeadlessGame({ width, height, background: BACKGROUND, scenes: { Scene: scene } });
    games.push(game);
    return game;
};

const at = (pixels: TPixels, x: number, y: number): number[] => {
    const i = (y * pixels.width + x) * 4;
    return Array.from(pixels.data.subarray(i, i + 4));
};

/** Which pixels of a row are not the background. */
const rowOf = (pixels: TPixels, y: number): string =>
    Array.from({ length: pixels.width }, (_, x) => (at(pixels, x, y).slice(0, 3).some((v) => v > 0) ? '#' : '.')).join('');

const RED = [255, 0, 0, 255];
const PALETTE = { r: '#ff0000', g: '#00ff00', b: '#0000ff' };

describe('capture', () => {
    it('draws a sprite where it is, pixel for pixel, over the background', () => {
        const game = make(() => {
            createSprite({ texture: createPixelTexture(pixelsFromRows(['rg', 'br'], PALETTE)), anchor: { x: 0, y: 0 }, transform: { x: 3, y: 2 } });
            return createScene();
        });
        const shot = game.capture();

        expect([shot.width, shot.height]).toEqual([32, 24]);
        expect(at(shot, 3, 2)).toEqual(RED);
        expect(at(shot, 4, 2)).toEqual([0, 255, 0, 255]);
        expect(at(shot, 3, 3)).toEqual([0, 0, 255, 255]);
        expect(at(shot, 2, 2)).toEqual([0, 0, 0, 255]);
        expect(at(shot, 5, 2)).toEqual([0, 0, 0, 255]);
    });

    it('gives an odd picture by its middle as many pixels as it has, as the card does with an edge on half a pixel', () => {
        const game = make(() => {
            createSprite({ texture: createPixelTexture(pixelsFromRows(['rrr'], PALETTE)), transform: { x: 10, y: 5 } });
            return createScene();
        });

        // 8.5 to 11.5 across: the pixel whose middle is on the left edge is in, the right one is out.
        expect(rowOf(game.capture(), 4)).toBe('........###.....................');
    });

    it('draws what a scene loads from a PNG', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-capture-'));
        folders.push(folder);
        mkdirSync(join(folder, 'assets'));
        writeFileSync(join(folder, 'assets', 'dot.png'), encodePng(pixelsFromRows(['r'], PALETTE)));
        const game = createHeadlessGame({
            width: 8, height: 8, background: BACKGROUND, assets: folder,
            scenes: {
                Room: () => {
                    useLoadTexture({ src: '/assets/dot.png', key: 'dot' });
                    createSprite({ key: 'dot', anchor: { x: 0, y: 0 }, transform: { x: 4, y: 4 } });
                    return createScene();
                },
            },
        });
        games.push(game);
        await game.loaded();

        expect(at(game.capture(), 4, 4)).toEqual(RED);
    });

    it('draws a map from a file with no frame run after it arrived', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-capture-'));
        folders.push(folder);
        mkdirSync(join(folder, 'maps'));
        writeFileSync(join(folder, 'maps', 'tiles.png'), encodePng(pixelsFromRows(['r'], PALETTE)));
        writeFileSync(join(folder, 'maps', 'tiles.atlas'), JSON.stringify({ format: 1, kind: 'atlas', texture: 'tiles.png', grid: { frameWidth: 1, frameHeight: 1 } }));
        writeFileSync(join(folder, 'maps', 'level.tilemap'), JSON.stringify({ format: 1, kind: 'tilemap', atlas: 'tiles.atlas', cell: 1, width: 1, height: 1, tiles: { 1: { frame: 0 } }, layers: [{ name: 'ground', order: 'under', data: [1] }] }));
        const game = createHeadlessGame({
            width: 4, height: 4, background: BACKGROUND, assets: folder,
            scenes: {
                Room: () => {
                    createTilemap({ src: '/maps/level.tilemap' });
                    return createScene();
                },
            },
        });
        games.push(game);
        await game.loaded();

        expect(at(game.capture(), 0, 0)).toEqual(RED);
    });

    it('lays a see-through colour over what is under it as the card blends', () => {
        const game = make(() => {
            createSprite({ width: 4, height: 4, tint: { r: 1, g: 0, b: 0, a: 1 }, anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            createSprite({ width: 4, height: 4, tint: { r: 0, g: 0, b: 1, a: 0.5 }, anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            createSprite({ width: 4, height: 4, tint: { r: 0, g: 1, b: 0, a: 0.5 }, blend: 'additive', anchor: { x: 0, y: 0 }, transform: { x: 8, y: 0 } });
            return createScene();
        });
        const shot = game.capture();

        expect(at(shot, 1, 1)).toEqual([128, 0, 128, 255]);
        expect(at(shot, 9, 1)).toEqual([0, 128, 0, 255]);
    });

    it('draws the world through its camera, zoomed', () => {
        const game = make(() => {
            const camera = useCamera2d();
            camera.zoom = 2;
            createSprite({ width: 2, height: 2, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 1, y: 1 } });
            return createScene();
        });

        expect(rowOf(game.capture(), 3)).toBe('..####..........................');
    });

    it('draws what has moved since, without running the frame again', () => {
        let sprite!: { transform: { x: number } };
        const game = make(() => {
            sprite = createSprite({ width: 1, height: 1, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            useUpdate(() => { sprite.transform.x += 1; });
            return createScene();
        });
        game.run(5);

        expect(rowOf(game.capture(), 0)).toBe('.....#..........................');
        expect(game.frame).toBe(5);
    });

    it('draws a see-through line of shapes once where its sides meet', () => {
        const game = make(() => {
            useSpawn(() => {
                useTransform({ x: 0, y: 0 });
                createShapes({ shapes: [{ type: 'line', points: [{ x: 2, y: 4 }, { x: 16, y: 4 }, { x: 16, y: 18 }], stroke: { width: 4, color: { r: 1, g: 1, b: 1, a: 0.5 }, join: 'round' } }] });
            })();
            return createScene();
        });
        const shot = game.capture();
        const seen = new Set<number>();
        for (let i = 0; i < shot.width * shot.height; i++) {
            if (shot.data[i * 4]! > 0) seen.add(shot.data[i * 4]!);
        }

        // One shade wherever the line is, the corner included: drawn twice it would be lighter there.
        expect([...seen]).toEqual([128]);
    });

    it('keeps a masked object inside its rectangle', () => {
        const game = make(() => {
            useSpawn(() => {
                createSprite({ width: 20, height: 4, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
                useMask({ rect: { x: 4, y: 0, width: 6, height: 4 } }).add(useSelf());
            })();
            return createScene();
        });

        expect(rowOf(game.capture(), 1)).toBe('....######......................');
    });

    it('draws text and particles, once what they need has arrived', async () => {
        const game = make(() => {
            createText({ text: 'HI', transform: { x: 4, y: 4 } });
            createParticles({ seed: 1, effect: { kind: 'particles-2d', emission: { rate: 0, burst: 20, duration: 0, loop: false }, life: [5, 5], size: [2, 2], speed: [0, 0] }, transform: { x: 24, y: 16 } } as never);
            return createScene();
        });
        await game.loaded();
        game.run(1);
        const shot = game.capture();

        const words = game.capture({ region: { x: 0, y: 0, width: 16, height: 12 } });
        const lit = Array.from({ length: words.height }, (_, y) => rowOf(words, y)).join('').split('#').length - 1;
        expect(lit).toBeGreaterThan(10);
        expect(at(shot, 24, 16).slice(0, 3)).not.toEqual([0, 0, 0]);
    });

    it('grows every pixel into a square with scale, and keeps a region of the screen', () => {
        const game = make(() => {
            createSprite({ width: 1, height: 1, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 5, y: 5 } });
            return createScene();
        });
        const shot = game.capture({ region: { x: 4, y: 4, width: 3, height: 2 }, scale: 3 });

        expect([shot.width, shot.height]).toEqual([9, 6]);
        expect(rowOf(shot, 3)).toBe('...###...');
        expect(rowOf(shot, 0)).toBe('.........');
    });

    it('says once what it could not draw, and draws the rest', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const game = make(() => {
                createMesh({ geometry: useCubeGeometry() });
                createSprite({ width: 1, height: 1, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
                return createScene();
            });
            const shot = game.capture();
            game.capture();

            expect(at(shot, 0, 0)).toEqual(RED);
            const said = warn.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('capture'));
            expect(said).toHaveLength(1);
            expect(said[0]).toContain('3D');
        } finally {
            warn.mockRestore();
        }
    });

    it('says that it paints a world with 2D lights in its own colours', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const game = make(() => {
                useAmbientLight2d({ intensity: 0.1 });
                useLight2d({ radius: 2 });
                createSprite({ width: 1, height: 1, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
                return createScene();
            });
            const shot = game.capture();

            expect(at(shot, 0, 0)).toEqual(RED);
            const said = warn.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('capture'));
            expect(said).toHaveLength(1);
            expect(said[0]).toContain('2D lights');
        } finally {
            warn.mockRestore();
        }
    });

    it('leaves what is under a colour that is no number as it was, rather than cutting a hole', () => {
        const game = make(() => {
            createSprite({ width: 2, height: 2, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            createSprite({ width: 2, height: 2, tint: { r: Number.NaN, g: 0, b: 0, a: Number.NaN }, anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            return createScene();
        });

        expect(at(game.capture(), 0, 0)).toEqual(RED);
    });

    it('takes no options, or null, as the whole screen at its size', () => {
        const game = make(() => createScene());

        expect([game.capture().width, game.capture(null as never).height]).toEqual([32, 24]);
    });

    it('refuses a scale that is not a whole number and a region off the screen', () => {
        const game = make(() => createScene());

        expect(() => game.capture({ scale: {} as never })).toThrow('scale is an object');

        expect(() => game.capture({ scale: 1.5 })).toThrow('scale is 1.5');
        expect(() => game.capture({ region: { x: 40, y: 0, width: 4, height: 4 } })).toThrow('has nothing of the 32 by 24 screen in it');
    });
});

describe('the renderer a game run with no browser draws with', () => {
    it('refuses a picture made in code with the wrong number of bytes, as the cards do', async () => {
        const { createCpuRenderer } = await import('../src/headless/software/cpu_renderer');
        const renderer = createCpuRenderer({ background: BACKGROUND, smooth: false });

        expect(() => renderer.createDataTexture(new Uint8Array(3), 1, 1)).toThrow('1 by 1 needs 4 bytes and 3 were given');
    });
});

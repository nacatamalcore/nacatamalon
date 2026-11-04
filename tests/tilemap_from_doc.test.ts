import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createSpriteAtlas } from '../src/atlas';
import { createTilemap, getTilemap, setTile, solidAt, tileAt, tileInfoAt } from '../src/gameobjects/tilemap';
import { sceneTilemaps } from '../src/gameobjects/tilemap/scene_tilemaps';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { getColor } from '../src/color';
import { createHeadlessGame } from '../src/headless';
import { pixelsFromRows, sheetFromRows } from '../src/pixels';
import { useCameraFollow } from '../src/hooks/camera/use_camera_follow';
import { useLoadAtlas } from '../src/hooks/loaders/use_load_atlas';
import { useLoadPixels } from '../src/hooks/loaders/use_load_pixels';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { useSelf } from '../src/hooks';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTileBody2d } from '../src/physics/character/use_tile_body_2d';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useUpdate } from '../src/hooks/loop/use_update';
import { destroy } from '../src/destroy';
import { encodePng } from '../src/pixels/encode_png';
import { serializeScene } from '../src/scene/document';
import { whenLoaded } from '../src/loaders';
import { sheetUsersOf } from '../src/loaders/sheet_users';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { stopScene } from '../src/scene/stop_scene';
import { layerStateOf } from '../src/gameobjects/tilemap/layer_state';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { THeadlessGame } from '../src/headless';
import type { TTilemap, TTilemapCodeDoc } from '../src/gameobjects/tilemap';
import type { TSceneFn } from '../src/scene';
import type { TPixels } from '../src/pixels';

/**
 * A level generated in code has no file, and should not have to give up what a file's map gets.
 */

const games: THeadlessGame[] = [];
const folders: string[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

const PALETTE = { r: '#ff0000', g: '#00ff00', b: '#0000ff' };

const TILES = (): ReturnType<typeof sheetFromRows> => sheetFromRows({ red: ['rr', 'rr'], green: ['gg', 'gg'], blue: ['bb', 'bb'] }, PALETTE);

const sheet = () => {
    const tiles = TILES();
    return createSpriteAtlas({ texture: createPixelTexture(tiles.pixels), columns: tiles.columns });
};

const DOC: TTilemapCodeDoc = {
    cell: 2,
    width: 3,
    height: 2,
    tiles: { 1: { frame: 0, solid: true }, 2: { frame: 1, oneWay: true }, 3: { frame: 2 } },
    layers: [{ name: 'ground', order: 'under', data: [0, 2, 0, 1, 1, 3] }],
};

const headless = (scene: TSceneFn, width = 8, height = 4): THeadlessGame => {
    const game = createHeadlessGame({ width, height, background: { r: 0, g: 0, b: 0, a: 1 }, scenes: { Level: scene } });
    games.push(game);
    return game;
};

const at = (pixels: TPixels, x: number, y: number): number[] => Array.from(pixels.data.subarray((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 3));

describe('createTilemap from a document in code', () => {
    it('is ready at once, and answers questions in the body of the scene', () => {
        let asked: { status: string; solid: boolean; oneWay?: boolean; layers: number } | null = null;
        headless(() => {
            const map = createTilemap({ doc: DOC, atlas: sheet() });
            asked = { status: map.status, solid: solidAt(map, 0, 1), oneWay: tileInfoAt(map, 0, 1, 0)?.oneWay, layers: map.layers.length };
            return createScene();
        });

        expect(asked!).toEqual({ status: 'ready', solid: true, oneWay: true, layers: 1 });
    });

    it('is drawn, each cell with its tile, and where it was placed', () => {
        const game = headless(() => {
            createTilemap({ doc: DOC, atlas: sheet(), transform: { x: 2 } });
            return createScene();
        });
        const shot = game.capture();

        expect(at(shot, 2, 2)).toEqual([255, 0, 0]);
        expect(at(shot, 5, 3)).toEqual([255, 0, 0]);
        expect(at(shot, 4, 0)).toEqual([0, 255, 0]);
        expect(at(shot, 6, 2)).toEqual([0, 0, 255]);
        expect(at(shot, 2, 0)).toEqual([0, 0, 0]);
    });

    it('is drawn in the order it was asked for, as a sprite is', () => {
        const doc: TTilemapCodeDoc = { cell: 2, width: 1, height: 1, tiles: { 1: { frame: 0 } }, layers: [{ name: 'only', order: 0, data: [1] }] };
        const game = headless(() => {
            createTilemap({ doc, atlas: sheet() });
            createSprite({ width: 2, height: 2, tint: getColor('#00ff00'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            return createScene();
        });
        // With a frame run, or a map left for later would pass for one drawn under the sprite.
        game.run(1);

        expect(at(game.capture(), 0, 0)).toEqual([0, 255, 0]);
    });

    it('takes the sheet sheetFromRows gives, with the numbers it gives', () => {
        const game = headless(() => {
            const tiles = TILES();
            createTilemap({
                doc: { cell: 2, width: 1, height: 1, tiles: { 1: { frame: tiles.frames.blue! } }, layers: [{ name: 'only', order: 0, data: [1] }] },
                atlas: createSpriteAtlas({ texture: createPixelTexture(tiles.pixels), columns: tiles.columns }),
            });
            return createScene();
        });

        expect(at(game.capture(), 0, 0)).toEqual([0, 0, 255]);
    });

    it('is walked on, as a file\'s map is: a body falls and lands on its floor', () => {
        const floor: TTilemapCodeDoc = {
            cell: 8, width: 4, height: 4,
            tiles: { 1: { frame: 0, solid: true } },
            layers: [{ name: 'ground', order: 'under', data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1] }],
        };
        let onGround = false;
        let y = 0;
        const game = headless(() => {
            createTilemap({ doc: floor, atlas: sheet() });
            useSpawn(() => {
                const transform = useTransform({ x: 16, y: 4 });
                const body = useTileBody2d({ width: 4, height: 4, gravity: 400 });
                useUpdate(() => {
                    onGround = body.onGround;
                    y = transform.y;
                });
            })();
            return createScene();
        }, 32, 32);
        game.run(120);

        expect(onGround).toBe(true);
        expect(y).toBeGreaterThan(20);
        expect(y).toBeLessThanOrEqual(24);
    });

    it('takes setTile, and draws what it changes', () => {
        let map!: TTilemap;
        const game = headless(() => {
            map = createTilemap({ doc: DOC, atlas: sheet() });
            return createScene();
        });
        game.run(1);
        expect(setTile(map, 0, 0, 1, 3)).toBe(true);
        game.run(1);

        expect(tileAt(map, 0, 0, 1)).toBe(3);
        expect(solidAt(map, 0, 1)).toBe(false);
        expect(at(game.capture(), 0, 2)).toEqual([0, 0, 255]);
    });

    it('does not hold on to the document it was given', () => {
        const data = [1];
        const tiles = { 1: { frame: 0 } };
        let map!: TTilemap;
        headless(() => {
            map = createTilemap({ doc: { cell: 2, width: 1, height: 1, tiles, layers: [{ name: 'only', order: 0, data }] }, atlas: sheet() });
            return createScene();
        });
        data[0] = 0;
        tiles[1].frame = 2;

        expect(tileAt(map, 0, 0, 0)).toBe(1);
        expect(map.tiles[1]!.frame).toBe(0);
    });

    it('makes a map of its own at each call', () => {
        let first!: TTilemap;
        let second!: TTilemap;
        headless(() => {
            first = createTilemap({ doc: DOC, atlas: sheet() });
            second = createTilemap({ doc: DOC, atlas: sheet() });
            return createScene();
        });

        expect(first).not.toBe(second);
        expect(first.layers[0]!.data).not.toBe(second.layers[0]!.data);
    });

    it('is the map its object carries', () => {
        let found: TTilemap | null = null;
        let map!: TTilemap;
        headless(() => {
            useSpawn(() => {
                map = createTilemap({ doc: DOC, atlas: sheet() });
                found = getTilemap(useSelf());
            })();
            return createScene();
        });

        expect(found!).toBe(map);
    });

    it('keeps a camera following something inside it', () => {
        const wide: TTilemapCodeDoc = { cell: 2, width: 20, height: 20, tiles: { 1: { frame: 0 } }, layers: [{ name: 'only', order: 0, data: new Array<number>(400).fill(1) }] };
        let follow!: ReturnType<typeof useCameraFollow>;
        const game = headless(() => {
            const map = createTilemap({ doc: wide, atlas: sheet() });
            const hero = useSpawn(function Hero() { useTransform({ x: 1000, y: 1000 }); })();
            follow = useCameraFollow(hero, { bounds: map });
            return createScene();
        });
        game.run(1);

        expect([follow.camera.transform.x, follow.camera.transform.y]).toEqual([40 - 8, 40 - 4]);
    });

    it('cycles a tile with the runs it was given, as a sheet from a file does', () => {
        const game = headless(() => {
            createTilemap({
                doc: { cell: 2, width: 1, height: 1, tiles: { 1: { anim: 'flicker' } }, layers: [{ name: 'only', order: 0, data: [1] }] },
                atlas: sheet(),
                sequences: { flicker: { frames: [0, 1], fps: 60 } },
            });
            return createScene();
        });

        game.run(1);
        const one = at(game.capture(), 0, 0);
        game.run(1);
        const other = at(game.capture(), 0, 0);

        expect(new Set([one.join(), other.join()])).toEqual(new Set(['255,0,0', '0,255,0']));
    });

    it('moves a run at its pace however many tiles cycle it', () => {
        let map!: TTilemap;
        const game = headless(() => {
            map = createTilemap({
                doc: { cell: 2, width: 2, height: 1, tiles: { 1: { anim: 'flicker' }, 2: { anim: 'flicker', flipX: true } }, layers: [{ name: 'only', order: 0, data: [1, 2] }] },
                atlas: sheet(),
                sequences: { flicker: { frames: [0, 1, 2], fps: 2 } },
            });
            return createScene();
        });
        game.run(31);

        // Half a second at two pictures a second: one picture on, not two.
        expect(map.clocks.get('flicker')?.frame).toBe(1);
    });

    it('takes a very high pace at the cost of any other, on a frame it can still show', () => {
        const game = headless(() => {
            createTilemap({
                doc: { cell: 2, width: 1, height: 1, tiles: { 1: { anim: 'flicker' } }, layers: [{ name: 'only', order: 0, data: [1] }] },
                atlas: sheet(),
                sequences: { flicker: { frames: [0, 1], fps: 1e20 } },
            });
            return createScene();
        });
        game.run(3);

        expect([[255, 0, 0], [0, 255, 0]]).toContainEqual(at(game.capture(), 0, 0));
    });

    it('waits for a picture on its way, and is counted while it does', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-map-'));
        folders.push(folder);
        mkdirSync(join(folder, 'assets'));
        writeFileSync(join(folder, 'assets', 'tiles.png'), encodePng(TILES().pixels));
        let map!: TTilemap;
        let first = '';
        const game = createHeadlessGame({
            width: 8, height: 4, background: { r: 0, g: 0, b: 0, a: 1 }, assets: folder,
            scenes: {
                Level: () => {
                    const texture = useLoadTexture({ src: '/assets/tiles.png', key: 'tiles' });
                    map = createTilemap({ doc: DOC, atlas: createSpriteAtlas({ texture, columns: 3 }) });
                    first = map.status;
                    return createScene();
                },
            },
        });
        games.push(game);
        await game.loaded();

        // With no frame in between: a picture asked for now has the map in it.
        expect(first).toBe('loading');
        expect(map.status).toBe('ready');
        expect(at(game.capture(), 0, 2)).toEqual([255, 0, 0]);
    });

    it('waits for a picture painted from a file on its way', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-map-'));
        folders.push(folder);
        mkdirSync(join(folder, 'assets'));
        writeFileSync(join(folder, 'assets', 'tiles.png'), encodePng(TILES().pixels));
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let map!: TTilemap;
            const game = createHeadlessGame({
                width: 8, height: 4, background: { r: 0, g: 0, b: 0, a: 1 }, assets: folder,
                scenes: {
                    Level: () => {
                        const texture = createPixelTexture(useLoadPixels({ src: '/assets/tiles.png' }));
                        map = createTilemap({ doc: DOC, atlas: createSpriteAtlas({ texture, columns: 3 }) });
                        return createScene();
                    },
                },
            });
            games.push(game);
            await game.loaded();

            expect(map.status).toBe('ready');
            expect(at(game.capture(), 0, 2)).toEqual([255, 0, 0]);
            expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('could not be loaded');
        } finally {
            warn.mockRestore();
        }
    });

    it('says when the picture it waited for never came, and draws nothing', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let map!: TTilemap;
            const game = headless(() => {
                const texture = useLoadTexture({ src: '/assets/missing.png', key: 'missing' });
                map = createTilemap({ doc: DOC, atlas: createSpriteAtlas({ texture, columns: 3 }) });
                return createScene();
            });
            await game.loaded();
            await whenLoaded(map);

            expect(map.status).toBe('error');
            expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('could not be loaded');
        } finally {
            warn.mockRestore();
        }
    });

    it('settles when the painting of its picture throws, rather than waiting for ever', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-map-'));
        folders.push(folder);
        mkdirSync(join(folder, 'assets'));
        writeFileSync(join(folder, 'assets', 'tiles.png'), encodePng(TILES().pixels));
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let map!: TTilemap;
            const game = createHeadlessGame({
                width: 8, height: 4, background: { r: 0, g: 0, b: 0, a: 1 }, assets: folder,
                scenes: {
                    Level: () => {
                        const texture = createPixelTexture(useLoadPixels({ src: '/assets/tiles.png' }), () => { throw new Error('no paint'); });
                        map = createTilemap({ doc: DOC, atlas: createSpriteAtlas({ texture, columns: 3 }) });
                        return createScene();
                    },
                },
            });
            games.push(game);
            await game.loaded(1);

            expect(map.status).toBe('error');
            const said = warn.mock.calls.map((call) => String(call[0])).join('\n');
            expect(said).toContain('threw, so the texture stays empty');
            expect(said).toContain('could not be loaded');
        } finally {
            warn.mockRestore();
        }
    });

    it('takes a sheet from useLoadAtlas, and stops using it when it goes', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-map-'));
        folders.push(folder);
        mkdirSync(join(folder, 'assets'));
        writeFileSync(join(folder, 'assets', 'tiles.png'), encodePng(TILES().pixels));
        writeFileSync(join(folder, 'assets', 'tiles.atlas'), JSON.stringify({ format: 1, kind: 'atlas', texture: 'tiles.png', grid: { frameWidth: 2, frameHeight: 2 }, sequences: { flicker: { frames: [1, 2], fps: 4 } } }));
        let map!: TTilemap;
        let loaded!: ReturnType<typeof useLoadAtlas>;
        let holder!: Parameters<typeof destroy>[0];
        const game = createHeadlessGame({
            width: 8, height: 4, background: { r: 0, g: 0, b: 0, a: 1 }, assets: folder,
            scenes: {
                Level: () => {
                    loaded = useLoadAtlas({ src: '/assets/tiles.atlas' });
                    useSpawn(() => {
                        holder = useSelf();
                        map = createTilemap({ doc: { ...DOC, tiles: { ...DOC.tiles, 3: { anim: 'flicker' } } }, atlas: loaded });
                    })();
                    return createScene();
                },
            },
        });
        games.push(game);
        await game.loaded();
        game.run(1);

        expect(map.status).toBe('ready');
        expect(map.atlas).toBe(loaded);
        expect(sheetUsersOf(loaded)).toContain(map as never);

        destroy(holder);
        game.run(1);

        expect(sheetUsersOf(loaded)).not.toContain(map as never);
        expect(map.status).toBe('released');
    });

    it('lets go of its corners with the object that asked for it, and leaves the scene\'s maps and loads', () => {
        const { store } = createTestGame();
        let map!: TTilemap;
        let holder!: Parameters<typeof destroy>[0];
        const scene = startTestScene(store, 'Level', () => {
            useSpawn(() => {
                holder = useSelf();
                map = createTilemap({ doc: DOC, atlas: sheet() });
            })();
            return createScene();
        });
        runHookUpdates(scene, 1 / 60);

        expect(sceneTilemaps(store, scene)).toEqual([map]);
        expect(scene.loads).toContain(map);
        const state = layerStateOf(map.layers[0]!)!;
        expect(state.still.buffer).not.toBeNull();

        destroy(holder, { immediate: true });

        expect(sceneTilemaps(store, scene)).toEqual([]);
        expect(scene.loads).not.toContain(map);
        expect(state.still.buffer).toBeNull();
    });

    it('goes with its scene, and is not in the cache for the next', () => {
        const { store } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => {
            map = createTilemap({ doc: DOC, atlas: sheet() });
            return createScene();
        });
        expect(store.get('assets').tilemaps.size).toBe(0);

        stopScene(store, scene);

        expect(map.status).toBe('released');
        expect(sceneTilemaps(store, scene)).toEqual([]);
    });

    it('is left out of a scene document, and says so', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store } = createTestGame();
            const scene = startTestScene(store, 'Level', () => {
                createTilemap({ doc: DOC, atlas: sheet() });
                return createScene();
            });
            runHookUpdates(scene, 1 / 60);
            const written = serializeScene(scene);

            expect(JSON.stringify(written)).not.toContain('"tilemap"');
            expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('made in code');
        } finally {
            warn.mockRestore();
        }
    });

    describe('what it refuses', () => {
        const inScene = (fn: () => void): void => {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                fn();
                return createScene();
            });
        };

        it('a document that is wrong, naming it', () => {
            expect(() => inScene(() => createTilemap({ doc: { ...DOC, width: 9 }, atlas: sheet() }))).toThrow("'the doc given to createTilemap' is not a map that can be drawn: layer 'ground' has 6 cells");
            expect(() => inScene(() => createTilemap({ doc: { ...DOC, tiles: {} }, atlas: sheet() }))).toThrow('uses tile 2');
        });

        it('an atlas that is a path, or missing', () => {
            expect(() => inScene(() => createTilemap({ doc: DOC, atlas: 'tiles.atlas' as never }))).toThrow('needs its atlas as an object');
            expect(() => inScene(() => createTilemap({ doc: DOC } as never))).toThrow('needs its atlas as an object');
            expect(() => inScene(() => createTilemap({ doc: DOC, atlas: pixelsFromRows(['r'], PALETTE) as never }))).toThrow('needs its atlas as an object');
        });

        it('both a file and a document, and neither', () => {
            expect(() => inScene(() => createTilemap({ src: '/a.tilemap', doc: DOC, atlas: sheet() } as never))).toThrow('both a src and a doc');
            expect(() => inScene(() => createTilemap({} as never))).toThrow('neither a src nor a doc');
        });

        it('a run that could not be played', () => {
            const made = (sequences: never): void => inScene(() => createTilemap({ doc: DOC, atlas: sheet(), sequences }));

            // A pace like these would turn the tile's clock into a loop that never ends.
            expect(() => made({ water: { frames: [0], fps: -4 } } as never)).toThrow("the run 'water' has a pace of -4");
            expect(() => made({ water: { frames: [0], fps: 0 } } as never)).toThrow('has a pace of 0');
            expect(() => made({ water: { frames: [0], fps: Infinity } } as never)).toThrow('has a pace of Infinity');
            expect(() => made({ water: { frames: [0], fps: Number.NaN } } as never)).toThrow('has a pace of NaN');
            expect(() => made({ water: { frames: [] } } as never)).toThrow("the run 'water' has frames []");
            expect(() => made({ water: { frames: [0, undefined] } } as never)).toThrow('whole frame numbers');
            expect(() => made({ water: { frames: [1.5] } } as never)).toThrow('whole frame numbers');
            expect(() => made({ water: {} } as never)).toThrow('whole frame numbers');
            expect(() => made({ water: null } as never)).toThrow('whole frame numbers');
        });

        it('runs given with a sheet that has its own', () => {
            const loaded = { type: 'atlas', src: 'x.atlas', status: 'ready', texture: {}, columns: 1, rows: 1, frames: 1, sequences: {} };
            expect(() => inScene(() => createTilemap({ doc: DOC, atlas: loaded as never, sequences: {} }))).toThrow("the sheet 'x.atlas', which has its own");
        });
    });

    it('says which tiles show nothing, and draws the rest', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const game = headless(() => {
                createTilemap({
                    doc: {
                        cell: 2, width: 4, height: 1,
                        tiles: { 1: { frame: 99 }, 2: { anim: 'nope' }, 3: { frame: 'grass' }, 4: { frame: 0 }, 5: { frame: 1.5 } },
                        layers: [{ name: 'only', order: 0, data: [1, 2, 4, 5] }],
                    },
                    atlas: sheet(),
                });
                return createScene();
            });
            const said = warn.mock.calls.map((call) => String(call[0])).find((text) => text.includes('createTilemap')) ?? '';

            expect(said).toContain('tile 1 shows frame 99');
            expect(said).toContain("tile 2 cycles 'nope'");
            expect(said).toContain("tile 3 shows the frame 'grass'");
            expect(said).toContain('tile 5 shows frame 1.5');
            expect(said).not.toContain('tile 4');
            const shot = game.capture();
            expect(at(shot, 0, 0)).toEqual([0, 0, 0]);
            expect(at(shot, 2, 0)).toEqual([0, 0, 0]);
            expect(at(shot, 4, 0)).toEqual([255, 0, 0]);
            expect(at(shot, 6, 0)).toEqual([0, 0, 0]);
        } finally {
            warn.mockRestore();
        }
    });

    it('says when a run goes past the end of the sheet', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            headless(() => {
                createTilemap({
                    doc: { cell: 2, width: 1, height: 1, tiles: { 1: { anim: 'water' } }, layers: [{ name: 'only', order: 0, data: [1] }] },
                    atlas: sheet(),
                    sequences: { water: { frames: [0, 99] } },
                });
                return createScene();
            });

            expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain("tile 1 cycles 'water', with frames 0, 99");
        } finally {
            warn.mockRestore();
        }
    });

    it('is named as one made in code when a message has no file to name', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let map!: TTilemap;
            headless(() => {
                map = createTilemap({ doc: DOC, atlas: sheet() });
                return createScene();
            });
            setTile(map, 0, 0, 0, 77);

            expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('setTile: the map made in code does not describe a tile 77');
        } finally {
            warn.mockRestore();
        }
    });

    it('still takes a file, with the same call', () => {
        const fetched = spyOn(globalThis, 'fetch').mockImplementation((async () => new Response('', { status: 404 })) as never);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store } = createTestGame();
            let map!: TTilemap;
            startTestScene(store, 'Level', () => {
                map = createTilemap({ src: '/maps/level.tilemap' });
                return createScene();
            });

            expect(map.src).toBe('/maps/level.tilemap');
            expect(store.get('assets').tilemaps.size).toBe(1);
        } finally {
            fetched.mockRestore();
            warn.mockRestore();
        }
    });
});

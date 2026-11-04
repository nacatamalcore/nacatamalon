import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSpriteAtlas } from '../src/atlas';
import { atlasDocFrames, parseAtlasDoc, serializeAtlasDoc } from '../src/atlas/document';
import { createHeadlessGame } from '../src/headless';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createScene } from '../src/scene/create_scene';
import { useLoadAtlas } from '../src/hooks/loaders/use_load_atlas';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSpriteAnimation } from '../src/hooks/animation/use_sprite_animation';
import { useTransform } from '../src/hooks/transform/use_transform';
import { pointOf } from '../src/layout';
import { createPixels, pixelsFromRows, sheetFromRows } from '../src/pixels';
import { encodePng } from '../src/pixels/encode_png';
import type { THeadlessGame } from '../src/headless';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TAtlasFramePoints, TSpriteAtlasOptions } from '../src/atlas';
import type { TLoadedAtlas } from '../src/loaders';

/**
 * A place on a character's picture that moves with each frame: the hand a sword hangs from.
 */

const games: THeadlessGame[] = [];
const folders: string[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

/** Two frames of 16 by 8, with the hand somewhere else in each and feet only in the first. */
const POINTS: Record<number, TAtlasFramePoints> = {
    0: { hand: { x: 12, y: 2 }, feet: { x: 8, y: 8 } },
    1: { hand: { x: 4, y: 6 } },
};

type TOptions = Parameters<typeof createSprite>[0];

/** A sprite on a sheet with those points, in a game of its own, and what it is hanging from. */
const inGame = (options: Partial<TOptions> = {}, wrap?: (make: () => TSprite) => TSprite): TSprite => {
    let sprite!: TSprite;
    const make = (): TSprite => createSprite({
        atlas: createSpriteAtlas({ texture: createPixelTexture(createPixels(32, 8)), columns: 2, points: POINTS }),
        anchor: { x: 0, y: 0 },
        transform: { x: 100, y: 50 },
        ...options,
    } as TOptions);
    const game = createHeadlessGame({
        width: 8, height: 8,
        scenes: {
            Level: () => {
                sprite = wrap === undefined ? make() : wrap(make);
                return createScene();
            },
        },
    });
    games.push(game);
    return sprite;
};

const near = (point: { x: number; y: number } | null, x: number, y: number): void => {
    expect(point).not.toBeNull();
    expect(point!.x).toBeCloseTo(x, 6);
    expect(point!.y).toBeCloseTo(y, 6);
};

describe('pointOf', () => {
    it('says where the point is, from the frame showing now', () => {
        const sprite = inGame();

        near(pointOf(sprite, 'hand'), 112, 52);
        sprite.frame = 1;
        near(pointOf(sprite, 'hand'), 104, 56);
    });

    it('gives nothing for a frame without that point, with no word about it', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const sprite = inGame({ frame: 1 });

            expect(pointOf(sprite, 'feet')).toBeNull();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('takes the anchor into account', () => {
        near(pointOf(inGame({ anchor: { x: 0.5, y: 1 } }), 'hand'), 100 + 12 - 8, 50 + 2 - 8);
        // Left out, a sprite sits by its middle.
        near(pointOf(inGame({ anchor: undefined }), 'hand'), 100 + 12 - 8, 50 + 2 - 4);
    });

    it('turns the picture over about its middle when flipped', () => {
        near(pointOf(inGame({ flipX: true }), 'hand'), 100 + 16 - 12, 52);
        near(pointOf(inGame({ flipY: true }), 'hand'), 112, 50 + 8 - 2);
        near(pointOf(inGame({ flipX: true, flipY: true }), 'hand'), 104, 56);
    });

    it('stays in its place on a picture drawn another size', () => {
        near(pointOf(inGame({ width: 32, height: 24 }), 'hand'), 100 + 24, 50 + 6);
    });

    it('grows and turns with the sprite', () => {
        near(pointOf(inGame({ transform: { x: 100, y: 50, scaleX: 2, scaleY: 3 } }), 'hand'), 124, 56);
        // A quarter turn clockwise on screen: 12 across becomes 12 down, 2 down becomes 2 to the left.
        near(pointOf(inGame({ transform: { x: 100, y: 50, rotation: Math.PI / 2 } }), 'hand'), 98, 62);
        near(pointOf(inGame({ transform: { x: 100, y: 50, scaleX: -1 } }), 'hand'), 88, 52);
    });

    it('turns about the pivot, the anchor and all', () => {
        const sprite = inGame({ pivot: { x: 0.5, y: 0.5 }, transform: { x: 100, y: 50, rotation: Math.PI } });

        // The middle stays at 108, 54; the hand, 4 right and 2 up of it, goes 4 left and 2 down.
        near(pointOf(sprite, 'hand'), 104, 56);
    });

    it('goes with the objects above it', () => {
        const sprite = inGame({}, (make) => {
            let made!: TSprite;
            useSpawn(() => {
                useTransform({ x: 1000, y: 2000, scaleX: 2, scaleY: 2 });
                made = make();
            })();
            return made;
        });

        near(pointOf(sprite, 'hand'), 1000 + 112 * 2, 2000 + 52 * 2);
    });

    it('turns about the pivot under an object that grows and turns, and with a flip', () => {
        const options = { pivot: { x: 0.5, y: 0.5 }, flipX: true, transform: { x: 10, y: 20, rotation: Math.PI / 2 } };
        const sprite = inGame(options, (make) => {
            let made!: TSprite;
            useSpawn(() => {
                useTransform({ x: 1000, y: 2000, scaleX: 2, scaleY: 2, rotation: Math.PI / 2 });
                made = make();
            })();
            return made;
        });

        // The object it belongs to turns the picture about its pivot too, as `pivotPlace` says, so that
        // turn does not move the pivot. Placed at 10, 20 it lands at -40, 20 and the middle is 8, 4 from
        // there: 968, 2024. The hand, flipped from 12 across to 4, is 4 left and 2 up of the middle: at
        // scale 2 and half a turn in all, 8 right and 4 down.
        near(pointOf(sprite, 'hand'), 976, 2028);
    });

    it('sees a frame an animation has moved on to', () => {
        let sprite!: TSprite;
        const game = createHeadlessGame({
            width: 8, height: 8,
            scenes: {
                Level: () => {
                    sprite = createSprite({
                        atlas: createSpriteAtlas({ texture: createPixelTexture(createPixels(32, 8)), columns: 2, points: POINTS }),
                        anchor: { x: 0, y: 0 },
                        transform: { x: 0, y: 0 },
                    });
                    useSpriteAnimation(sprite, { play: 'run', clips: { run: { frames: [1], fps: 60 } } });
                    return createScene();
                },
            },
        });
        games.push(game);
        game.run(2);

        near(pointOf(sprite, 'hand'), 4, 6);
    });

    it('lands on the pixel drawn there', () => {
        const sheet = sheetFromRows({ a: ['....', '..r.', '....'], b: ['....', '....', 'r...'] }, { r: '#ff0000' });
        let sprite!: TSprite;
        const game = createHeadlessGame({
            width: 16, height: 16, background: { r: 0, g: 0, b: 0, a: 1 },
            scenes: {
                Level: () => {
                    sprite = createSprite({
                        atlas: createSpriteAtlas({
                            texture: createPixelTexture(sheet.pixels),
                            columns: sheet.columns,
                            // The middle of each pixel, which is where it stays when flipped.
                            points: { [sheet.frames.a!]: { hand: { x: 2.5, y: 1.5 } }, [sheet.frames.b!]: { hand: { x: 0.5, y: 2.5 } } },
                        }),
                        anchor: { x: 0, y: 0 },
                        transform: { x: 5, y: 3 },
                    });
                    return createScene();
                },
            },
        });
        games.push(game);
        const red = (): boolean => {
            const shot = game.capture();
            const { x, y } = pointOf(sprite, 'hand')!;
            return shot.data[(Math.floor(y) * shot.width + Math.floor(x)) * 4] === 255;
        };

        expect(red()).toBe(true);
        sprite.flipX = true;
        expect(red()).toBe(true);
        sprite.frame = sheet.frames.b!;
        expect(red()).toBe(true);
        sprite.flipY = true;
        expect(red()).toBe(true);
    });

    describe('what it says', () => {
        const said = (sprite: TSprite, name: string): string[] => {
            const warn = spyOn(console, 'warn').mockImplementation(() => {});
            try {
                expect(pointOf(sprite, name)).toBeNull();
                expect(pointOf(sprite, name)).toBeNull();
                return warn.mock.calls.map((call) => String(call[0]));
            } finally {
                warn.mockRestore();
            }
        };

        it('of a name no frame has, once, with those it has', () => {
            const words = said(inGame(), 'hnad');

            expect(words).toHaveLength(1);
            expect(words[0]).toContain("no frame of this sprite's sheet has a point called 'hnad'. It has: hand, feet.");
        });

        it('of a sheet with no points', () => {
            let sprite!: TSprite;
            const game = createHeadlessGame({
                width: 8, height: 8,
                scenes: {
                    Level: () => {
                        sprite = createSprite({ atlas: createSpriteAtlas({ texture: createPixelTexture(createPixels(4, 4)), columns: 2 }) });
                        return createScene();
                    },
                },
            });
            games.push(game);

            expect(said(sprite, 'hand')[0]).toContain("this sprite's sheet has no points, so it has no 'hand'");
        });

        it('of a sprite with no sheet', () => {
            let sprite!: TSprite;
            const game = createHeadlessGame({
                width: 8, height: 8,
                scenes: {
                    Level: () => {
                        sprite = createSprite({ width: 4, height: 4 });
                        return createScene();
                    },
                },
            });
            games.push(game);

            expect(said(sprite, 'hand')[0]).toContain('of a sprite with no sheet');
        });

        it('does not take a name from the language for a point', () => {
            expect(said(inGame(), 'constructor')[0]).toContain("called 'constructor'");
            expect(said(inGame(), '__proto__')[0]).toContain("called '__proto__'");
        });
    });

    describe('with a sheet from a file', () => {
        const served = (atlas: Record<string, unknown>): string => {
            const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-points-'));
            folders.push(folder);
            mkdirSync(join(folder, 'assets'));
            writeFileSync(join(folder, 'assets', 'hero.png'), encodePng(pixelsFromRows(['rrrrrrrr', 'rrrrrrrr'], { r: '#ff0000' })));
            writeFileSync(join(folder, 'assets', 'hero.atlas'), JSON.stringify({ format: 1, kind: 'atlas', texture: 'hero.png', ...atlas }));
            return folder;
        };

        const load = async (atlas: Record<string, unknown>): Promise<{ sprite: TSprite; sheet: TLoadedAtlas; before: { x: number; y: number } | null }> => {
            let sprite!: TSprite;
            let sheet!: TLoadedAtlas;
            let before: { x: number; y: number } | null = null;
            const game = createHeadlessGame({
                width: 8, height: 8, assets: served(atlas),
                scenes: {
                    Level: () => {
                        sheet = useLoadAtlas({ src: '/assets/hero.atlas' });
                        sprite = createSprite({ atlas: sheet, anchor: { x: 0, y: 0 }, transform: { x: 10, y: 20 } });
                        before = pointOf(sprite, 'hand');
                        return createScene();
                    },
                },
            });
            games.push(game);
            await game.loaded();
            return { sprite, sheet, before };
        };

        it('reads a grid\'s points by frame number, and says nothing until it arrives', async () => {
            const warn = spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const { sprite, before } = await load({ grid: { frameWidth: 4, frameHeight: 2 }, points: { 1: { hand: { x: 3, y: 1 } } } });

                expect(before).toBeNull();
                expect(pointOf(sprite, 'hand')).toBeNull();
                sprite.frame = 1;
                near(pointOf(sprite, 'hand'), 13, 21);
                expect(warn).not.toHaveBeenCalled();
            } finally {
                warn.mockRestore();
            }
        });

        it('reads a packed sheet\'s by name or number, with frames of their own sizes', async () => {
            const { sprite } = await load({
                packed: { idle: { x: 0, y: 0, w: 2, h: 2 }, strike: { x: 2, y: 0, w: 6, h: 2 } },
                points: { strike: { hand: { x: 5, y: 1 } }, 0: { hand: { x: 1, y: 1 } } },
            });

            near(pointOf(sprite, 'hand'), 11, 21);
            sprite.frame = 1;
            near(pointOf(sprite, 'hand'), 15, 21);
        });

        it('finds a frame of a grid with gaps by its own size', async () => {
            const { sprite } = await load({ grid: { frameWidth: 2, frameHeight: 2, spacing: 2 }, points: { 1: { hand: { x: 1, y: 1 } } } });
            sprite.frame = 1;

            near(pointOf(sprite, 'hand'), 11, 21);
        });

        it('takes a packed frame by its name before its number', async () => {
            const { sprite } = await load({
                packed: { first: { x: 0, y: 0, w: 4, h: 2 }, 1: { x: 4, y: 0, w: 4, h: 2 } },
                points: { 1: { hand: { x: 1, y: 1 } } },
            });
            // The object's key order numbers `1` first, as it is what JSON keeps: named `1`, it is frame 0.
            expect(pointOf(sprite, 'hand')).not.toBeNull();
        });

        it('says when a point is on a frame it does not have, and keeps the rest', async () => {
            const warn = spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const { sprite } = await load({ grid: { frameWidth: 4, frameHeight: 2 }, points: { 9: { hand: { x: 0, y: 0 } }, walk: { hand: { x: 0, y: 0 } }, 0: { hand: { x: 1, y: 1 } }, '1e0': { other: { x: 0, y: 0 } }, ' 1': { other: { x: 0, y: 0 } }, '': { other: { x: 0, y: 0 } } } });

                const words = warn.mock.calls.map((call) => String(call[0])).join('\n');
                expect(words).toContain("a frame '9'");
                expect(words).toContain("a frame 'walk'");
                expect(words).toContain("a frame '1e0'");
                expect(words).toContain("a frame ' 1'");
                expect(words).toContain("a frame ''");
                near(pointOf(sprite, 'hand'), 11, 21);
            } finally {
                warn.mockRestore();
            }
        });
    });
});

describe('createSpriteAtlas with points', () => {
    const texture = { width: 4, height: 4 } as never;
    const made = (points: unknown): unknown => createSpriteAtlas({ texture, columns: 2, points } as TSpriteAtlasOptions);

    it('leaves the field out with none, so a sheet stays as it was', () => {
        expect(Object.keys(createSpriteAtlas({ texture, columns: 2 }))).toEqual(['texture', 'columns', 'rows', 'frames']);
    });

    it('does not hold on to what it was given', () => {
        const points = { 0: { hand: { x: 1, y: 1 } } };
        const sheet = createSpriteAtlas({ texture, columns: 2, points });
        points[0].hand.x = 99;

        expect(sheet.points?.[0]?.hand?.x).toBe(1);
    });

    it('takes a point off the frame: a muzzle may be past the picture', () => {
        expect(() => made({ 0: { muzzle: { x: 40, y: -3 } } })).not.toThrow();
    });

    it('refuses what it could not use, saying where', () => {
        expect(() => made({ 2: { hand: { x: 0, y: 0 } } })).toThrow("points names frame '2', and this sheet has frames 0 to 1");
        expect(() => made({ walk: { hand: { x: 0, y: 0 } } })).toThrow("points names frame 'walk'");
        for (const odd of ['', ' 1', '1e0', '0x1', '01']) {
            expect(() => made({ [odd]: { hand: { x: 0, y: 0 } } })).toThrow(`points names frame '${odd}'`);
        }
        expect(() => made({ 0: { hand: [1, 2] } })).toThrow('frame 0 has a point "hand" that is not { x, y }');
        expect(() => made({ 0: { hand: { x: Number.NaN, y: 0 } } })).toThrow('frame 0 has a point "hand"');
        expect(() => made({ 0: 'hand' })).toThrow('frame 0 has to give its points as an object');
        expect(() => made('hand')).toThrow('points has to be an object');
    });
});

describe('points in the .atlas document', () => {
    const GRID = { format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 16, frameHeight: 16 } };

    it('come back as they were written', () => {
        const doc = parseAtlasDoc({ ...GRID, points: { 1: { hand: { x: 3, y: 4 } } } }, 'hero.atlas');
        const again = parseAtlasDoc(JSON.parse(serializeAtlasDoc(doc)), 'hero.atlas');

        expect(again.points).toEqual({ 1: { hand: { x: 3, y: 4 } } });
    });

    it('are left out when there are none, as files written before them are', () => {
        const doc = parseAtlasDoc(GRID, 'hero.atlas');

        expect('points' in doc).toBe(false);
        expect(JSON.parse(serializeAtlasDoc(doc)).points).toBeUndefined();
        expect(atlasDocFrames(doc, 16, 16)).toHaveLength(1);
    });

    it('keep a frame called __proto__ as a frame', () => {
        const doc = parseAtlasDoc({ ...GRID, points: JSON.parse('{ "__proto__": { "hand": { "x": 1, "y": 1 } } }') }, 'hero.atlas');

        expect(Object.keys(doc.points ?? {})).toEqual(['__proto__']);
    });

    it('are refused when wrong, naming the file and the frame', () => {
        expect(() => parseAtlasDoc({ ...GRID, points: [] }, 'hero.atlas')).toThrow('atlas "hero.atlas": "points" must be an object');
        expect(() => parseAtlasDoc({ ...GRID, points: { 1: { hand: [1, 2] } } }, 'hero.atlas')).toThrow('frame "1" has a point "hand"');
        expect(() => parseAtlasDoc({ ...GRID, points: { 1: 7 } }, 'hero.atlas')).toThrow('frame "1" has to give its points');
    });
});

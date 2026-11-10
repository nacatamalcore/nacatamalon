import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useLoadLut, useLoadPalette } from '../src/hooks/loaders';
import { createHeadlessGame } from '../src/headless';
import { CPU_STEPS, stepFingerprint } from '../src/headless/software/paint_effects';
import { colorAdjust, crt, dither, dropShadow, glow, lutGrade, mosaic, outline, paletteMatch, posterize } from '../src/post/builtin';
import { postStepsOf } from '../src/render/shared/post_steps';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import { useFilter } from '../src/hooks/filter';
import { useSelf } from '../src/hooks';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createPixels, fillGradient } from '../src/pixels';
import { getColor } from '../src/color';
import type { THeadlessGame } from '../src/headless';
import type { TPixels } from '../src/pixels';
import type { TPostEffect } from '../src/post/types/t_post_effect';
import type { TSceneFn } from '../src/scene';

/**
 * The engine's own effects in a picture of a game run with no browser: worked out without a
 * graphics card, from copies of their shaders that are only used while the shaders are the ones
 * they were copied from.
 */

const games: THeadlessGame[] = [];
const folders: string[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

/** A game whose assets folder holds `files`, loaded. */
const withFiles = async (files: Record<string, string>, scene: TSceneFn): Promise<THeadlessGame> => {
    const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-effects-'));
    folders.push(folder);
    mkdirSync(join(folder, 'fx'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, 'fx', name), text);
    const game = createHeadlessGame({ width: 32, height: 16, background: { r: 0, g: 0, b: 0, a: 1 }, assets: folder, scenes: { Scene: scene } });
    games.push(game);
    await game.loaded();
    return game;
};

const pixelAt = (pixels: TPixels, x: number, y: number): number[] => Array.from(pixels.data.subarray((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 3));

const make = (scene: TSceneFn): THeadlessGame => {
    const game = createHeadlessGame({ width: 32, height: 16, background: { r: 0, g: 0, b: 0, a: 1 }, scenes: { Scene: scene } });
    games.push(game);
    return game;
};

/** A dark-to-light ramp across the whole screen. */
const ramp = (): void => {
    const pixels = createPixels(32, 16);
    fillGradient(pixels, { from: getColor('#000000'), to: getColor('#ffffff'), direction: 'right' });
    createSprite({ texture: createPixelTexture(pixels), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
};

const channels = (pixels: TPixels): Set<number> => {
    const seen = new Set<number>();
    for (let i = 0; i < pixels.data.length; i += 4) seen.add(pixels.data[i]!);
    return seen;
};

describe('the copies of the engine\'s effects', () => {
    // When this fails, a shader below has changed: change its copy in
    // src/headless/software/paint_effects.ts the same way, then its fingerprint in CPU_STEPS.
    it.each([
        ['dither', dither()],
        ['posterize', posterize()],
        ['mosaic', mosaic()],
        ['paletteMatch', paletteMatch()],
        ['lutGrade', lutGrade()],
        ['colorAdjust', colorAdjust()],
        ['outline', outline()],
        ['dropShadow', dropShadow()],
        ['glow', glow()],
    ])('still know every step of %s by its shader', (_name, effect) => {
        for (const step of postStepsOf(effect as unknown as TPostEffect)) {
            expect(CPU_STEPS.has(stepFingerprint(step.fragment)!)).toBe(true);
        }
    });
});

describe('effects in a capture', () => {
    it('runs the screen\'s chain: posterized to two levels, every channel is all or nothing', () => {
        const game = make(() => {
            ramp();
            usePostProcess(posterize({ levels: 2 }));
            return createScene();
        });

        expect([...channels(game.capture())].sort((a, b) => a - b)).toEqual([0, 255]);
    });

    it('runs them in order, each over what the one before left', () => {
        const game = make(() => {
            ramp();
            usePostProcess(colorAdjust({ brightness: 0 }));
            usePostProcess(posterize({ levels: 2 }));
            return createScene();
        });

        expect([...channels(game.capture())]).toEqual([0]);
    });

    it('runs a filter\'s effects over its object: an outline round a square', () => {
        const game = make(() => {
            useSpawn(() => {
                createSprite({ width: 4, height: 4, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 10, y: 6 } });
                useFilter({ effects: [outline({ color: '#ffffff', thickness: 1 })] }).add(useSelf());
            })();
            return createScene();
        });
        const shot = game.capture();
        const at = (x: number, y: number) => Array.from(shot.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 3));

        expect(at(11, 7)).toEqual([255, 0, 0]);
        expect(at(9, 7)).toEqual([255, 255, 255]);
        expect(at(14, 7)).toEqual([255, 255, 255]);
        expect(at(7, 7)).toEqual([0, 0, 0]);
    });

    it('says an effect it has no copy of, and draws the rest', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const game = make(() => {
                ramp();
                usePostProcess(crt());
                usePostProcess(posterize({ levels: 2 }));
                return createScene();
            });
            const shot = game.capture();

            expect([...channels(shot)].sort((a, b) => a - b)).toEqual([0, 255]);
            const said = warn.mock.calls.map((call) => String(call[0])).find((text) => text.includes('capture'));
            expect(said).toContain('the effect crt');
        } finally {
            warn.mockRestore();
        }
    });

    it('does not take an effect whose shader is not the one copied for the engine\'s own, whatever it is called', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const game = make(() => {
                ramp();
                usePostProcess({ ...posterize({ levels: 2 }), fragment: `fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return vec4<f32>(1.0); }` });
                return createScene();
            });

            // Not posterized: the ramp keeps its shades.
            expect(channels(game.capture()).size).toBeGreaterThan(2);
            expect(warn.mock.calls.map((call) => String(call[0])).find((text) => text.includes('capture'))).toContain('the effect posterize');
        } finally {
            warn.mockRestore();
        }
    });

    it('matches every colour to the nearest of a palette', async () => {
        const game = await withFiles({ 'two.palette': JSON.stringify({ format: 1, kind: 'palette', name: 'two', colors: ['#ff0000', '#0000ff'] }) }, () => {
            ramp();
            usePostProcess({ ...paletteMatch({ dither: 0 }), palette: useLoadPalette({ src: '/fx/two.palette' }) });
            return createScene();
        });
        const shot = game.capture();
        const seen = new Set<string>();
        for (let x = 0; x < 32; x++) seen.add(pixelAt(shot, x, 8).join());

        expect([...seen].sort()).toEqual(['0,0,255', '255,0,0']);
        // Black is as far from either: the first in the palette wins, as in the shader.
        expect(pixelAt(shot, 0, 8)).toEqual([255, 0, 0]);
    });

    it('grades by a table: one that swaps red and blue swaps them', async () => {
        const lines = ['LUT_3D_SIZE 2'];
        for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) lines.push(`${b} ${g} ${r}`);
        const game = await withFiles({ 'swap.cube': lines.join('\n') }, () => {
            createSprite({ width: 16, height: 16, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            createSprite({ width: 16, height: 16, tint: getColor('#0000ff'), anchor: { x: 0, y: 0 }, transform: { x: 16, y: 0 } });
            usePostProcess({ ...lutGrade(), lut: useLoadLut({ src: '/fx/swap.cube' }) });
            return createScene();
        });
        const shot = game.capture();

        expect(pixelAt(shot, 5, 5)).toEqual([0, 0, 255]);
        // Blue is read from the slice two across, not a row down: the table's layout, not only its first row.
        expect(pixelAt(shot, 20, 5)).toEqual([255, 0, 0]);
    });

    it('makes blocks of the colour in their middle with mosaic', () => {
        const game = make(() => {
            ramp();
            usePostProcess(mosaic({ size: 4 }));
            return createScene();
        });
        const shot = game.capture();

        expect(pixelAt(shot, 0, 0)).toEqual(pixelAt(shot, 3, 3));
        expect(pixelAt(shot, 3, 0)).not.toEqual(pixelAt(shot, 4, 0));
    });

    it('dithers a flat grey into two levels in the Bayer pattern', () => {
        const game = make(() => {
            createSprite({ width: 32, height: 16, tint: { r: 0.5, g: 0.5, b: 0.5, a: 1 }, anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            usePostProcess(dither({ levels: 2 }));
            return createScene();
        });

        // Half way between the two levels: half the dots of a 4 by 4 cell up, half down.
        const shot = game.capture();
        let lit = 0;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (pixelAt(shot, x, y)[0] === 255) lit++;
        expect(lit).toBe(8);
    });

    it('turns the hue: red a third of the way round is green', () => {
        const game = make(() => {
            createSprite({ width: 32, height: 16, tint: getColor('#ff0000'), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
            usePostProcess(colorAdjust({ hue: 120 }));
            return createScene();
        });

        expect(pixelAt(game.capture(), 5, 5)).toEqual([0, 255, 0]);
    });

    it('reads a list uniform shorter than its kind as the card does, the rest 0', () => {
        const game = make(() => {
            useSpawn(() => {
                createSprite({ width: 2, height: 2, tint: getColor('#ffffff'), anchor: { x: 0, y: 0 }, transform: { x: 10, y: 6 } });
                const shadow = dropShadow({ radius: 0, color: '#0000ff', amount: 1 });
                shadow.uniforms.offset = [3];
                useFilter({ effects: [shadow] }).add(useSelf());
            })();
            return createScene();
        });

        // Three across and none down.
        expect(pixelAt(game.capture(), 13, 6)).toEqual([0, 0, 255]);
    });

    it('lays a glow and a drop shadow round what they filter', () => {
        const game = make(() => {
            useSpawn(() => {
                createSprite({ width: 4, height: 4, tint: getColor('#ffffff'), anchor: { x: 0, y: 0 }, transform: { x: 4, y: 6 } });
                useFilter({ effects: [glow({ color: '#ff0000', radius: 3 })] }).add(useSelf());
            })();
            useSpawn(() => {
                createSprite({ width: 4, height: 4, tint: getColor('#ffffff'), anchor: { x: 0, y: 0 }, transform: { x: 20, y: 4 } });
                useFilter({ effects: [dropShadow({ offset: { x: 3, y: 3 }, radius: 0, color: '#0000ff', amount: 1 })] }).add(useSelf());
            })();
            return createScene();
        });
        const shot = game.capture();
        const at = (x: number, y: number) => Array.from(shot.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 3));

        expect(at(3, 7)[0]).toBeGreaterThan(0);
        expect(at(3, 7)[2]).toBe(0);
        expect(at(25, 9)).toEqual([0, 0, 255]);
    });
});

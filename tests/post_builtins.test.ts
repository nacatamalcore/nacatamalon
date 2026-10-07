import { describe, expect, it } from 'bun:test';
import {
    bloom, COLOR_LEVELS, crt, CRT_PRESETS, dither, findPostBuiltin, lcd, lutGrade, paletteMatch, phosphor, POST_BUILTINS,
    posterize,
} from '../src/post';

/**
 * The engine's own effects, and the one property that keeps them honest across two backends.
 *
 * A hand-written effect may have only a WGSL half, and degrades where it cannot run. These may
 * not: they are the engine's, so one that ran on a single card would be a hole in the promise that
 * the two backends draw the same thing.
 */

describe('every built-in has both halves, and they agree', () => {
    for (const info of POST_BUILTINS) {
        it(`${info.key} is written in both languages, declaring the same parameters`, () => {
            const built = info.build();

            const steps = [...(built.passes ?? []), built];
            for (const step of steps) {
                expect(step.fragment).toContain('fn effect(');
                expect(step.fragmentGlsl).toContain('vec4 effect(');
            }
            // The only thing that stops the two halves drifting: they share one set of knobs, and a
            // half that read a knob the other does not declare would fail on one card alone. A knob
            // may be read by a pass rather than the hook, so all the steps are read together.
            const wgsl = steps.map((step) => step.fragment).join('\n');
            const glsl = steps.map((step) => step.fragmentGlsl).join('\n');
            for (const name of Object.keys(built.uniformSig)) {
                expect(wgsl).toContain(`mu.${name}`);
                expect(glsl).toContain(`mu.${name}`);
            }
            expect(Object.keys(built.uniforms).sort()).toEqual(Object.keys(built.uniformSig).sort());
        });
    }
});

describe('the catalogue', () => {
    it('says which data texture each one wants, which is what an editor offers a picker for', () => {
        expect(POST_BUILTINS.map((info) => [info.key, info.binds])).toEqual([
            ['lut', 'lut'],
            ['adjust', null],
            ['wave', null],
            ['shockwave', null],
            ['distort', null],
            ['mosaic', null],
            ['blur', null],
            ['zoomBlur', null],
            ['motionBlur', null],
            ['tiltShift', null],
            ['bloom', null],
            ['godrays', null],
            ['halftone', null],
            ['glitch', null],
            ['rgbSplit', null],
            ['grain', null],
            ['oldFilm', null],
            ['palette', 'palette'],
            ['dither', null],
            ['posterize', null],
            ['phosphor', null],
            ['ntsc', null],
            ['lcd', null],
            ['crt', null],
        ]);
    });

    it('builds what each key names', () => {
        for (const info of POST_BUILTINS) {
            // The project file's key and the effect's own name are the same word, so a chain read back
            // from an effect names the built-in it came from.
            expect(info.build().name).toBe(info.key);
        }
    });

    it('lists grading before limiting, which is the order they belong in', () => {
        const keys = POST_BUILTINS.map((info) => info.key);

        // A table moves colours about and the other three take colours away. Grading afterwards
        // would grade colours the machine was never going to show.
        expect(keys.indexOf('lut')).toBeLessThan(keys.indexOf('palette'));
        // Whatever adds light or colour goes before the palette takes colours away, and the screen
        // goes after all of it.
        expect(keys.indexOf('bloom')).toBeLessThan(keys.indexOf('palette'));
        expect(keys.indexOf('grain')).toBeLessThan(keys.indexOf('dither'));
        expect(keys.at(-1)).toBe('crt');
    });

    it('gives back nothing rather than throwing for an effect this version does not have', () => {
        expect(findPostBuiltin('sparkles')).toBeNull();
        expect(findPostBuiltin('dither')?.key).toBe('dither');
    });
});

describe('what each one starts at', () => {
    it('takes the options it is given, and has sensible answers without them', () => {
        expect(dither().uniforms).toEqual({ levels: COLOR_LEVELS.genesis, strength: 1 });
        expect(dither({ levels: 32, strength: 0.5 }).uniforms).toEqual({ levels: 32, strength: 0.5 });
        expect(posterize({ levels: 3 }).uniforms).toEqual({ levels: 3 });
        expect(paletteMatch({ dither: 0 }).uniforms).toEqual({ dither: 0 });
        expect(lutGrade().uniforms).toEqual({ amount: 1 });
        expect(crt().uniforms).toMatchObject({ scanlines: 0.45, mask: 0, maskType: 0, noise: 0, flicker: 0, interlace: 0 });
        expect(crt({ maskType: 'slot', mask: 0.4 }).uniforms).toMatchObject({ mask: 0.4, maskType: 1 });
        expect(crt({ maskType: 'shadow' }).uniforms.maskType).toBe(2);
    });

    it('starts still, so a capture of a still scene is the same twice', () => {
        // Grain, flicker and interlace move every frame. A default that moved would make every
        // pixel comparison of a game with a tube on it fail for no reason.
        const still = crt().uniforms;
        expect([still.noise, still.flicker, still.interlace]).toEqual([0, 0, 0]);
    });

    it('takes a preset whole, and lets one part of it be changed', () => {
        expect(crt(CRT_PRESETS.pvm).uniforms).toMatchObject({ maskType: 0, sharpness: CRT_PRESETS.pvm.sharpness });
        expect(crt({ ...CRT_PRESETS.consumer, noise: 0 }).uniforms).toMatchObject({ maskType: 1, noise: 0 });
        expect(crt(CRT_PRESETS.arcade).uniforms.maskType).toBe(2);
    });

    it('asks for passes and history only where they are needed', () => {
        expect(dither().passes).toBeUndefined();
        expect(crt().passes?.map((pass) => pass.scale)).toEqual([0.5, 0.5]);
        expect(bloom().passes?.length).toBe(3);
        expect(phosphor().history).toBe(true);
        expect(lcd().history).toBe(true);
        expect(crt().history).toBeUndefined();
    });

    it('knows what a machine of the era could show', () => {
        expect(COLOR_LEVELS.genesis).toBe(8);
        expect(COLOR_LEVELS.snes).toBe(32);
    });

    it('gives back what it was handed when there is no palette to match against', () => {
        // The first thing the shader does, and the reason a slow file costs the palette not the frame.
        expect(paletteMatch().fragment).toContain('if (count <= 1u) { return color; }');
        expect(paletteMatch().fragmentGlsl).toContain('if (count <= 1) { return color; }');
    });
});

import { describe, expect, it } from 'bun:test';
import { COLOR_LEVELS, crt, dither, findPostBuiltin, lutGrade, paletteMatch, POST_BUILTINS, posterize } from '../src/post';

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

            expect(built.fragment).toContain('fn effect(');
            expect(built.fragmentGlsl).toContain('vec4 effect(');
            // The only thing that stops the two halves drifting: they share one set of knobs, and a
            // half that read a knob the other does not declare would fail on one card alone.
            for (const name of Object.keys(built.uniformSig)) {
                expect(built.fragment).toContain(`mu.${name}`);
                expect(built.fragmentGlsl).toContain(`mu.${name}`);
            }
            expect(Object.keys(built.uniforms).sort()).toEqual(Object.keys(built.uniformSig).sort());
        });
    }
});

describe('the catalogue', () => {
    it('says which data texture each one wants, which is what an editor offers a picker for', () => {
        expect(POST_BUILTINS.map((info) => [info.key, info.binds])).toEqual([
            ['lut', 'lut'],
            ['palette', 'palette'],
            ['dither', null],
            ['posterize', null],
            ['crt', null],
        ]);
    });

    it('lists grading before limiting, which is the order they belong in', () => {
        const keys = POST_BUILTINS.map((info) => info.key);

        // A table moves colours about and the other three take colours away. Grading afterwards
        // would grade colours the machine was never going to show.
        expect(keys.indexOf('lut')).toBeLessThan(keys.indexOf('palette'));
    });

    it('gives back nothing rather than throwing for an effect this version does not have', () => {
        expect(findPostBuiltin('bloom')).toBeNull();
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
        expect(crt().uniforms).toEqual({ scanlines: 0.3, mask: 0, maskType: 0, curvature: 0.06, vignette: 0.25 });
        expect(crt({ maskType: 'slot', mask: 0.4 }).uniforms).toMatchObject({ mask: 0.4, maskType: 1 });
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

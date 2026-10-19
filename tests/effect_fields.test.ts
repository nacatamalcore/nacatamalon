import { describe, expect, it, spyOn } from 'bun:test';
import { POST_BUILTINS } from '../src/post/builtin/catalog';
import { installPostChain, tuneProjectPostEffect } from '../src/post/install_post_chain';
import { normalizePostChain } from '../src/post';
import { MATERIAL_LOOKS } from '../src/shader_composer/surface/looks';
import { createTestGame } from './helpers/test_game';
import type { TEffectField } from '../src/post/builtin/types/t_builtin';

/**
 * What each effect and each look says can be set on it, for a form to be made of it. A form shows
 * these and writes them back, so a field must be exactly a knob the effect has (or an option it is
 * made with), starting exactly where the effect starts.
 */

/** The kind of value a field's default is, as the effect holds it. */
const holds = (field: TEffectField, value: unknown): boolean => {
    switch (field.type) {
        case 'color': return Array.isArray(value) && value.length === 3;
        case 'vec2': return Array.isArray(value) && value.length === 2;
        case 'string': return typeof value === 'string';
        case 'boolean': return typeof value === 'boolean';
        default: return typeof value === 'number';
    }
};

describe('an effect\'s fields', () => {
    it('are its knobs, every one, with the values it starts at, and what it is made with', () => {
        for (const info of POST_BUILTINS) {
            const built = info.build();
            const knobs = info.fields.filter((field) => field.rebuild !== true);
            expect(knobs.map((field) => field.key).sort()).toEqual(Object.keys(built.uniforms).sort());
            for (const field of knobs) {
                expect(holds(field, field.default)).toBe(true);
                expect(field.default).toEqual(built.uniforms[field.key] as never);
                if (field.min !== undefined && typeof field.default === 'number') {
                    expect(field.default).toBeGreaterThanOrEqual(field.min);
                    expect(field.default).toBeLessThanOrEqual(field.max!);
                }
                if (field.type === 'select') {
                    expect(field.options!.some((option) => option.value === field.default)).toBe(true);
                }
            }
        }
    });

    it('marks what is written into ascii when it is made, and that is all', () => {
        const rebuilt = POST_BUILTINS.flatMap((info) => info.fields.filter((field) => field.rebuild).map((field) => `${info.key}.${field.key}`));
        expect(rebuilt).toEqual(['ascii.glyphs']);
    });

    it('makes ascii with the letters it is given', () => {
        const ascii = POST_BUILTINS.find((info) => info.key === 'ascii')!;
        expect(ascii.build({ glyphs: ' ░▒▓█' }).fragment).not.toBe(ascii.build().fragment);
        expect(ascii.build({ glyphs: ' ░▒▓█' }).fragment).toContain('array<u32, 5>');
    });
});

describe('a chain entry\'s options', () => {
    it('are kept where the effect has such an option, of its kind', () => {
        const [entry] = normalizePostChain([{ builtin: 'ascii', options: { glyphs: ' .oO0@' } }]);
        expect(entry!.options).toEqual({ glyphs: ' .oO0@' });
    });

    it('leave out one the effect does not have, or of another kind, and say so', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [ascii, crt] = normalizePostChain([
            { builtin: 'ascii', options: { glyphs: 4, size: 2 } },
            { builtin: 'crt', options: { maskType: 'slot' } },
        ]);
        expect(ascii).not.toHaveProperty('options');
        expect(crt).not.toHaveProperty('options');
        expect(warn).toHaveBeenCalledTimes(3);
        warn.mockRestore();
    });

    it('make the effect with them, and its knobs are laid over', () => {
        const { store } = createTestGame();
        installPostChain(store, normalizePostChain([{ builtin: 'ascii', options: { glyphs: ' ░▒▓█' }, uniforms: { size: 12 } }]));
        const [effect] = store.get('post').effects;
        expect(effect!.fragment).toContain('array<u32, 5>');
        expect(effect!.uniforms.size).toBe(12);
    });
});

describe('turning a project effect\'s knobs from outside', () => {
    it('turns the effect its entry made, past an entry that made none', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        installPostChain(store, normalizePostChain([{ builtin: 'nothingLikeThis' }, { builtin: 'dither' }, { builtin: 'bloom' }]));
        warn.mockRestore();
        expect(tuneProjectPostEffect(store, 2, { intensity: 2, nope: 1 })).toBe(true);
        const [dither, bloom] = store.get('post').effects;
        expect(bloom!.uniforms.intensity).toBe(2);
        expect(bloom!.uniforms).not.toHaveProperty('nope');
        expect(dither!.uniforms).not.toHaveProperty('intensity');
        expect(tuneProjectPostEffect(store, 0, { levels: 2 })).toBe(false);
    });
});

describe('a look\'s fields', () => {
    it('are its knobs, every one, with the values it starts at', () => {
        for (const info of MATERIAL_LOOKS) {
            const look = info.build() as unknown as Record<string, unknown>;
            expect(info.fields.map((field) => field.key).sort()).toEqual(Object.keys(look).filter((key) => key !== 'look').sort());
            for (const field of info.fields) {
                expect(holds(field, field.default)).toBe(true);
                expect(field.default).toEqual(look[field.key] as never);
            }
        }
    });
});

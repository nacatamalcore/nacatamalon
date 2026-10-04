import { describe, expect, it } from 'bun:test';
import { parseShaderFile } from '../src/loaders/shader/parse_shader_file';

/**
 * Reading a shader file: the comments that say what it is, and the code that says what it does.
 *
 * The one that matters most is further down: what comes out has to be what the author typed, byte
 * for byte. A parser that tidies the source is a parser that puts a reported error on the wrong
 * line, and a shader error is hard enough to read already.
 */

describe('the header', () => {
    it('reads which family the file is for', () => {
        const file = parseShaderFile('// @shader mesh3d\nfn effect(a: f32) -> f32 { return a; }', 'x.wgsl');

        expect(file.shader).toBe('mesh3d');
    });

    it('takes a file that does not say to be for sprites, which is the common one', () => {
        const file = parseShaderFile('fn effect(a: f32) -> f32 { return a; }', 'x.wgsl');

        expect(file.shader).toBe('sprite2d');
    });

    it('reads a plain number and a list, with what they start at', () => {
        const file = parseShaderFile([
            '// @uniform strength: f32 = 0.6',
            '// @uniform rim: vec4<f32> = 0.2, 0.4, 0.6, 1',
            'fn effect(a: f32) -> f32 { return a; }',
        ].join('\n'), 'x.wgsl');

        expect(file.uniforms).toEqual({ strength: 0.6, rim: [0.2, 0.4, 0.6, 1] });
        expect(file.uniformSig).toEqual({ strength: 'f32', rim: 'vec4<f32>' });
    });

    it('is happy with a file that declares no knobs at all', () => {
        const file = parseShaderFile('fn effect(a: f32) -> f32 { return a; }', 'x.wgsl');

        expect(file.uniforms).toEqual({});
    });

    it('refuses a kind it cannot lay out, and a list of the wrong length', () => {
        const bad = '// @uniform m: mat4x4<f32> = 1\nfn effect(a: f32) -> f32 { return a; }';
        expect(() => parseShaderFile(bad, 'x.wgsl')).toThrow(/can only be f32/);

        const short = '// @uniform rim: vec4<f32> = 0.2, 0.4\nfn effect(a: f32) -> f32 { return a; }';
        expect(() => parseShaderFile(short, 'x.wgsl')).toThrow(/needs 4 numbers and was given 2/);
    });
});

describe('pulling the hooks apart', () => {
    it('takes a file that only decides the colour', () => {
        const file = parseShaderFile('fn effect(a: f32) -> f32 { return a; }', 'x.wgsl');

        expect(file.fragment).toContain('fn effect');
        expect(file.vertex).toBeNull();
    });

    it('takes a file that only moves the corner', () => {
        const file = parseShaderFile('// @shader mesh3d\nfn vertex(p: f32) -> f32 { return p; }', 'x.wgsl');

        expect(file.vertex).toContain('fn vertex');
        expect(file.fragment).toBeNull();
    });

    it('gives every helper to both hooks, because neither language can import one', () => {
        const file = parseShaderFile([
            '// @shader mesh3d',
            'fn wobble(v: f32) -> f32 { return v * 2.0; }',
            'fn effect(a: f32) -> f32 { return wobble(a); }',
            'fn vertex(p: f32) -> f32 { return wobble(p); }',
        ].join('\n'), 'x.wgsl');

        expect(file.fragment).toContain('fn wobble');
        expect(file.vertex).toContain('fn wobble');
    });

    it('puts a helper before the hook that calls it, which is what GLSL insists on', () => {
        const file = parseShaderFile([
            'fn effect(a: f32) -> f32 { return wobble(a); }',
            'fn wobble(v: f32) -> f32 { return v * 2.0; }',
        ].join('\n'), 'x.wgsl');

        const fragment = file.fragment as string;
        expect(fragment.indexOf('fn wobble')).toBeLessThan(fragment.indexOf('fn effect'));
    });

    it('hands back exactly what was typed, spacing and comments included', () => {
        const hook = 'fn effect(a: f32) -> f32 {\n    // keep    this\n    return   a;\n}';
        const file = parseShaderFile(hook, 'x.wgsl');

        expect(file.fragment).toBe(hook);
    });

    it('is not fooled by a brace inside a comment', () => {
        const hook = 'fn effect(a: f32) -> f32 {\n    // a } in here\n    return a;\n}';
        const file = parseShaderFile(`${hook}\nfn after(v: f32) -> f32 { return v; }`, 'x.wgsl');

        expect(file.fragment).toContain('fn after');
        expect(file.fragment).toContain('a } in here');
    });

    it('refuses a file with no hook in it', () => {
        expect(() => parseShaderFile('fn helper(a: f32) -> f32 { return a; }', 'x.wgsl'))
            .toThrow(/defines no hook/);
    });

    it('refuses a corner hook where there are no corners to move', () => {
        const post = '// @shader post\nfn effect(a: f32) -> f32 { return a; }\nfn vertex(p: f32) -> f32 { return p; }';
        expect(() => parseShaderFile(post, 'x.wgsl')).toThrow(/no corners to move/);

        const sprite = 'fn effect(a: f32) -> f32 { return a; }\nfn vertex(p: f32) -> f32 { return p; }';
        expect(() => parseShaderFile(sprite, 'x.wgsl')).toThrow(/mesh3d/);
    });
});

describe('a file written in both languages', () => {
    const both = [
        '// @shader mesh3d',
        '// @uniform steps: f32 = 4',
        '// @wgsl',
        'fn effect(a: f32) -> f32 { return a * mu.steps; }',
        '// @glsl',
        'float effect(float a) { return a * mu.steps; }',
    ].join('\n');

    it('puts each half where its own card will look for it', () => {
        const file = parseShaderFile(both, 'x.wgsl');

        expect(file.fragment).toContain('fn effect');
        expect(file.fragmentGlsl).toContain('float effect');
        expect(file.uniforms).toEqual({ steps: 4 });
    });

    it('leaves the GLSL side empty for a file that never mentions it', () => {
        const file = parseShaderFile('fn effect(a: f32) -> f32 { return a; }', 'x.wgsl');

        expect(file.fragmentGlsl).toBeNull();
        expect(file.vertexGlsl).toBeNull();
    });

    it('refuses halves that do not define the same hooks', () => {
        const lopsided = [
            '// @shader mesh3d',
            '// @wgsl',
            'fn effect(a: f32) -> f32 { return a; }',
            'fn vertex(p: f32) -> f32 { return p; }',
            '// @glsl',
            'float effect(float a) { return a; }',
        ].join('\n');

        expect(() => parseShaderFile(lopsided, 'x.wgsl')).toThrow(/do not define the same hooks/);
    });

    it('refuses a file that only has the fallback half', () => {
        const only = '// @glsl\nfloat effect(float a) { return a; }';

        expect(() => parseShaderFile(only, 'x.wgsl')).toThrow(/@glsl half and no @wgsl one/);
    });
});

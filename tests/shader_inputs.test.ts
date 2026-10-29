import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSpriteMaterialShader, buildSpriteDistanceFieldMaterialShader } from '../src/render/webgpu/material/sprite_material_shader';
import { buildTilemapMaterialShader } from '../src/render/webgpu/material/tilemap_material_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildPostShader } from '../src/render/webgpu/post/post_shader';
import { buildSpriteMaterialShaderGlsl, buildSpriteDistanceFieldMaterialShaderGlsl } from '../src/render/webgl2/material/sprite_material_shader';
import { buildTilemapMaterialShaderGlsl } from '../src/render/webgl2/material/tilemap_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { buildPostShaderGlsl } from '../src/render/webgl2/post/post_shader';
import { ENGINE_FIELDS, POST_ENGINE_FIELDS } from '../src/render/shared/material_uniforms';

/**
 * What the engine hands a shader is written down once, in llms.txt, and a shader somebody keeps is
 * written against it. The tables there are read here and held against the shaders both cards build:
 * every name written down exists, on both, and every field of a context is written down. Renaming one
 * or adding one without a word fails here, not in somebody's game.
 */

const section = (() => {
    const text = readFileSync(join(import.meta.dir, '..', 'llms.txt'), 'utf8');
    const start = text.indexOf('## What the engine hands a shader');
    expect(start).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf('\n## ', start + 1));
})();

/**
 * The names in the first column of the table headed `heading`: `a`, `b` in one cell is two.
 */
const column = (heading: string): string[] => {
    const at = section.indexOf(`| ${heading} |`);
    expect(at).toBeGreaterThan(-1);
    const rows = section.slice(at).split('\n').slice(2);
    const names: string[] = [];
    for (const row of rows) {
        if (!row.startsWith('|')) break;
        const cell = row.split('|')[1]!;
        names.push(...[...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!));
    }
    return names;
};

/** The fields of a struct, from WGSL (`name: type,`) or GLSL (`type name;`). */
const fieldsOf = (source: string, struct: string): string[] => {
    const body = source.slice(source.indexOf(`struct ${struct} {`));
    const lines = body.slice(body.indexOf('{') + 1, body.indexOf('};')).split('\n');
    return lines
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('//'))
        .map((line) => (line.includes(':') ? line.split(':')[0]! : line.replace(';', '').split(/\s+/)[1]!).trim());
};

const WGSL_SPRITE = 'fn effect(color: vec4f, uv: vec2f) -> vec4f { return color; }';
const GLSL_SPRITE = 'vec4 effect(vec4 color, vec2 uv) { return color; }';
const WGSL_POST = 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }';

const sprites = {
    webgpu: [buildSpriteMaterialShader(WGSL_SPRITE, {}), buildSpriteDistanceFieldMaterialShader(WGSL_SPRITE, {}), buildTilemapMaterialShader(WGSL_SPRITE, {})],
    webgl2: [buildSpriteMaterialShaderGlsl(GLSL_SPRITE, {}), buildSpriteDistanceFieldMaterialShaderGlsl(GLSL_SPRITE, {}), buildTilemapMaterialShaderGlsl(GLSL_SPRITE, {})].map((s) => s.fragment),
};
const meshes = {
    webgpu: buildMeshMaterialShader(null, null, {}, ['env']),
    webgl2: buildMeshMaterialShaderGlsl(null, null, {}, ['env']),
};
const posts = {
    webgpu: buildPostShader(WGSL_POST, {}),
    webgl2: buildPostShaderGlsl('vec4 effect(vec4 color, vec2 uv) { return color; }', {}).fragment,
};

describe('what the engine hands a shader, as llms.txt writes it down', () => {
    it('puts its own parameters first in mu, the screen effect\'s two only on a screen effect', () => {
        const written = column('Name').map((name) => name.replace('mu.', ''));
        expect(written).toEqual(POST_ENGINE_FIELDS.map(([name]) => name));
        const always = ENGINE_FIELDS.map(([name]) => name);
        for (const source of [...sprites.webgpu, meshes.webgpu]) {
            for (const name of written) expect(source.includes(`${name}:`)).toBe(always.includes(name));
        }
        for (const source of [...sprites.webgl2, meshes.webgl2.fragment]) {
            for (const name of written) expect(new RegExp(`\\b${name};`).test(source)).toBe(always.includes(name));
        }
        for (const name of written) {
            expect(posts.webgpu).toContain(`${name}:`);
            expect(posts.webgl2).toMatch(new RegExp(`\\b${name};`));
        }
    });

    it('gives a model\'s corner hook every field written down, and nothing more, on both cards', () => {
        const written = column('`VertContext`').filter((name) => name !== 'VertContext');
        expect(fieldsOf(meshes.webgpu, 'VertContext')).toEqual(written);
        expect(fieldsOf(meshes.webgl2.vertex, 'VertContext')).toEqual(written);
    });

    it('gives a model\'s colour hook every field written down, and nothing more, on both cards', () => {
        const written = column('`FragContext`').filter((name) => name !== 'FragContext');
        expect(fieldsOf(meshes.webgpu, 'FragContext')).toEqual(written);
        expect(fieldsOf(meshes.webgl2.fragment, 'FragContext')).toEqual(written);
    });

    it('lets a model\'s corner hook write carry, on both cards', () => {
        expect(meshes.webgpu).toContain('var<private> carry: vec4<f32>;');
        expect(meshes.webgl2.vertex).toContain('vec4 carry = vec4(0.0);');
    });

    it('has every helper it names, on both cards', () => {
        for (const source of sprites.webgpu) expect(source).toContain('fn sampleTexture(');
        for (const source of sprites.webgl2) expect(source).toContain('vec4 sampleTexture(');
        for (const name of ['sampleTexture', 'sampleMap_env', 'envUv']) {
            expect(meshes.webgpu).toContain(`fn ${name}(`);
            expect(meshes.webgl2.fragment).toMatch(new RegExp(`\\b(vec2|vec4) ${name}\\(`));
        }
        const helpers = column('Helper').map((name) => name.slice(0, name.indexOf('(')));
        expect(helpers.length).toBe(9);
        for (const name of helpers) {
            expect(posts.webgpu).toContain(`fn ${name}(`);
            expect(posts.webgl2).toMatch(new RegExp(`\\b(int|vec3|vec4) ${name}\\(`));
        }
    });
});

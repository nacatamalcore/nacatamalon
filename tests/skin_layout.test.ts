import { describe, expect, it } from 'bun:test';
import { MESH_FRAGMENT_GLSL, MESH_VERTEX_GLSL, MESH_VERTEX_LIGHT_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { MESH_SHADER, MESH_SHADER_FRAGMENT } from '../src/render/webgpu/mesh/mesh_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { SKINNED_VERTEX_GLSL } from '../src/render/webgl2/mesh/skinned_shader';
import { SKIN_STRIDE } from '../src/geometry';

/**
 * That the two backends bend a model the same way.
 *
 * Nothing here runs a shader. What it checks is that the two say the same thing, because they are
 * written twice and the ordinary way this breaks is one of them being changed and not the other.
 */

describe('how a corner says which bones carry it', () => {
    it('is four bones and four weights, which is eight numbers', () => {
        expect(SKIN_STRIDE).toBe(8);
    });

    it('is read at the same two places by both, right after what an ordinary corner carries', () => {
        // The ordinary corner takes locations 0, 1 and 2.
        expect(SKINNED_SHADER).toContain('@location(3) bones: vec4<f32>');
        expect(SKINNED_SHADER).toContain('@location(4) weights: vec4<f32>');
        expect(SKINNED_VERTEX_GLSL).toContain('layout(location = 3) in vec4 aBones');
        expect(SKINNED_VERTEX_GLSL).toContain('layout(location = 4) in vec4 aWeights');
    });
});

describe('the weighted mix', () => {
    it('adds the four movements before moving the corner, in both', () => {
        // Moving it four times and averaging where it lands pinches the surface at every joint.
        for (const shader of [SKINNED_SHADER, SKINNED_VERTEX_GLSL]) {
            const mix = shader.slice(shader.indexOf('skin ='), shader.indexOf('skin =') + 260);
            expect(mix).toContain('.x *');
            expect(mix).toContain('.y *');
            expect(mix).toContain('.z *');
            expect(mix).toContain('.w *');
            expect(mix.split('+').length).toBe(4);
        }
    });

    it('turns the way a surface faces by the same mix, with the move dropped', () => {
        // The 3x3 corner of the mixture: a direction has no place, and without this an arm bends
        // and is lit as though it never had.
        expect(SKINNED_SHADER).toContain('mat3x3<f32>(skin[0].xyz, skin[1].xyz, skin[2].xyz) * normal');
        expect(SKINNED_VERTEX_GLSL).toContain('mat3(skin) * aNormal');
    });
});

describe('what the two shaders share with the ones that do not bend', () => {
    it('paints with exactly the same words, on both cards', () => {
        // Not "the same to look at": the same string. Bending happens to corners, and by the time
        // anything is painted there is nothing left to disagree about.
        expect(SKINNED_SHADER.endsWith(MESH_SHADER_FRAGMENT)).toBe(true);
        expect(MESH_SHADER.endsWith(MESH_SHADER_FRAGMENT)).toBe(true);
        expect(SKINNED_VERTEX_GLSL.endsWith(MESH_VERTEX_LIGHT_GLSL)).toBe(true);
        expect(MESH_VERTEX_GLSL.endsWith(MESH_VERTEX_LIGHT_GLSL)).toBe(true);
    });

    it('works out the light from the same two things, however the corner got there', () => {
        for (const shader of [SKINNED_SHADER, MESH_SHADER]) {
            expect(shader).toContain('let viewDir = normalize(uniforms.cameraPosition.xyz - worldPos);');
        }
        // And by the same name in both languages, which is not a detail: a material is written
        // once and compiled on either card, so a block called `u` here and `uniforms` there would
        // be a shader that works on one machine and fails on the other for no visible reason.
        expect(MESH_VERTEX_LIGHT_GLSL).toContain('vec3 viewDir = normalize(uniforms.cameraPosition.xyz - worldPos);');
    });

    it('reads the same block of numbers per model, so one packer fills both', () => {
        expect(SKINNED_SHADER).toContain('uniforms.mvp');
        expect(SKINNED_VERTEX_GLSL).toContain('uniforms.mvp');
        // And the fragment stage of the GLSL pair is literally the one object.
        expect(MESH_FRAGMENT_GLSL).toContain('#version 300 es');
    });
});

describe('where the bones come from', () => {
    it('is a run as long as the rig needs on the card that has them', () => {
        // Not a block of a size chosen in advance: how many bones a model has is not known until
        // its file arrives.
        expect(SKINNED_SHADER).toContain('var<storage, read> joints: array<mat4x4<f32>>');
        expect(SKINNED_SHADER).not.toContain('array<mat4x4<f32>, ');
    });

    it('is a picture of numbers on the card that has no such run, read by position', () => {
        expect(SKINNED_VERTEX_GLSL).toContain('uniform highp sampler2D uJoints');
        // texelFetch, not texture(): nothing is blurred, wrapped or mipmapped.
        expect(SKINNED_VERTEX_GLSL).toContain('texelFetch(uJoints');
        expect(SKINNED_VERTEX_GLSL).not.toContain('texture(uJoints');
    });

    it('reads four dots a bone, one for each column of its matrix', () => {
        expect(SKINNED_VERTEX_GLSL).toContain('int x = bone * 4;');
        const fetches = SKINNED_VERTEX_GLSL.split('texelFetch(uJoints').length - 1;
        expect(fetches).toBe(4);
    });
});

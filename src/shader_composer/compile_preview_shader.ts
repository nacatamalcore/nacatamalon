import { composerFloat, composerVec3, composerVec4 } from './constructors';
import { collectHelpers, collectUniforms, emitBody } from './emit';
import { WGSL_TARGET } from './targets/wgsl';
import { GLSL_TARGET } from './targets/glsl';
import type { TMaterialShader, TUniformValues } from '../materials/types/t_uniforms';
import type { TComposerNode } from './types/t_composer_node';

/**
 * Makes any value something that can be seen, by its type: a number as grey, a `vec2` as red and
 * green, a `vec3` as a colour, a `vec4` as itself.
 *
 * It is the convention every node editor uses, and it is what lets one small picture show a mask,
 * a coordinate or a colour without being told which. Alpha is solid for everything but a `vec4`,
 * so a picture never vanishes because the value happened to be zero.
 */
const asPreviewColor = (n: TComposerNode): TComposerNode => {
    switch (n.type) {
        case 'f32':
            return composerVec4(composerVec3(n), composerFloat(1));
        case 'vec2<f32>':
            return composerVec4(n, composerFloat(0), composerFloat(1));
        case 'vec3<f32>':
            return composerVec4(n, composerFloat(1));
        default:
            return n;
    }
};

/**
 * Turns one value of a graph into a sprite colour hook that shows it: the small picture an editor
 * draws next to the node that made it.
 *
 * It is the same writer the real stages use, only pointed at the preview stage, so a picture is
 * worked out by the code the material will run. Every leaf has an answer there: one that reads
 * which way a surface faces, or the light, is shown on a pretend sphere rather than failing, which
 * is the difference between a picture on every node and a picture on the 2D ones only.
 *
 * For an editor's thumbnails, not for a game, and with no promise between versions.
 *
 * @param value The value to show.
 * @param language Which language to write it in: `'wgsl'` unless asked, or `'glsl'` for WebGL2.
 * @returns A sprite shader that draws it, and the parameters it reads.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const compilePreviewShader = (
    value: TComposerNode,
    language: 'wgsl' | 'glsl' = 'wgsl',
): { shader: TMaterialShader; fragment: string; vertex: null; uniforms: TUniformValues } => {
    // The language by name: the table that writes each one is the compiler's own business.
    const target = language === 'glsl' ? GLSL_TARGET : WGSL_TARGET;
    const body = emitBody(asPreviewColor(value), 'preview.frag', target);
    const helpers = collectHelpers([value], target).join('\n\n');

    return {
        shader: 'sprite2d',
        fragment: [target.previewPrelude, helpers, target.fn('sprite2d.frag', body.lines, body.result)]
            .filter((part) => part.length > 0)
            .join('\n\n'),
        vertex: null,
        uniforms: collectUniforms([value]),
    };
};

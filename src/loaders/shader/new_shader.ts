import { markWatchable } from '../../store/record_version';
import type { TShader } from './types/t_shader';

/**
 * The empty shader record, handed back the moment one is asked for and filled in when it lands.
 *
 * Everything about the source starts empty, and that is a working state rather than a half-built
 * one: a material with nothing to compile is drawn with the built-in shader, so the first frames of
 * a scene look like the scene without its effect instead of looking like nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newShader = (src: string, key: string, glslSrc: string | null = null): TShader => markWatchable({
    type: 'shader',
    key,
    src,
    glslSrc,
    status: 'loading',
    shader: 'sprite2d',
    fragment: null,
    fragmentGlsl: null,
    vertex: null,
    vertexGlsl: null,
    uniforms: {},
    uniformSig: {},
    bound: [],
});

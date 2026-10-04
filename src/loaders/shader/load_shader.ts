import { bumpVersion } from '../../store/record_version';
import { parseShaderSource } from './parse_shader_source';
import { parseShaderFile } from './parse_shader_file';
import { syncBoundTargets } from './sync_bound_targets';
import type { TParsedShader } from './types/t_parsed_shader';
import type { TRuntimeStore } from '../../store';
import type { TShader } from './types/t_shader';

const fetchText = async (src: string): Promise<string> => {
    const response = await fetch(src);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
};

/**
 * Folds a separate GLSL file into what the WGSL one said, checking they are the same shader first.
 *
 * The second file is read by the same reader, so it carries its own header, and then that header is
 * thrown away: the WGSL file owns the contract. It is read rather than trusted because the two would
 * otherwise be free to disagree about what the knobs are, and the card that noticed would be the one
 * nobody tested on.
 */
const mergeGlsl = (wgsl: TParsedShader, glsl: TParsedShader, src: string, glslSrc: string): TParsedShader => {
    if (wgsl.shader !== glsl.shader) {
        throw new Error(
            `'${glslSrc}' is for ${glsl.shader} and '${src}' is for ${wgsl.shader}, so they are not two ` +
            'halves of one shader',
        );
    }

    const names = (parsed: TParsedShader) => Object.keys(parsed.uniformSig).sort().join(', ');
    if (names(wgsl) !== names(glsl)) {
        throw new Error(
            `'${glslSrc}' and '${src}' declare different parameters (${names(glsl)} against ${names(wgsl)})`,
        );
    }

    for (const stage of ['fragment', 'vertex'] as const) {
        if ((wgsl[stage] !== null) !== (glsl[stage] !== null)) {
            throw new Error(
                `'${glslSrc}' and '${src}' do not define the same hooks: one has a ${stage} and the other ` +
                'does not',
            );
        }
    }

    return { ...wgsl, fragmentGlsl: glsl.fragment, vertexGlsl: glsl.vertex };
};

/**
 * Fetches a shader file, reads it, and pours it into every material already built on it.
 *
 * The two files, when there are two, are fetched **at the same time**: they are independent and one
 * after the other would be twice the wait for no reason.
 *
 * Never rejects. A file that is missing, or that cannot be read, ends as `'error'` with a warning,
 * and every material that was waiting on it goes on drawing with the built-in shader. An effect that
 * did not arrive should cost you the effect, not the game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadShader = async (store: TRuntimeStore, shader: TShader): Promise<void> => {
    try {
        // A graph already gives both languages, so a second file could only contradict it.
        if (shader.src.endsWith('.shader') && shader.glslSrc !== null) {
            throw new Error(
                `'${shader.src}' is a node graph, which writes its own GLSL, so it takes no glslSrc ('${shader.glslSrc}')`,
            );
        }

        const [source, glslSource] = await Promise.all([
            fetchText(shader.src),
            shader.glslSrc === null ? Promise.resolve(null) : fetchText(shader.glslSrc),
        ]);

        let parsed = parseShaderSource(source, shader.src);
        if (glslSource !== null && shader.glslSrc !== null) {
            parsed = mergeGlsl(parsed, parseShaderFile(glslSource, shader.glslSrc), shader.src, shader.glslSrc);
        }

        // The game may have been thrown away while the bytes were in the air.
        if (store.get('loop').destroyed) {
            return;
        }

        shader.shader = parsed.shader;
        shader.fragment = parsed.fragment;
        shader.fragmentGlsl = parsed.fragmentGlsl;
        shader.vertex = parsed.vertex;
        shader.vertexGlsl = parsed.vertexGlsl;
        shader.uniforms = parsed.uniforms;
        shader.uniformSig = parsed.uniformSig;
        shader.status = 'ready';
        bumpVersion(shader);

        syncBoundTargets(shader);
    } catch (error) {
        shader.status = 'error';
        bumpVersion(shader);
        console.warn(
            `[NacatamalOn] useLoadShader: '${shader.src}' could not be loaded. Anything using it draws ` +
            'with the built-in shader instead.',
            error,
        );
    }
};

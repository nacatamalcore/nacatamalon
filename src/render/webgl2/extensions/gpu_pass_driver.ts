import { createGpuPassHost } from '../../extensions/gpu_pass_host';
import { createWebGL2RenderTexture, destroyWebGL2Texture } from '../resources';
import { toGlTexture } from '../texture';
import { createGlGuard } from './guard_gl_state';
import type { TGlGuard } from './guard_gl_state';
import type { TWebGL2Texture } from '../texture';
import type { TWebGL2State } from '../types/t_webgl2_state';

/**
 * The passes of a WebGL2 game. Their pictures are the engine's own render textures, listed with the
 * rest so a lost context finds them. Everything a pass runs goes through a `createGlGuard`, and the
 * pass is handed the guard's `gl`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGL2PassHost = (state: TWebGL2State) => {
    const { gl } = state;
    // Made the first time a pass runs with the context there: a lost one answers its limits with
    // nothing. A restored context is the same object, so one guard serves the game's whole life.
    let guard: TGlGuard | null = null;
    const ready = (): TGlGuard => (guard ??= createGlGuard(gl));
    return createGpuPassHost({
        backend: 'WEBGL2',
        guard: (callback, everyFrame) => (gl.isContextLost() ? callback() : ready().run(callback, !everyFrame)),
        isLost: () => gl.isContextLost(),
        setup: (options, records) => {
            const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
            const outputs: WebGLTexture[] = [];
            for (const record of records) {
                if (record.width > limit || record.height > limit) {
                    throw new Error(`[NacatamalOn] useGpuPass '${options.name}': an output of ${record.width}x${record.height} is bigger than this card allows (${limit}). Make it smaller.`);
                }
                record.gpu = createWebGL2RenderTexture(gl, record.width, record.height);
                state.textures.add(record.gpu as TWebGL2Texture);
                outputs.push(toGlTexture(record.gpu)!);
            }
            const instance = options.webgl2!({
                backend: 'WEBGL2',
                gl: ready().gl,
                outputs,
                texture: (record) => record.status === 'ready' && record.gpu !== null ? toGlTexture(record.gpu) : null,
            });
            if (!instance || typeof instance.render !== 'function') {
                throw new Error(`[NacatamalOn] useGpuPass '${options.name}': its webgl2 factory returned no render. Return { render, destroy? } from it.`);
            }
            return { render: (frame) => instance.render(frame), destroy: () => instance.destroy?.() };
        },
        release: (records) => {
            for (const record of records) {
                if (record.gpu !== null) destroyWebGL2Texture(state, record.gpu);
            }
        },
    });
};

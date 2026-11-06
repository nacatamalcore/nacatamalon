import type { IRenderer } from '../interface';
import type { TWebGPUState } from '../webgpu/types/t_webgpu_state';
import type { TWebGL2State } from '../webgl2/types/t_webgl2_state';

/**
 * A renderer's backend and its state, which only `useGpuPass` reaches for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassAccess =
    | { backend: 'WEBGPU'; state: TWebGPUState }
    | { backend: 'WEBGL2'; state: TWebGL2State };

const access = new WeakMap<IRenderer, TGpuPassAccess>();

/**
 * The backend and state behind a renderer, or `undefined` for one with no GPU.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gpuPassAccessOf = (renderer: IRenderer): TGpuPassAccess | undefined => access.get(renderer);

/**
 * Notes what is behind a renderer, for `useGpuPass` to find. Only this little goes into every
 * game: what runs the passes, and what keeps the GL state safe from them, comes in with the door, so
 * a game that never imports it never carries them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const attachGpuPassAccess = <T extends IRenderer>(renderer: T, context: TGpuPassAccess): T => {
    access.set(renderer, context);
    return renderer;
};

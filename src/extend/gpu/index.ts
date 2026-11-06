/**
 * `nacatamalon/extend/gpu`: work of a plugin's own on the GPU, run by the engine once a frame.
 * For whoever writes a plugin that needs what a material or a post effect cannot do (a simulation
 * in compute, a picture worked out on the GPU), never for a game: a game uses the hook that plugin
 * exports, which hands back ordinary `TTexture`s.
 *
 * It is a door of its own, apart from `nacatamalon/extend`, because it names WebGPU's types and
 * hands over the GPU itself: a plugin that does not draw never sees either.
 *
 * @experimental It can change from one version to the next.
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { useGpuPass } from './use_gpu_pass';
export type {
    TGpuPassOptions, TGpuPassHandle, TGpuPassOutput, TGpuPassFrame,
    TWebGpuPassContext, TWebGpuPass, TWebGl2PassContext, TWebGl2Pass,
} from './types';

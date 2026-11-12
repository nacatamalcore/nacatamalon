/**
 * `nacatamalon/extend/gpu`: work of a plugin's own on the GPU. For whoever writes a plugin that needs
 * what a material or a post effect cannot do, never for a game: a game uses the hooks that plugin
 * exports.
 *
 * Two things live here. A pass of the plugin's own, run once a frame (`useGpuPass`): a simulation in
 * compute, a picture worked out on the GPU, handed back as ordinary `TTexture`s. And a kind of drawing
 * the engine does not know (`registerDrawableKind`, `createDrawable`): placed, ordered, lit and
 * shadowed by the engine like a model, and drawn by the plugin's own pipeline inside the engine's
 * passes.
 *
 * It is a door of its own, apart from `nacatamalon/extend`, because it names WebGPU's types and
 * hands over the GPU itself: a plugin that does not draw never sees either.
 *
 * **What it promises.** The shapes here are kept as they are until 2.0. So are the shader pieces it
 * hands over (`context.lights`, `context.lights2d`, `context.shading`) by name: until 2.0, a field of
 * their structs or a function in them is only ever added, never taken away, renamed or given other
 * arguments, and what a field means does not change. A kind reads them through the declarations the
 * engine hands it, by name, never by where a number sits in a block, and sizes what holds a block by
 * the `floats` it is told, so a field added moves nothing it reads.
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { useGpuPass } from './use_gpu_pass';
export type {
    TGpuPassOptions, TGpuPassHandle, TGpuPassOutput, TGpuPassFrame,
    TWebGpuPassContext, TWebGpuPass, TWebGl2PassContext, TWebGl2Pass,
} from './types';

// A kind of drawing of the plugin's own, drawn in the engine's passes beside its models.
export { registerDrawableKind, createDrawable } from '../../gameobjects/custom';
export type { TCreateDrawableOptions, TCustomDrawable } from '../../gameobjects/custom';
export type {
    TDrawableKind, TDrawableBounds, TDrawableCamera, TDrawableStyle, TWebGpuDrawableContext, TWebGpuDrawables, TWebGpuDrawablePass, TWebGpuDrawableView,
    TWebGpuDrawableShadow, TWebGl2DrawableContext, TWebGl2Drawables, TWebGl2DrawablePass, TWebGl2DrawableView,
} from './drawable_types';

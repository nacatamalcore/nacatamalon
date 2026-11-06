import { gpuPassAccessOf } from '../../render/extensions/gpu_pass_bridge';
import { createWebGPUPassHost } from '../../render/webgpu/extensions/gpu_pass_driver';
import { createWebGL2PassHost } from '../../render/webgl2/extensions/gpu_pass_driver';
import { getActiveBox, getActiveGame } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { gpuPassHostOf, attachGpuPassHost, inertGpuPass } from '../../render/extensions/gpu_pass_host';
import type { TBox } from '../../box';
import type { TRuntimeStore } from '../../store';
import type { TGpuPassOptions, TGpuPassHandle } from './types';

/**
 * Says what is wrong with a pass before anything of the GPU is touched, so a mistake fails where
 * it was written and not in the middle of a frame.
 */
const checkOptions = (options: TGpuPassOptions): void => {
    if (!options || typeof options.name !== 'string' || options.name.trim() === '') {
        throw new Error('[NacatamalOn] useGpuPass: the pass has no name. Give it one, for its errors and warnings to say which pass they mean.');
    }
    const who = `useGpuPass '${options.name}'`;
    if (options.stage !== undefined && options.stage !== 'before' && options.stage !== 'after') {
        throw new Error(`[NacatamalOn] ${who}: there is no stage '${options.stage}'. Use 'before' or 'after'.`);
    }
    const notFunction = (factory: unknown) => factory !== undefined && typeof factory !== 'function';
    if (notFunction(options.webgpu) || notFunction(options.webgl2)) {
        throw new Error(`[NacatamalOn] ${who}: webgpu and webgl2 have to be functions. Give each a function that returns { render, destroy? }.`);
    }
    if (!options.webgpu && !options.webgl2) {
        throw new Error(`[NacatamalOn] ${who}: it says how to do it on no backend. Give it webgpu, webgl2 or both.`);
    }
    for (const output of options.outputs ?? []) {
        const whole = (n: number) => Number.isSafeInteger(n) && n >= 1;
        if (!output || !whole(output.width) || !whole(output.height)) {
            throw new Error(`[NacatamalOn] ${who}: an output's width and height have to be whole numbers of pixels, 1 or more. Fix the size in outputs.`);
        }
    }
};

/**
 * Whether the pass's scene draws this frame, and its clock: a scene that is gone, not running yet
 * or held behind a transition runs none of its passes; a paused one runs them with its time
 * stopped.
 */
const sceneClock = (box: TBox, store: TRuntimeStore) => (frame: { time: number; delta: number }): boolean => {
    let root = box;
    for (;;) {
        if (root.destroyed) return false;
        if (root.parent === null) break;
        root = root.parent;
    }
    if (root.held || !store.get('world').scenes.includes(root)) return false;
    frame.time = root.time;
    if (root.paused) frame.delta = 0;
    return true;
};

/**
 * Work of a plugin's own on the GPU, run once a frame for as long as the component that asked for
 * it lives: a simulation in compute, a picture worked out on the GPU, anything a material or a post
 * effect cannot do. What it draws into comes back as the game's own pictures, for sprites, models
 * and materials.
 *
 * Each backend has a factory, run once when the pass is made, that makes what the pass needs and
 * returns what it does each frame. They get the GPU itself, not a copy: a pass can break what the
 * engine draws if it changes what is not its own. WebGL2 puts back the engine's bindings and
 * drawing state around everything the pass runs; WebGPU hands it the frame's encoder with nothing
 * of the engine's open.
 *
 * A pass that throws is turned off and said once, and the rest go on; what it already recorded
 * stays recorded. On WebGPU, one that throws with a pass of its own still open leaves the frame's
 * encoder unusable, and that one frame is lost, the engine's drawing too. A game run headless has
 * no GPU: the pass never runs, says so once, and its pictures are never ready.
 *
 * @example
 * ```ts
 * const pass = useGpuPass({
 *     name: 'green',
 *     outputs: [{ width: 64, height: 64 }],
 *     webgl2: ({ gl, outputs }) => {
 *         const framebuffer = gl.createFramebuffer();
 *         gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
 *         gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputs[0], 0);
 *         return {
 *             render: () => {
 *                 gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
 *                 gl.clearColor(0, 1, 0, 1);
 *                 gl.clear(gl.COLOR_BUFFER_BIT);
 *             },
 *             destroy: () => gl.deleteFramebuffer(framebuffer),
 *         };
 *     },
 * });
 * createSprite({ texture: pass.outputs[0] });
 * ```
 *
 * @param options Its name, when it runs, the pictures it draws into, and how on each backend.
 * @returns Its pictures, the switch that turns it off, and `destroy`.
 * @experimental It can change from one version to the next.
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useGpuPass = (options: TGpuPassOptions): TGpuPassHandle => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) throw outsideSceneBody('useGpuPass');
    checkOptions(options);

    const renderer = store.get('screen').renderer;
    let host = gpuPassHostOf(renderer);
    // The first pass of a game makes what runs them. A game that never makes one never has it,
    // and the frame only asks whether it is there.
    if (host === undefined) {
        const access = gpuPassAccessOf(renderer);
        if (access !== undefined) {
            host = access.state.gpuPasses ??= access.backend === 'WEBGPU'
                ? createWebGPUPassHost(access.state.device)
                : createWebGL2PassHost(access.state);
            // Made while the context is lost: it waits for it to come back.
            if (access.backend === 'WEBGL2' && access.state.lost) host.reset();
            attachGpuPassHost(renderer, host);
        }
    }
    const handle = host === undefined ? inertGpuPass(options) : host.add(options, sceneClock(box, store));
    box.cleanups.push(handle.destroy);
    return handle;
};

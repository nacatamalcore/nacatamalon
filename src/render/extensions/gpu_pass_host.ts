import { newTexture } from '../../loaders/texture/new_texture';
import { markMadeTexture } from '../../loaders/texture/made_texture';
import type { TTexture } from '../../loaders';
import type { IRenderer } from '../interface';
import type { TGpuPassOptions, TGpuPassHandle, TGpuPassFrame } from '../../extend/gpu/types';

/**
 * The frame as a pass is told it, filled in again for each pass: the scene's own time goes in
 * after the frame's, because each pass belongs to a scene and not to a camera.
 */
type TPassClock = { time: number; delta: number; width: number; height: number };

/**
 * A pass as made by its backend, with the encoder WebGPU hands it.
 */
type TInstance = { render(frame: TGpuPassFrame, encoder?: unknown): void; destroy?(): void };

/**
 * One pass, as the host keeps it.
 */
type TEntry = {
    options: TGpuPassOptions;
    handle: TGpuPassHandle;
    /**
     * Whether its scene draws this frame, writing the scene's clock into the frame if it does.
     */
    active(frame: TPassClock): boolean;
    /**
     * `null` before it is made, after it is let go of, and while the GL context is lost.
     */
    instance: TInstance | null;
    /**
     * It threw: it stays off until it is made again from a new component.
     */
    failed: boolean;
};

/**
 * What a backend does for the host: make a pass and its pictures, let go of the pictures, and run
 * the pass's code with its own state kept apart from the engine's. `everyFrame` says the code is a
 * frame's `render`, where keeping the state has to cost next to nothing; making and letting go of a
 * pass happen once, and can afford to be careful.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassDriver = {
    backend: 'WEBGPU' | 'WEBGL2';
    setup(options: TGpuPassOptions, outputs: readonly TTexture[]): TInstance;
    release(outputs: readonly TTexture[]): void;
    guard<T>(callback: () => T, everyFrame?: boolean): T;
    /**
     * The context is lost right now. The browser says so a moment before it tells the page, and a
     * pass made in that moment waits like one made after.
     */
    isLost?(): boolean;
};

/**
 * The passes of one renderer, and what the frame asks of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassHost = {
    add(options: TGpuPassOptions, active: TEntry['active']): TGpuPassHandle;
    /**
     * Runs the passes of one stage, in the order they were made.
     */
    run(stage: 'before' | 'after', time: number, delta: number, width: number, height: number, encoder?: unknown): void;
    /**
     * The GL context was lost: every pass lets go of what it made and waits.
     */
    reset(): void;
    /**
     * The GL context came back: every pass is made again, with the same pictures.
     */
    restore(): void;
    /**
     * The frame was sent to the GPU: what was let go of during it can go now.
     */
    endFrame(): void;
    destroy(): void;
};

const hosts = new WeakMap<IRenderer, TGpuPassHost>();
let nextOutput = 0;

const makeOutputs = (options: TGpuPassOptions): TTexture[] => (options.outputs ?? []).map(({ width, height }) => {
    const texture = newTexture('', `gpu-pass:${++nextOutput}`);
    texture.width = width;
    texture.height = height;
    markMadeTexture(texture);
    return texture;
});

const releaseRecords = (outputs: readonly TTexture[], status: 'loading' | 'error' | 'released'): void => {
    for (const texture of outputs) {
        texture.gpu = null;
        texture.status = status;
    }
};

/**
 * The host of a renderer's passes, if it has made one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gpuPassHostOf = (renderer: IRenderer): TGpuPassHost | undefined => hosts.get(renderer);

/**
 * A pass on a renderer with no GPU, the headless one: it never runs, and its pictures are never
 * ready. Headless says it is WebGPU, which does not mean it has a device.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const inertGpuPass = (options: TGpuPassOptions): TGpuPassHandle => {
    const outputs = makeOutputs(options);
    releaseRecords(outputs, 'error');
    console.warn(`[NacatamalOn] useGpuPass '${options.name}': this game draws with no GPU, so the pass never runs and its pictures are never ready. Draw it on a game in a browser.`);
    return { outputs, enabled: false, destroy: () => releaseRecords(outputs, 'released') };
};

/**
 * The passes of one renderer. Nothing is made until a pass is: a game with none pays two checks a
 * frame for them, and nothing else.
 *
 * A pass let go of while the frame runs (by its own `render`, or by another pass) keeps what it made
 * until the frame is sent: the commands already recorded may still read it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGpuPassHost = (driver: TGpuPassDriver): TGpuPassHost => {
    let entries: Set<TEntry> | null = null;
    let destroyed = false;
    // The GL context is lost: passes made now wait for it to come back.
    let suspended = false;
    let executing = false;
    // What waits for the end of the frame to be let go of, and what its pictures say afterwards.
    let retired: Map<TEntry, 'error' | 'released'> | null = null;
    const clock: TPassClock = { time: 0, delta: 0, width: 0, height: 0 };

    // Lets go of what a pass made and of its pictures. Its pictures always end up let go of, even
    // when its own `destroy` throws.
    const dispose = (entry: TEntry, status: 'loading' | 'error' | 'released'): void => {
        const instance = entry.instance;
        entry.instance = null;
        try {
            if (instance?.destroy) driver.guard(() => instance.destroy!());
        } catch (error) {
            console.error(`[NacatamalOn] useGpuPass '${entry.options.name}': its destroy threw. Its pictures are let go of anyway.`, error);
        } finally {
            try {
                driver.guard(() => driver.release(entry.handle.outputs));
            } catch (error) {
                console.error(`[NacatamalOn] useGpuPass '${entry.options.name}': its pictures could not be let go of on the GPU. They are marked as gone anyway.`, error);
            } finally {
                releaseRecords(entry.handle.outputs, status);
            }
        }
    };

    // Makes a pass on the GPU. If its factory throws, what was made for it is let go of before the
    // error goes on to whoever made the pass.
    const setup = (entry: TEntry): void => {
        try {
            entry.instance = driver.guard(() => driver.setup(entry.options, entry.handle.outputs));
            if (!entry.instance || typeof entry.instance.render !== 'function') {
                throw new Error(`[NacatamalOn] useGpuPass '${entry.options.name}': its factory returned no render. Return { render, destroy? } from it.`);
            }
            for (const output of entry.handle.outputs) output.status = 'ready';
        } catch (error) {
            dispose(entry, 'error');
            throw error;
        }
    };

    const host: TGpuPassHost = {
        add: (given, active) => {
            if (destroyed) {
                throw new Error(`[NacatamalOn] useGpuPass '${given.name}': the game it was made in has stopped drawing. Make the pass in a running game.`);
            }
            const factory = driver.backend === 'WEBGPU' ? given.webgpu : given.webgl2;
            if (!factory) {
                throw new Error(`[NacatamalOn] useGpuPass '${given.name}': this game draws with ${driver.backend}, and the pass says nothing for it. Give it ${driver.backend === 'WEBGPU' ? 'webgpu' : 'webgl2'}.`);
            }
            // A copy, so changing the options afterwards changes neither when it runs nor what it
            // lets go of.
            const options = { ...given, outputs: given.outputs?.map((output) => ({ ...output })) };
            let removed = false;
            const handle: TGpuPassHandle = {
                outputs: makeOutputs(options),
                enabled: true,
                destroy: () => {
                    if (removed) return;
                    removed = true;
                    handle.enabled = false;
                    entries?.delete(entry);
                    if (executing) {
                        (retired ??= new Map()).set(entry, 'released');
                    } else {
                        retired?.delete(entry);
                        dispose(entry, 'released');
                    }
                },
            };
            const entry: TEntry = { options, handle, active, instance: null, failed: false };
            if (!suspended && !driver.isLost?.()) setup(entry);
            (entries ??= new Set()).add(entry);
            return handle;
        },
        run: (stage, time, delta, width, height, encoder) => {
            if (entries === null || destroyed || suspended || driver.isLost?.()) return;
            for (const entry of entries) {
                if (entry.failed || !entry.handle.enabled || (entry.options.stage ?? 'before') !== stage) continue;
                clock.time = time;
                clock.delta = delta;
                clock.width = width;
                clock.height = height;
                if (!entry.active(clock)) continue;
                try {
                    if (entry.instance === null) setup(entry);
                    executing = true;
                    try {
                        driver.guard(() => entry.instance!.render(clock, encoder), true);
                    } finally {
                        executing = false;
                    }
                } catch (error) {
                    entry.failed = true;
                    entry.handle.enabled = false;
                    for (const output of entry.handle.outputs) output.status = 'error';
                    // What it made is kept until the frame is sent, since the frame may already
                    // read it, and its pictures stop being ready now, before the next frame draws
                    // them.
                    if (retired?.get(entry) !== 'released') (retired ??= new Map()).set(entry, 'error');
                    console.error(`[NacatamalOn] useGpuPass '${entry.options.name}': its render threw, so it is turned off. Fix it and make the pass again.`, error);
                }
            }
        },
        endFrame: () => {
            if (retired === null) return;
            for (const [entry, status] of retired) dispose(entry, status);
            retired.clear();
        },
        restore: () => {
            suspended = false;
            if (entries === null || destroyed) return;
            for (const entry of entries) {
                if (entry.failed || entry.instance !== null) continue;
                try {
                    setup(entry);
                } catch (error) {
                    entry.failed = true;
                    entry.handle.enabled = false;
                    console.error(`[NacatamalOn] useGpuPass '${entry.options.name}': it could not be made again when the GL context came back, so it is turned off. Fix it and make the pass again.`, error);
                }
            }
        },
        reset: () => {
            suspended = true;
            if (entries === null) return;
            for (const entry of entries) dispose(entry, entry.failed ? 'error' : 'loading');
        },
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            if (entries !== null) {
                for (const entry of entries) entry.handle.destroy();
                entries.clear();
                entries = null;
            }
            if (!executing) host.endFrame();
        },
    };
    return host;
};

/**
 * Notes the host of a renderer's passes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const attachGpuPassHost = <T extends IRenderer>(renderer: T, host: TGpuPassHost): T => {
    hosts.set(renderer, host);
    return renderer;
};

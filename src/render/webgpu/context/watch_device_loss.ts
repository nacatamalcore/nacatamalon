import { createDevice } from '../utils';
import type { TWebGPUState } from '../types/t_webgpu_state';

/**
 * Milliseconds waited before each try at another device. The first comes at once; after a crash of
 * the browser's GPU process it takes a moment to have one to give.
 */
const TRIES = [0, 200, 500, 1000, 2000, 4000];

/**
 * A card lost this many times within `WITHIN` milliseconds is not coming back for good: something the
 * game draws is what breaks it, and another try would be the same.
 */
const MOST_LOSSES = 4;
const WITHIN = 30_000;

const waited = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What the renderer does about its card being lost.
 *
 * @internal
 */
export type TDeviceLossWork = {
    /**
     * The card is gone: what the plugins made is let go of, and nothing is drawn.
     */
    lost(): void;
    /**
     * There is another device: everything is made again on it. If it throws, it counts as a try.
     */
    restore(device: GPUDevice): void;
    /**
     * No device could be had.
     */
    gaveUp(): void;
};

/**
 * Keeps the game drawing through a lost WebGPU device.
 *
 * The browser can take the card away at any moment (a driver reset, the GPU process crashing, a
 * laptop changing cards). Every call on a lost device does nothing, so frames draw nothing while
 * another device is asked for, and then everything is made again on it. The game holds the same
 * handles and never learns anything happened. WebGL2 does the same when its context comes back
 * (`watchContextLoss`).
 *
 * `deviceLost` settles only when there is no way on: with the error to show once no device can be
 * had, or the card is lost again and again; with `null` at the renderer's own `end`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const watchDeviceLoss = (
    gpu: TWebGPUState,
    work: TDeviceLossWork,
    ask: () => Promise<{ device: GPUDevice }> = createDevice,
    tries: readonly number[] = TRIES,
): { deviceLost: Promise<Error | null>; isLost(): boolean; end(): void } => {
    let ended = false;
    let settle!: (error: Error | null) => void;
    const deviceLost = new Promise<Error | null>((resolve) => { settle = resolve; });
    const losses: number[] = [];

    const giveUp = (why: string): void => {
        work.gaveUp();
        settle(new Error(`[NacatamalOn] WebGPU: the graphics card was lost (${why}) and could not be had again. The game has stopped drawing; reload the page to continue.`));
    };

    const recover = async (why: string): Promise<void> => {
        // One lost again soon after does not start from the first try, at once, every time.
        for (const pause of tries.slice(Math.min(losses.length - 1, tries.length - 1))) {
            await waited(pause);
            if (ended) return;
            let device: GPUDevice;
            try {
                ({ device } = await ask());
            } catch {
                continue;
            }
            // One given already lost, which a card on its way out may do, is not one.
            const dead = await Promise.race([device.lost.then(() => true), waited(0).then(() => false)]);
            if (ended) {
                device.destroy();
                return;
            }
            if (dead) continue;
            try {
                work.restore(device);
            } catch (error) {
                console.warn('[NacatamalOn] WebGPU: the game could not be put on the graphics card again, so it is tried once more.', error);
                device.destroy();
                continue;
            }
            gpu.lost = false;
            console.warn(`[NacatamalOn] WebGPU: the graphics card was lost (${why}), and the game goes on drawing on another.`);
            watch(device);
            return;
        }
        giveUp(why);
    };

    const watch = (device: GPUDevice): void => {
        void device.lost.then((info) => {
            // One of a try that did not work, or the renderer's own end: not news to anyone.
            if (ended || device !== gpu.device) return;
            gpu.lost = true;
            const why = info.message || info.reason;
            work.lost();
            const now = performance.now();
            losses.push(now);
            while (losses.length > 0 && now - losses[0]! > WITHIN) losses.shift();
            if (losses.length >= MOST_LOSSES) giveUp(why);
            else void recover(why);
        });
    };
    watch(gpu.device);

    return {
        deviceLost,
        isLost: () => gpu.lost,
        end: () => {
            ended = true;
            settle(null);
        },
    };
};

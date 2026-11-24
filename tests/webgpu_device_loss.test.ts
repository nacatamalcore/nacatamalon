import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { watchDeviceLoss } from '../src/render/webgpu/context/watch_device_loss';
import type { TWebGPUState } from '../src/render/webgpu/types/t_webgpu_state';

/**
 * A WebGPU device lost while the game is played: another is asked for and everything is made again
 * on it, a few times, and only when there is no way on is the game told.
 */

type TFakeDevice = { device: GPUDevice; lose(reason?: string): void; destroyed: boolean };
const fakeDevice = (): TFakeDevice => {
    let lose!: (info: unknown) => void;
    const lost = new Promise((resolve) => { lose = resolve; });
    const fake: TFakeDevice = {
        device: { lost, destroy: () => { fake.destroyed = true; lose({ reason: 'destroyed', message: '' }); } } as unknown as GPUDevice,
        lose: (reason = 'unknown') => lose({ reason, message: 'driver reset' }),
        destroyed: false,
    };
    return fake;
};
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

let warn = spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => { warn.mockRestore(); warn = spyOn(console, 'warn').mockImplementation(() => {}); });

const watched = (ask: () => Promise<{ device: GPUDevice }>, tries = [0, 0]) => {
    const first = fakeDevice();
    const gpu = { device: first.device, lost: false } as unknown as TWebGPUState;
    const did: string[] = [];
    const watch = watchDeviceLoss(gpu, {
        lost: () => did.push('lost'),
        restore: (device) => { gpu.device = device; did.push('restore'); },
        gaveUp: () => did.push('gave up'),
    }, ask, tries);
    let error: Error | null | undefined;
    void watch.deviceLost.then((e) => { error = e; });
    return { first, gpu, did, watch, error: () => error };
};

describe('a WebGPU device lost', () => {
    it('draws nothing meanwhile, and goes on on another without telling the game', async () => {
        const next = fakeDevice();
        const { first, did, watch, error } = watched(async () => ({ device: next.device }));
        first.lose();
        await Promise.resolve();
        await Promise.resolve();
        expect(watch.isLost()).toBe(true);
        await settled();
        expect(did).toEqual(['lost', 'restore']);
        expect(watch.isLost()).toBe(false);
        expect(error()).toBeUndefined();
    });

    it('asks again when there is none yet, and gives up after the last try', async () => {
        let asked = 0;
        const { first, did, watch, error } = watched(async () => { asked++; throw new Error('no adapter'); }, [0, 0, 0]);
        first.lose();
        await settled();
        expect(asked).toBe(3);
        expect(did).toEqual(['lost', 'gave up']);
        expect(watch.isLost()).toBe(true);
        expect(error()?.message).toContain('driver reset');
    });

    it('gives up on a card lost again and again', async () => {
        const made: TFakeDevice[] = [];
        const { first, did, error } = watched(async () => { const d = fakeDevice(); made.push(d); return { device: d.device }; });
        first.lose();
        for (let i = 0; i < 3; i++) { await settled(); made[i]!.lose(); }
        await settled();
        expect(did.at(-1)).toBe('gave up');
        expect(made).toHaveLength(3);
        expect(error()).toBeInstanceOf(Error);
    });

    it('is not news when the renderer ends, even while another is asked for', async () => {
        const late = fakeDevice();
        const { first, did, watch, error } = watched(async () => ({ device: late.device }), [5]);
        first.lose();
        await Promise.resolve();
        watch.end();
        await settled();
        expect(did).not.toContain('restore');
        expect(error()).toBeNull();
    });

    it('does not take a device that is already lost', async () => {
        const dead = fakeDevice();
        dead.lose();
        const good = fakeDevice();
        const given = [dead, good];
        const { first, gpu, did } = watched(async () => ({ device: given.shift()!.device }));
        first.lose();
        await settled();
        expect(did).toEqual(['lost', 'restore']);
        expect(gpu.device).toBe(good.device);
    });
});

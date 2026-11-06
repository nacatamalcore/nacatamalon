import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { useGpuPass } from '../src/extend/gpu';
import { attachGpuPassHost, createGpuPassHost } from '../src/render/extensions/gpu_pass_host';
import { createTestGame, startTestScene, takeDownTestGames } from './helpers/test_game';
import { createScene } from '../src/scene';
import { stopScene } from '../src/scene/stop_scene';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import type { TGpuPassOptions, TGpuPassFrame } from '../src/extend/gpu';
import type { TRuntimeStore } from '../src/store';

/**
 * A host over a backend with no GPU: what it is asked to make, run and let go of is written down
 * in `events`, and the passes' own factories run as they would on a card.
 */
const fakeHost = (backend: 'WEBGPU' | 'WEBGL2' = 'WEBGPU') => {
    const events: string[] = [];
    let made = 0;
    const host = createGpuPassHost({
        backend,
        guard: (callback) => {
            events.push('guard');
            return callback();
        },
        setup: (options, outputs) => {
            made++;
            for (const output of outputs) output.gpu = { resourceType: 'texture' };
            events.push(`setup:${options.name}:${made}`);
            const factory = backend === 'WEBGPU' ? options.webgpu! : options.webgl2!;
            const instance = factory({ outputs: [], backend } as never);
            return { render: (frame) => instance.render(frame as never), destroy: () => instance.destroy?.() };
        },
        release: (outputs) => {
            for (const output of outputs) if (output.gpu) events.push('release');
        },
    });
    const run = (stage: 'before' | 'after' = 'before', time = 100, delta = 0.1) => host.run(stage, time, delta, 320, 224, {});
    return { host, events, run };
};

/**
 * Starts a scene whose body runs `body`, and gives back what it returned.
 */
const inScene = <T>(store: TRuntimeStore, body: () => T, name = 'Level') => {
    let made!: T;
    const scene = startTestScene(store, name, () => {
        made = body();
        return createScene();
    });
    return { made, scene };
};

/**
 * A game whose renderer runs its passes on `fakeHost`.
 */
const gameWithHost = (backend: 'WEBGPU' | 'WEBGL2' = 'WEBGPU') => {
    const { store, renderer } = createTestGame();
    const fake = fakeHost(backend);
    attachGpuPassHost(renderer, fake.host);
    return { store, ...fake };
};

afterEach(() => {
    takeDownTestGames();
    mock.restore();
});

describe('a plugin\'s GPU pass', () => {
    it('can only be made in a scene, and says what is wrong with it before touching the GPU', () => {
        expect(() => useGpuPass({ name: 'outside', webgpu: () => ({ render() {} }) })).toThrow(/inside/);
        const wrong = [
            { name: '' },
            { name: 'bad', stage: 'middle' },
            { name: 'no backend' },
            { name: 'fraction', webgpu: () => ({}), outputs: [{ width: 2.5, height: 4 }] },
            { name: 'factory', webgpu: 1 },
        ];
        for (const options of wrong) {
            const { store } = createTestGame();
            expect(() => inScene(store, () => useGpuPass(options as TGpuPassOptions))).toThrow(/useGpuPass/);
        }
    });

    it('is made once, told its scene\'s time, and runs once a frame however many views there are', () => {
        const { store, host, run, events } = gameWithHost();
        const frames: TGpuPassFrame[] = [];
        const { scene, made } = inScene(store, () => useGpuPass({
            name: 'compute',
            outputs: [{ width: 8, height: 4 }],
            webgpu: () => ({ render: (frame) => frames.push({ ...frame }) }),
        }));
        scene.time = 3;
        const frame = createFrameContext();
        fillFrameContext(store, frame, 0.25);
        expect(frame.delta).toBe(0.25);

        frame.passes.push({}, {}, {});
        run();
        host.run('after', 100, 0.1, 320, 224);

        expect(frames).toHaveLength(1);
        expect(frames[0]).toMatchObject({ time: 3, delta: 0.1, width: 320, height: 224 });
        expect(events.filter((event) => event.startsWith('setup'))).toHaveLength(1);
        expect(made.outputs[0].status).toBe('ready');
        expect(made.outputs[0].gpu).not.toBeNull();
    });

    it('runs in its stage, in the order the passes were made, and turned off keeps what it made', () => {
        const { store, run, events } = gameWithHost();
        const order: string[] = [];
        const make = (name: string, stage: 'before' | 'after') => useGpuPass({ name, stage, webgpu: () => ({ render: () => { order.push(name); } }) });
        const { made: first } = inScene(store, () => {
            const a = make('a', 'before');
            make('b', 'after');
            make('c', 'before');
            return a;
        });

        run('before');
        run('after');
        expect(order).toEqual(['a', 'c', 'b']);

        first.enabled = false;
        run();
        first.enabled = true;
        run();
        expect(order.slice(3)).toEqual(['c', 'a', 'c']);
        expect(events.filter((event) => event.startsWith('setup'))).toHaveLength(3);
    });

    it('does not run for a scene that is held, gone or stopped, and runs with its time stopped while paused', () => {
        const { store, run } = gameWithHost();
        const deltas: number[] = [];
        const { scene } = inScene(store, () => useGpuPass({ name: 'sim', webgpu: () => ({ render: (frame) => { deltas.push(frame.delta); } }) }));

        scene.held = true;
        run();
        scene.held = false;

        scene.paused = true;
        run();
        scene.paused = false;
        run();

        scene.destroyed = true;
        run();
        scene.destroyed = false;

        store.get('world').scenes.length = 0;
        run();

        expect(deltas).toEqual([0, 0.1]);
    });

    it('goes once with its scene, and lets go of its pictures as any picture of the game', () => {
        const { store, host, run, events } = gameWithHost();
        let cleaned = 0;
        let drawn = 0;
        const { made } = inScene(store, () => useGpuPass({
            name: 'owned',
            outputs: [{ width: 4, height: 4 }],
            webgpu: () => ({ render: () => { drawn++; }, destroy: () => { cleaned++; } }),
        }));

        run();
        stopScene(store, 'Level');
        run();
        made.destroy();
        host.destroy();

        expect(drawn).toBe(1);
        expect(cleaned).toBe(1);
        expect(made.outputs[0].status).toBe('released');
        expect(made.outputs[0].gpu).toBeNull();
        expect(events.filter((event) => event === 'release')).toHaveLength(1);
    });

    it('is made again after a lost context, with the same pictures', () => {
        const { store, host } = gameWithHost();
        let built = 0;
        let cleaned = 0;
        const { made } = inScene(store, () => useGpuPass({
            name: 'restore',
            outputs: [{ width: 2, height: 2 }],
            webgpu: () => {
                built++;
                return { render() {}, destroy: () => { cleaned++; } };
            },
        }));
        const output = made.outputs[0];
        const firstGpu = output.gpu;

        host.reset();
        expect(output.status).toBe('loading');
        expect(output.gpu).toBeNull();

        host.restore();
        expect(made.outputs[0]).toBe(output);
        expect(output.gpu).not.toBe(firstGpu);
        expect(output.status).toBe('ready');
        expect(built).toBe(2);
        expect(cleaned).toBe(1);

        host.destroy();
        expect(cleaned).toBe(2);
    });

    it('made while the context is lost, waits for it to come back', () => {
        const { store, host, run } = gameWithHost();
        host.reset();
        let built = 0;
        let drawn = 0;
        const { made } = inScene(store, () => useGpuPass({
            name: 'born while lost',
            outputs: [{ width: 1, height: 1 }],
            webgpu: () => {
                built++;
                return { render: () => { drawn++; } };
            },
        }));

        run();
        expect(built).toBe(0);
        expect(made.outputs[0].status).toBe('loading');

        host.restore();
        expect(built).toBe(1);
        expect(made.outputs[0].status).toBe('ready');

        run();
        expect(drawn).toBe(1);
    });

    it('made in the moment the context is lost but the page not yet told, waits like one made after', () => {
        let lost = true;
        let built = 0;
        const host = createGpuPassHost({
            backend: 'WEBGL2',
            guard: (callback) => callback(),
            isLost: () => lost,
            setup: (options) => {
                built++;
                return options.webgl2!({} as never);
            },
            release: () => {},
        });
        const handle = host.add({ name: 'early', webgl2: () => ({ render() {} }) }, () => true);
        host.run('before', 0, 0, 1, 1);
        expect(built).toBe(0);

        // The page is told, and then the context comes back.
        host.reset();
        lost = false;
        host.restore();
        expect(built).toBe(1);
        expect(handle.enabled).toBe(true);
    });

    it('fails when it is made if it says nothing for the backend the game draws with', () => {
        const { store } = gameWithHost('WEBGL2');
        expect(() => inScene(store, () => useGpuPass({ name: 'gpu-only', webgpu: () => ({ render() {} }) }))).toThrow(/says nothing for it/);
    });

    it('never runs on a game with no GPU, even though headless says it is WebGPU', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        let built = 0;
        const { made } = inScene(store, () => useGpuPass({
            name: 'no-device',
            outputs: [{ width: 1, height: 1 }],
            webgpu: () => {
                built++;
                return { render() {} };
            },
        }));

        expect(built).toBe(0);
        expect(made.enabled).toBe(false);
        expect(made.outputs[0].status).toBe('error');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('keeps two games\' passes apart', () => {
        const games = [gameWithHost(), gameWithHost()];
        const calls = [0, 0];
        games.forEach(({ store }, i) => inScene(store, () => useGpuPass({ name: 'same-name', webgpu: () => ({ render: () => { calls[i]++; } }) })));

        games[0].run();
        games[0].host.destroy();
        games[1].run();
        games[1].run();

        expect(calls).toEqual([1, 2]);
    });

    it('turns off a pass that throws and says so once, and the others go on', () => {
        const report = spyOn(console, 'error').mockImplementation(() => {});
        const { store, host, run } = gameWithHost();
        let good = 0;
        let bad = 0;
        const { made } = inScene(store, () => {
            const broken = useGpuPass({
                name: 'broken',
                outputs: [{ width: 1, height: 1 }],
                webgpu: () => ({ render: () => {
                    bad++;
                    throw new Error('broken');
                } }),
            });
            useGpuPass({ name: 'good', webgpu: () => ({ render: () => { good++; } }) });
            return broken;
        });

        run();
        host.endFrame();
        expect(made.outputs[0].gpu).toBeNull();
        expect(made.outputs[0].status).toBe('error');

        run();
        expect(bad).toBe(1);
        expect(good).toBe(2);
        expect(made.enabled).toBe(false);
        expect(report).toHaveBeenCalledTimes(1);
    });

    it('lets go of its pictures when its factory throws', () => {
        const { store, events } = gameWithHost();
        const make = () => inScene(store, () => useGpuPass({
            name: 'bad setup',
            outputs: [{ width: 4, height: 4 }],
            webgpu: () => { throw new Error('shader rejected'); },
        }));
        expect(make).toThrow(/shader rejected/);
        expect(events.filter((event) => event === 'release')).toHaveLength(1);
    });

    it('goes on letting go of the other passes when one cannot be let go of', () => {
        const report = spyOn(console, 'error').mockImplementation(() => {});
        let released = 0;
        const host = createGpuPassHost({
            backend: 'WEBGPU',
            guard: (callback) => callback(),
            setup: () => ({ render() {} }),
            release: () => {
                if (++released === 1) throw new Error('release failed');
            },
        });
        const first = host.add({ name: 'first', outputs: [{ width: 1, height: 1 }], webgpu: () => ({ render() {} }) }, () => true);
        const second = host.add({ name: 'second', outputs: [{ width: 1, height: 1 }], webgpu: () => ({ render() {} }) }, () => true);

        host.destroy();

        expect(released).toBe(2);
        expect(first.outputs[0].status).toBe('released');
        expect(second.outputs[0].status).toBe('released');
        expect(report).toHaveBeenCalledTimes(1);
    });

    it('destroyed from its own render, waits until the frame is sent', () => {
        const { store, host, run } = gameWithHost();
        let cleaned = 0;
        const { made } = inScene(store, () => useGpuPass({
            name: 'one-shot',
            outputs: [{ width: 1, height: 1 }],
            webgpu: () => ({ render: () => { made.destroy(); }, destroy: () => { cleaned++; } }),
        }));

        run();
        expect(made.enabled).toBe(false);
        expect(cleaned).toBe(0);
        expect(made.outputs[0].gpu).not.toBeNull();

        host.endFrame();
        expect(cleaned).toBe(1);
        expect(made.outputs[0].status).toBe('released');

        run();
        host.endFrame();
        expect(cleaned).toBe(1);
    });

    it('costs a game that makes none nothing but the question', () => {
        const { host, run, events } = fakeHost();
        for (let frame = 0; frame < 3; frame++) {
            run();
            run('after');
        }
        host.reset();
        host.destroy();
        expect(events).toEqual([]);
    });
});

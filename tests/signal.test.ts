import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { setScenePaused } from '../src/scene/pause_scene';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSignal } from '../src/hooks/signal/use_signal';
import { createGameSignal } from '../src/signal';
import { destroy, flushDestroyed } from '../src/destroy';
import { createTestGame, startTestScene } from './helpers/test_game';

describe('createGameSignal', () => {
    it('tells every listener, with what it carries, in the order they connected', () => {
        const scored = createGameSignal<number>();
        const log: string[] = [];
        scored.connect((points) => { log.push(`a ${points}`); });
        scored.connect((points) => { log.push(`b ${points}`); });

        scored.emit(10);

        expect(log).toEqual(['a 10', 'b 10']);
    });

    it('works with no payload at all', () => {
        const poked = createGameSignal();
        let calls = 0;
        poked.connect(() => { calls += 1; });

        poked.emit();
        poked.emit();

        expect(calls).toBe(2);
    });

    it('stops a listener with the function connect returns, however many times it is called', () => {
        const poked = createGameSignal();
        const log: string[] = [];
        const handler = () => { log.push('same'); };
        const offFirst = poked.connect(handler);
        poked.connect(handler);

        offFirst();
        offFirst();
        poked.emit();

        // The same function connected twice is two connections, and only one was removed.
        expect(log).toEqual(['same']);
        expect(poked.size).toBe(1);
    });

    it('survives a handler that disconnects, connects another or emits again', () => {
        const poked = createGameSignal<number>();
        const log: string[] = [];

        const offSelf = poked.connect((n) => { log.push(`once ${n}`); offSelf(); });
        poked.connect((n) => {
            log.push(`main ${n}`);
            if (n === 1) {
                poked.connect((m) => { log.push(`late ${m}`); });
                poked.emit(2);
            }
        });

        poked.emit(1);

        // The late one was connected during emit(1): it hears emit(2), which started after it, but
        // not emit(1) itself.
        expect(log).toEqual(['once 1', 'main 1', 'main 2', 'late 2']);
    });

    it('does not call a listener disconnected by an earlier one in the same emit', () => {
        const poked = createGameSignal();
        const log: string[] = [];
        let offB = () => {};
        poked.connect(() => { log.push('a'); offB(); });
        offB = poked.connect(() => { log.push('b'); });

        poked.emit();

        expect(log).toEqual(['a']);
    });

    it('keeps calling the rest when one listener throws', () => {
        const poked = createGameSignal();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        const log: string[] = [];
        poked.connect(() => { throw new Error('broken'); });
        poked.connect(() => { log.push('still called'); });

        poked.emit();

        expect(log).toEqual(['still called']);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('useSignal', () => {
    it('refuses to be called outside a scene body', () => {
        const poked = createGameSignal();
        expect(() => useSignal(poked, () => {})).toThrow('[NacatamalOn] useSignal');
    });

    it('listens from a scene and stops when the scene does', () => {
        const { store } = createTestGame();
        const poked = createGameSignal();
        let calls = 0;
        startTestScene(store, 'Level', () => { useSignal(poked, () => { calls += 1; }); return createScene(); });

        poked.emit();
        stopScene(store, 'Level');
        poked.emit();

        expect(calls).toBe(1);
        expect(poked.size).toBe(0);
    });

    it('stops as soon as its object is destroyed, before the frame sweeps it away', () => {
        const { store } = createTestGame();
        const poked = createGameSignal();
        let calls = 0;
        const Listener = () => { useSignal(poked, () => { calls += 1; }); };
        let listener!: ReturnType<ReturnType<typeof useSpawn>>;
        startTestScene(store, 'Level', () => { listener = useSpawn(Listener)(); return createScene(); });

        destroy(listener);
        poked.emit();
        expect(calls).toBe(0);

        flushDestroyed(store);
        expect(poked.size).toBe(0);
    });

    it('still hears while its scene is paused', () => {
        const { store } = createTestGame();
        const poked = createGameSignal();
        let calls = 0;
        startTestScene(store, 'Level', () => { useSignal(poked, () => { calls += 1; }); return createScene(); });

        setScenePaused(store, 'Level', true);
        poked.emit();

        expect(calls).toBe(1);
    });

    it('reaches two games on the same page listening to the same signal', () => {
        const poked = createGameSignal();
        const log: string[] = [];
        const first = createTestGame().store;
        const second = createTestGame().store;
        startTestScene(first, 'Level', () => { useSignal(poked, () => { log.push('first'); }); return createScene(); });
        startTestScene(second, 'Level', () => { useSignal(poked, () => { log.push('second'); }); return createScene(); });

        poked.emit();

        expect(log).toEqual(['first', 'second']);
    });
});

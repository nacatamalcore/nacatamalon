import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene, startScene } from '../src/scene';
import { destroy } from '../src/destroy/destroy';
import { setScenePaused } from '../src/scene/pause_scene';
import { tick } from '../src/game/loop/tick';
import { useData } from '../src/hooks/state/use_data';
import { useStateMachine } from '../src/hooks/state/use_state_machine';
import { useWatch } from '../src/hooks/state/use_watch';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useScript } from '../src/hooks/script/use_script';
import { registerScript, clearScripts } from '../src/scripts';
import { serializeScene, sceneFromDoc } from '../src/scene/document';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TStateMachine } from '../src/hooks/state/use_state_machine';
import type { TSceneFn } from '../src/scene';
import type { TSceneDoc } from '../src/scene/document';
import type { TRuntimeStore } from '../src/store';

/**
 * `useStateMachine`: the order its callbacks run in, what `go` does depending on where it is called
 * from, and that it lives and dies, pauses and is saved, with the object that made it.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const frames = (store: TRuntimeStore) => {
    const ctx = createFrameContext();
    let now = 0;
    return (): void => {
        const prev = now;
        now += 16;
        tick(store, ctx, now, prev);
    };
};

const driven = (body: TSceneFn) => {
    const { store } = createTestGame({}, createFakeCanvas());
    const root = startTestScene(store, 'Level', body);
    return { store, root, frame: frames(store) };
};

/**
 * Three states that write down every call, in order.
 */
const logged = (log: string[], extra: Partial<Record<'a' | 'b' | 'c', object>> = {}) => ({
    a: { onEnter: () => log.push('enter a'), onUpdate: () => log.push('update a'), onExit: () => log.push('exit a'), ...extra.a },
    b: { onEnter: () => log.push('enter b'), onUpdate: () => log.push('update b'), onExit: () => log.push('exit b'), ...extra.b },
    c: { onEnter: () => log.push('enter c'), onUpdate: () => log.push('update c'), onExit: () => log.push('exit c'), ...extra.c },
});

let warn: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    warn?.mockRestore();
    warn = null;
    clearScripts();
});

describe('useStateMachine: starting', () => {
    it('enters its first state on the first frame, not in the body, and updates it that same frame', () => {
        const log: string[] = [];
        const { frame } = driven(() => {
            useStateMachine('a', logged(log));
            log.push('body done');
            return createScene();
        });

        expect(log).toEqual(['body done']);
        frame();
        expect(log).toEqual(['body done', 'enter a', 'update a']);
        frame();
        expect(log).toEqual(['body done', 'enter a', 'update a', 'update a']);
    });

    it('called in the body, go only picks where it starts: nothing is left or entered twice', () => {
        const log: string[] = [];
        let machine!: TStateMachine<'a' | 'b' | 'c'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', logged(log));
            machine.go('b');
            return createScene();
        });

        expect(machine.state).toBe('b');
        expect(machine.previous).toBeNull();
        frame();
        expect(log).toEqual(['enter b', 'update b']);
    });

    it('refuses a start that is not one of its states, and no states at all', () => {
        const { store } = createTestGame({}, createFakeCanvas());
        expect(() => startTestScene(store, 'A', () => {
            useStateMachine('nope' as never, { idle: {} });
            return createScene();
        })).toThrow("it starts in 'nope', which is not one of its states: 'idle'.");
        expect(() => startTestScene(store, 'B', () => {
            useStateMachine('idle' as never, {});
            return createScene();
        })).toThrow('it was given no states');
    });

    it('is refused outside a body', () => {
        expect(() => useStateMachine('a', { a: {} })).toThrow('[NacatamalOn] useStateMachine: called where nothing is being built');
    });
});

describe('useStateMachine: changing state', () => {
    it('goes out, then in, then tells; the new state updates from the next frame', () => {
        const log: string[] = [];
        let machine!: TStateMachine<'a' | 'b' | 'c'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', logged(log, { a: { onUpdate: () => { log.push('update a'); machine.go('b'); } } }));
            machine.onChange((to, from) => log.push(`changed ${from}->${to}`));
            return createScene();
        });

        frame();
        expect(log).toEqual(['enter a', 'update a', 'exit a', 'enter b', 'changed a->b']);
        expect(machine.state).toBe('b');
        expect(machine.previous).toBe('a');
        frame();
        expect(log.at(-1)).toBe('update b');
    });

    it('waits until a change is over when asked from inside one, and keeps the order asked', () => {
        const log: string[] = [];
        let machine!: TStateMachine<'a' | 'b' | 'c'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', logged(log, {
                b: { onEnter: () => { log.push('enter b'); machine.go('c'); log.push('still in b enter'); } },
            }));
            return createScene();
        });

        frame();
        log.length = 0;
        machine.go('b');
        expect(log).toEqual(['exit a', 'enter b', 'still in b enter', 'exit b', 'enter c']);
        expect(machine.state).toBe('c');
        expect(machine.previous).toBe('b');
    });

    it('a go from the first onEnter is applied before the first update', () => {
        const log: string[] = [];
        let machine!: TStateMachine<'a' | 'b' | 'c'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', logged(log, { a: { onEnter: () => { log.push('enter a'); machine.go('b'); } } }));
            return createScene();
        });

        frame();
        expect(log).toEqual(['enter a', 'exit a', 'enter b', 'update b']);
    });

    it('does nothing going where it already is, and leaves and comes back with restart', () => {
        const log: string[] = [];
        let machine!: TStateMachine<'a' | 'b' | 'c'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', logged(log));
            return createScene();
        });

        frame();
        frame();
        expect(machine.time).toBeGreaterThan(0);
        log.length = 0;
        machine.go('a');
        expect(log).toEqual([]);
        machine.go('a', { restart: true });
        expect(log).toEqual(['exit a', 'enter a']);
        expect(machine.time).toBe(0);
        expect(machine.previous).toBe('a');
    });

    it('stops two states that send to each other forever, and can change again afterwards', () => {
        let machine!: TStateMachine<'a' | 'b'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', {
                a: { onEnter: () => machine.go('b') },
                b: { onEnter: () => machine.go('a') },
            });
            machine.go('a');
            return createScene();
        });

        // The first frame enters 'a', which bounces; reported as a broken update.
        const error = spyOn(console, 'error').mockImplementation(() => {});
        frame();
        expect(error).toHaveBeenCalled();
        expect(String(error.mock.calls[0][1])).toContain('keep sending to each other, 16 changes in a row');
        error.mockRestore();
    });

    it('refuses a name it does not have, and says which it has', () => {
        let machine!: TStateMachine<'idle' | 'run'>;
        const { frame } = driven(() => {
            machine = useStateMachine('idle', { idle: {}, run: {} });
            return createScene();
        });
        frame();
        expect(() => machine.go('jum' as never)).toThrow("go('jum'), but it has no state by that name. Its states are 'idle', 'run'.");
    });

    it('is', () => {
        let machine!: TStateMachine<'a' | 'b' | 'c'>;
        driven(() => {
            machine = useStateMachine('a', { a: {}, b: {}, c: {} });
            return createScene();
        });
        expect(machine.is('a')).toBe(true);
        expect(machine.is('b', 'c')).toBe(false);
        expect(machine.is('c', 'a')).toBe(true);
    });

    it('onChange gives a way to stop listening', () => {
        const heard: string[] = [];
        let machine!: TStateMachine<'a' | 'b'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', { a: {}, b: {} });
            const off = machine.onChange((to) => { heard.push(to); off(); });
            return createScene();
        });
        frame();
        machine.go('b');
        machine.go('a');
        expect(heard).toEqual(['b']);
    });
});

describe('useStateMachine: time, pause and the object it lives in', () => {
    it('counts the seconds in the state, and they stand still in a paused scene', () => {
        let machine!: TStateMachine<'a' | 'b'>;
        let updates = 0;
        const { store, frame } = driven(() => {
            machine = useStateMachine('a', { a: { onUpdate: () => { updates++; } }, b: {} });
            return createScene();
        });

        frame();
        frame();
        const before = machine.time;
        expect(before).toBeGreaterThan(0);

        setScenePaused(store, 'Level', true);
        frame();
        frame();
        expect(machine.time).toBe(before);
        expect(updates).toBe(2);

        // In pause a click can still change it: the callbacks run there and then.
        machine.go('b');
        expect(machine.state).toBe('b');
        expect(machine.time).toBe(0);

        setScenePaused(store, 'Level', false);
        frame();
        expect(machine.time).toBeGreaterThan(0);
    });

    it('works in a piece made with useSpawn, and goes with it without calling onExit', () => {
        const log: string[] = [];
        let hero!: TStateMachine<'idle' | 'hurt'>;
        let piece: unknown;
        const Hero = () => {
            hero = useStateMachine('idle', {
                idle: { onExit: () => log.push('exit idle') },
                hurt: { onEnter: () => log.push('enter hurt') },
            });
            return { hurt: () => hero.go('hurt') };
        };
        const { frame } = driven(() => {
            piece = useSpawn(Hero, 'Hero')();
            return createScene();
        });

        frame();
        (piece as { api: { hurt: () => void } }).api.hurt();
        expect(log).toEqual(['exit idle', 'enter hurt']);

        destroy(piece as never);
        frame();
        expect(log).toEqual(['exit idle', 'enter hurt']);
        hero.go('idle');
        expect(hero.state).toBe('hurt');
    });

    it('can be watched', () => {
        const seen: string[] = [];
        let machine!: TStateMachine<'a' | 'b'>;
        const { frame } = driven(() => {
            machine = useStateMachine('a', { a: {}, b: {} });
            useWatch(() => seen.push(machine.state), [machine]);
            return createScene();
        });

        frame();
        frame();
        machine.go('b');
        frame();
        expect(seen).toEqual(['a', 'b']);
    });
});

describe('useStateMachine: an object destroyed during a change', () => {
    it('an onExit that destroys its object ends the change: nothing enters, nobody is told', () => {
        const log: string[] = [];
        const made = {} as { machine: TStateMachine<'alive' | 'dying'>; piece: unknown };
        const Guard = () => {
            made.machine = useStateMachine('alive', {
                alive: { onExit: () => { log.push('exit alive'); destroy(made.piece as never); } },
                dying: { onEnter: () => log.push('enter dying') },
            });
            made.machine.onChange(() => log.push('changed'));
        };
        const { frame } = driven(() => {
            made.piece = useSpawn(Guard)();
            return createScene();
        });

        frame();
        made.machine.go('dying');
        expect(log).toEqual(['exit alive']);
    });

    it('an object destroyed by a useUpdate before its first frame never enters its first state', () => {
        const log: string[] = [];
        const Guard = () => {
            useUpdate(() => destroy(piece as never));
            useStateMachine('idle', { idle: { onEnter: () => log.push('enter idle'), onUpdate: () => log.push('update idle') } });
        };
        let piece: unknown;
        const { frame } = driven(() => {
            piece = useSpawn(Guard)();
            return createScene();
        });

        frame();
        frame();
        expect(log).toEqual([]);
    });
});

describe('useStateMachine: saved with the object', () => {
    const save = (body: () => void): TSceneDoc => {
        const { store } = createTestGame({}, createFakeCanvas());
        const frame = frames(store);
        const root = startTestScene(store, 'Level', () => {
            body();
            return createScene();
        });
        frame();
        frame();
        return serializeScene(root);
    };

    const open = (doc: TSceneDoc) => {
        const { store } = createTestGame({}, createFakeCanvas());
        registerScene(store, doc.name, sceneFromDoc(doc));
        const root = startScene(store, doc.name);
        return { root, frame: frames(store) };
    };

    it('comes back in the state it was saved in, entering it, with its time', () => {
        const log: string[] = [];
        let machine!: TStateMachine<'idle' | 'angry'>;
        registerScript('guard', () => {
            machine = useStateMachine('idle', {
                idle: { onEnter: () => log.push('enter idle'), onUpdate: () => { if (machine.time > 0.01) machine.go('angry'); } },
                angry: { onEnter: () => log.push('enter angry') },
            });
        });

        const doc = save(() => useScript('guard'));
        expect(doc.root.data).toHaveLength(1);
        const saved = doc.root.data![0].value as { state: string; time: number };
        expect(saved.state).toBe('angry');

        log.length = 0;
        const { root, frame } = open(doc);
        expect(machine.state).toBe('angry');
        expect(machine.time).toBe(saved.time);
        frame();
        expect(log).toEqual(['enter angry']);

        // Written again, it is the same one state, not a copy next to it.
        expect(serializeScene(root).root.data).toHaveLength(1);
    });

    it('a saved state it no longer has starts it where it says, and says so', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        registerScript('guard', () => { useStateMachine('a', { a: {}, b: {} }); });
        const doc = save(() => useScript('guard'));
        doc.root.data![0].value = { state: 'gone', time: 2 };

        let machine!: TStateMachine<'a' | 'b'>;
        clearScripts();
        registerScript('guard', () => { machine = useStateMachine('a', { a: {}, b: {} }); });
        open(doc);
        expect(machine.state).toBe('a');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("it was saved in 'gone', which is not one of its states ('a', 'b'), so it starts in 'a'."));
    });
});

describe('useData in a behaviour, saved and opened again', () => {
    it('hands the behaviour back what it had, and is written once', () => {
        const read: number[] = [];
        registerScript('counter', () => {
            const [n, setN] = useData(0);
            read.push(n.value);
            if (n.value === 0) setN(5);
        });
        const { store } = createTestGame({}, createFakeCanvas());
        const root = startTestScene(store, 'Level', () => {
            useScript('counter');
            return createScene();
        });
        const doc = serializeScene(root);
        const by = root.scripts[0].id;
        expect(doc.root.data).toEqual([{ value: 5, by }]);

        const g2 = createTestGame({}, createFakeCanvas());
        registerScene(g2.store, doc.name, sceneFromDoc(doc));
        const again = serializeScene(startScene(g2.store, doc.name));
        expect(read).toEqual([0, 5]);
        expect(again.root.data).toEqual([{ value: 5, by }]);
    });

    it('keeps what no behaviour asked for, in the order it was saved', () => {
        registerScript('first', () => { useData('mine'); });
        const { store } = createTestGame({}, createFakeCanvas());
        const root = startTestScene(store, 'Level', () => {
            useScript('first');
            return createScene();
        });
        const doc = serializeScene(root);
        const by = root.scripts[0].id;
        doc.root.data = [{ value: 'was first', by }, { value: 'orphan', by }, { value: 'body' }];

        const g2 = createTestGame({}, createFakeCanvas());
        registerScene(g2.store, doc.name, sceneFromDoc(doc));
        expect(serializeScene(startScene(g2.store, doc.name)).root.data).toEqual([
            { value: 'was first', by }, { value: 'orphan', by }, { value: 'body' },
        ]);
    });

    it('gives each behaviour its own, so one that is gone does not hand its state to the next', () => {
        registerScript('gone', () => { useData({ inventory: ['sword'] }); });
        registerScript('second', () => { useData(7); });
        const { store } = createTestGame({}, createFakeCanvas());
        const root = startTestScene(store, 'Level', () => {
            useScript('gone');
            useScript('second');
            useData('body');
            return createScene();
        });
        const doc = serializeScene(root);
        const [gone, second] = root.scripts.map((attachment) => attachment.id);
        expect(doc.root.data).toEqual([
            { value: { inventory: ['sword'] }, by: gone },
            { value: 7, by: second },
            { value: 'body' },
        ]);

        // Opened where 'gone' is not registered any more.
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        clearScripts();
        const read: unknown[] = [];
        registerScript('second', () => { read.push(useData(0)[0].value); });
        const g2 = createTestGame({}, createFakeCanvas());
        registerScene(g2.store, doc.name, sceneFromDoc(doc));
        const again = serializeScene(startScene(g2.store, doc.name));
        expect(read).toEqual([7]);
        // Its entry is kept, still its own.
        expect(again.root.data).toContainEqual({ value: { inventory: ['sword'] }, by: gone });
        expect(again.root.data).toHaveLength(3);
    });

    it('hands back a copy, so the game changing its state in place leaves the document as saved', () => {
        registerScript('bag', () => {
            const [, setBag] = useData<{ items: string[] }>({ items: [] });
            setBag((bag) => { bag.items.push('x'); });
        });
        const { store } = createTestGame({}, createFakeCanvas());
        const root = startTestScene(store, 'Level', () => {
            useScript('bag');
            return createScene();
        });
        const doc = structuredClone(serializeScene(root));
        expect(doc.root.data![0].value).toEqual({ items: ['x'] });

        const g2 = createTestGame({}, createFakeCanvas());
        registerScene(g2.store, doc.name, sceneFromDoc(doc));
        const opened = startScene(g2.store, doc.name);
        expect(opened.data[0].value).toEqual({ items: ['x', 'x'] });
        expect(doc.root.data![0].value).toEqual({ items: ['x'] });
    });

    it('what a behaviour spawns keeps its own state as its body\'s, not the behaviour\'s', () => {
        registerScript('maker', () => {
            useSpawn(function Child() { useData('child'); })();
        });
        const { store } = createTestGame({}, createFakeCanvas());
        const root = startTestScene(store, 'Level', () => {
            useScript('maker');
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.root.data).toBeUndefined();
        expect(doc.root.children[0].data).toEqual([{ value: 'child' }]);
    });
});

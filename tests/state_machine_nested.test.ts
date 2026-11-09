import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene, startScene } from '../src/scene';
import { destroy } from '../src/destroy/destroy';
import { tick } from '../src/game/loop/tick';
import { useStateMachine } from '../src/hooks/state/use_state_machine';
import { useWatch } from '../src/hooks/state/use_watch';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useScript } from '../src/hooks/script/use_script';
import { registerScript, clearScripts } from '../src/scripts';
import { serializeScene, sceneFromDoc } from '../src/scene/document';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TStateMachine } from '../src/hooks/state/use_state_machine';
import type { TSceneFn } from '../src/scene';
import type { TRuntimeStore } from '../src/store';

/**
 * States inside a state: a machine that lives in one state of another, entered and left with it.
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

const logs = (log: string[], name: string) => ({
    onEnter: () => log.push(`enter ${name}`),
    onUpdate: () => log.push(`update ${name}`),
    onExit: () => log.push(`exit ${name}`),
});

type TGuard = TStateMachine<'calm' | 'combat'>;
type TCalm = TStateMachine<'patrol' | 'search'>;
type TCombat = TStateMachine<'approach' | 'swing'>;

/**
 * The guard of the design: calm (patrol, search) and combat (approach, swing), everything logged.
 */
const guarded = (log: string[], extra: { combat?: object; swing?: object; search?: object } = {}) => {
    const made = {} as { guard: TGuard; calm: TCalm; combat: TCombat };
    const game = driven(() => {
        made.guard = useStateMachine('calm', {
            calm: logs(log, 'calm'),
            combat: { ...logs(log, 'combat'), ...extra.combat },
        });
        made.calm = useStateMachine('patrol', {
            patrol: logs(log, 'patrol'),
            search: { ...logs(log, 'search'), ...extra.search },
        }, { parent: made.guard, state: 'calm' });
        made.combat = useStateMachine('approach', {
            approach: logs(log, 'approach'),
            swing: { ...logs(log, 'swing'), ...extra.swing },
        }, { parent: made.guard, state: 'combat' });
        return createScene();
    });
    return { ...game, ...made };
};

afterEach(() => {
    clearScripts();
});

describe('states inside a state', () => {
    it('come in from the outside in on the first frame, and update outside first', () => {
        const log: string[] = [];
        const { frame, calm, combat } = guarded(log);

        expect(log).toEqual([]);
        frame();
        expect(log).toEqual(['enter calm', 'enter patrol', 'update calm', 'update patrol']);
        expect(calm.active).toBe(true);
        expect(combat.active).toBe(false);
    });

    it('go out from the inside out and in from the outside in when the parent changes', () => {
        const log: string[] = [];
        const { frame, guard, calm } = guarded(log);
        frame();
        calm.go('search');
        log.length = 0;

        guard.go('combat');
        expect(log).toEqual(['exit search', 'exit calm', 'enter combat', 'enter approach']);
        // Back in, it starts over at its initial.
        log.length = 0;
        guard.go('calm');
        expect(log).toEqual(['exit approach', 'exit combat', 'enter calm', 'enter patrol']);
    });

    it('a change of the parent in its onUpdate leaves the inside unupdated until the next frame', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', {
                calm: { onUpdate: () => { log.push('update calm'); made.guard.go('combat'); } },
                combat: { onUpdate: () => log.push('update combat') },
            });
            useStateMachine('patrol', { patrol: { onUpdate: () => log.push('update patrol') } }, { parent: made.guard, state: 'calm' });
            useStateMachine('approach', {
                approach: { onEnter: () => log.push('enter approach'), onUpdate: () => log.push('update approach') },
            }, { parent: made.guard, state: 'combat' });
            return createScene();
        });

        frame();
        expect(log).toEqual(['update calm', 'enter approach']);
        frame();
        expect(log.slice(2)).toEqual(['update combat', 'update approach']);
    });

    it('go on one that is not running takes its parent there, straight into that state', () => {
        const log: string[] = [];
        const { frame, guard, combat } = guarded(log);
        frame();
        log.length = 0;

        combat.go('swing');
        expect(log).toEqual(['exit patrol', 'exit calm', 'enter combat', 'enter swing']);
        expect(guard.state).toBe('combat');
        expect(combat.state).toBe('swing');
    });

    it('before the first frame, go on one inside picks where both start', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; combat: TCombat };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', { calm: logs(log, 'calm'), combat: logs(log, 'combat') });
            made.combat = useStateMachine('approach', { approach: logs(log, 'approach'), swing: logs(log, 'swing') }, { parent: made.guard, state: 'combat' });
            made.combat.go('swing');
            return createScene();
        });

        expect(made.guard.state).toBe('combat');
        expect(made.combat.state).toBe('swing');
        frame();
        expect(log.slice(0, 2)).toEqual(['enter combat', 'enter swing']);
    });

    it('while not running: not active, at its initial, no time, in no state', () => {
        const { frame, combat } = guarded([]);
        frame();
        frame();

        expect(combat.active).toBe(false);
        expect(combat.state).toBe('approach');
        expect(combat.time).toBe(0);
        expect(combat.is('approach')).toBe(false);
    });

    it('each has its own time and its own onChange', () => {
        const heard: string[] = [];
        const { frame, guard, combat } = guarded([]);
        guard.onChange((to, from) => heard.push(`guard ${from}>${to}`));
        combat.onChange((to, from) => heard.push(`combat ${from}>${to}`));
        frame();
        guard.go('combat');
        frame();
        frame();
        combat.go('swing');
        frame();

        expect(heard).toEqual(['guard calm>combat', 'combat approach>swing']);
        expect(guard.time).toBeGreaterThan(combat.time);
        expect(combat.time).toBeGreaterThan(0);
    });

    it('a go from an inside onExit waits for the change it is in: nothing is left twice', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard };
        const game = guarded(log, {
            swing: { onExit: () => { log.push('exit swing'); made.guard.go('calm'); } },
        });
        made.guard = game.guard;
        game.frame();
        game.combat.go('swing');
        log.length = 0;

        game.combat.go('approach');
        expect(log).toEqual(['exit swing', 'enter approach', 'exit approach', 'exit combat', 'enter calm', 'enter patrol']);
    });

    it('stops a family that keeps sending to each other', () => {
        const made = {} as { guard: TGuard; combat: TCombat };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', {
                calm: { onEnter: () => made.combat.go('swing') },
                combat: {},
            });
            made.combat = useStateMachine('approach', {
                approach: {},
                swing: { onEnter: () => made.guard.go('calm') },
            }, { parent: made.guard, state: 'combat' });
            return createScene();
        });

        const error = spyOn(console, 'error').mockImplementation(() => {});
        frame();
        expect(error).toHaveBeenCalled();
        expect(String(error.mock.calls[0][1])).toContain('keep sending to each other');
        error.mockRestore();
    });

    it('goes three deep', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; combat: TCombat };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', { calm: logs(log, 'calm'), combat: logs(log, 'combat') });
            made.combat = useStateMachine('approach', { approach: logs(log, 'approach'), swing: logs(log, 'swing') }, { parent: made.guard, state: 'combat' });
            useStateMachine('wind', { wind: logs(log, 'wind'), strike: logs(log, 'strike') }, { parent: made.combat, state: 'swing' });
            return createScene();
        });
        frame();
        log.length = 0;

        made.combat.go('swing');
        expect(log).toEqual(['exit calm', 'enter combat', 'enter swing', 'enter wind']);
        log.length = 0;
        made.guard.go('calm');
        expect(log).toEqual(['exit wind', 'exit swing', 'exit combat', 'enter calm']);
    });

    it('can live in a piece of its own, and stops with it', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; piece: unknown };
        const Combat = ({ guard }: { guard: TGuard }) => {
            useStateMachine('approach', { approach: logs(log, 'approach') }, { parent: guard, state: 'combat' });
        };
        const { frame } = driven(() => {
            made.guard = useStateMachine('combat', { calm: {}, combat: {} });
            made.piece = useSpawn(Combat)({ guard: made.guard });
            return createScene();
        });

        frame();
        expect(log).toEqual(['enter approach', 'update approach']);
        destroy(made.piece as never);
        frame();
        frame();
        expect(log).toEqual(['enter approach', 'update approach']);
    });

    it('made while its parent is already there, comes in on the next frame', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard };
        const Late = ({ guard }: { guard: TGuard }) => {
            useStateMachine('approach', { approach: logs(log, 'approach') }, { parent: guard, state: 'combat' });
        };
        const { frame } = driven(() => {
            made.guard = useStateMachine('combat', { calm: {}, combat: {} });
            const spawn = useSpawn(Late);
            let once = false;
            useWatch(() => {
                if (!once) {
                    once = true;
                    spawn({ guard: made.guard });
                }
            }, [made.guard]);
            return createScene();
        });

        frame();
        frame();
        expect(log[0]).toBe('enter approach');
        frame();
        expect(log).toContain('update approach');
    });

    it('refuses a parent that is not a machine, and a state the parent does not have', () => {
        const { store } = createTestGame({}, createFakeCanvas());
        expect(() => startTestScene(store, 'A', () => {
            useStateMachine('a', { a: {} }, { parent: {} as never, state: 'x' as never });
            return createScene();
        })).toThrow('its parent is not a state machine');
        expect(() => startTestScene(store, 'B', () => {
            const guard = useStateMachine('calm', { calm: {}, combat: {} });
            useStateMachine('a', { a: {} }, { parent: guard, state: 'nope' as never });
            return createScene();
        })).toThrow("it lives in 'nope', which is not one of its parent's states: 'calm', 'combat'.");
    });

    it('is saved, each one where it was, and comes back there', () => {
        const made = {} as { guard: TGuard; combat: TCombat; log: string[] };
        registerScript('guard', () => {
            made.guard = useStateMachine('calm', { calm: {}, combat: {} });
            made.combat = useStateMachine('approach', {
                approach: {},
                swing: { onEnter: () => made.log.push('enter swing') },
            }, { parent: made.guard, state: 'combat' });
        });
        made.log = [];
        const { store } = createTestGame({}, createFakeCanvas());
        const root = startTestScene(store, 'Level', () => {
            useScript('guard');
            return createScene();
        });
        const frame = frames(store);
        frame();
        made.combat.go('swing');
        frame();
        const doc = serializeScene(root);
        expect(doc.root.data).toHaveLength(2);

        made.log = [];
        const g2 = createTestGame({}, createFakeCanvas());
        registerScene(g2.store, doc.name, sceneFromDoc(doc));
        startScene(g2.store, doc.name);
        expect(made.guard.state).toBe('combat');
        expect(made.combat.state).toBe('swing');
        frames(g2.store)();
        expect(made.log).toEqual(['enter swing']);
        expect(made.combat.time).toBeGreaterThan(0.016);
    });

    it('a sibling made late is not entered where its parent is not, nor twice', () => {
        const log: string[] = [];
        const made = {} as { p: TStateMachine<'h' | 'o'>; b: TStateMachine<'b'> };
        const Pair = ({ p }: { p: TStateMachine<'h' | 'o'> }) => {
            useStateMachine('a', { a: { onEnter: () => { log.push('enter a'); p.go('o'); }, onExit: () => log.push('exit a') } }, { parent: p, state: 'h' });
            made.b = useStateMachine('b', { b: logs(log, 'b') }, { parent: p, state: 'h' });
        };
        const { frame } = driven(() => {
            made.p = useStateMachine('h', { h: logs(log, 'h'), o: logs(log, 'o') });
            const spawn = useSpawn(Pair);
            let once = false;
            useWatch(() => {
                if (!once) {
                    once = true;
                    spawn({ p: made.p });
                }
            }, [made.p]);
            return createScene();
        });

        frame();
        frame();
        frame();
        expect(made.p.state).toBe('o');
        expect(made.b.active).toBe(false);
        log.length = 0;
        made.p.go('h');
        expect(log.filter((line) => line === 'enter b')).toHaveLength(1);
    });

    it('go in the body of one made during play does not take its parent there mid-body', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard };
        const Late = ({ guard }: { guard: TGuard }) => {
            const combat = useStateMachine('approach', { approach: {}, swing: { onEnter: () => log.push(`swing sees ${label}`) } }, { parent: guard, state: 'combat' });
            combat.go('swing');
            const label = 'ready';
        };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', { calm: {}, combat: {} });
            const spawn = useSpawn(Late);
            let once = false;
            useWatch(() => {
                if (!once) {
                    once = true;
                    spawn({ guard: made.guard });
                }
            }, [made.guard]);
            return createScene();
        });

        frame();
        frame();
        frame();
        expect(log).toEqual(['swing sees ready']);
        expect(made.guard.state).toBe('combat');
    });

    it('what one inside picked before the start is forgotten when its parent picks elsewhere', () => {
        const made = {} as { guard: TGuard; combat: TCombat };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', { calm: {}, combat: {} });
            made.combat = useStateMachine('approach', { approach: {}, swing: {} }, { parent: made.guard, state: 'combat' });
            made.combat.go('swing');
            made.guard.go('calm');
            return createScene();
        });

        expect(made.combat.state).toBe('approach');
        frame();
        made.guard.go('combat');
        expect(made.combat.state).toBe('approach');
    });

    it('one destroyed by a sibling this frame does not update', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; piece: unknown };
        const Y = ({ guard }: { guard: TGuard }) => {
            useStateMachine('y', { y: { onUpdate: () => log.push('update y') } }, { parent: guard, state: 'combat' });
        };
        const { frame } = driven(() => {
            made.guard = useStateMachine('combat', { calm: {}, combat: {} });
            useStateMachine('x', { x: { onUpdate: () => { log.push('update x'); destroy(made.piece as never); } } }, { parent: made.guard, state: 'combat' });
            made.piece = useSpawn(Y)({ guard: made.guard });
            return createScene();
        });

        frame();
        expect(log).toEqual(['update x']);
    });

    it('a restart of the parent in its onUpdate leaves the inside unupdated until the next frame', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard };
        let first = true;
        const { frame } = driven(() => {
            made.guard = useStateMachine('combat', {
                calm: {},
                combat: { onUpdate: () => { if (first) { first = false; made.guard.go('combat', { restart: true }); } } },
            });
            useStateMachine('c', { c: logs(log, 'c') }, { parent: made.guard, state: 'combat' });
            return createScene();
        });

        frame();
        expect(log).toEqual(['enter c', 'exit c', 'enter c']);
        frame();
        expect(log.at(-1)).toBe('update c');
    });

    it('does not move once the machine it lives in is gone', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; combat: TCombat; piece: unknown };
        const Guard = () => {
            made.guard = useStateMachine('combat', { calm: {}, combat: {} });
        };
        const { frame } = driven(() => {
            made.piece = useSpawn(Guard)();
            made.combat = useStateMachine('approach', { approach: logs(log, 'approach'), swing: logs(log, 'swing') }, { parent: made.guard, state: 'combat' });
            return createScene();
        });

        frame();
        destroy(made.piece as never);
        frame();
        log.length = 0;
        made.combat.go('swing');
        expect(log).toEqual([]);
    });

    it('a machine inside one made in the same frame comes in with it, from the outside in', () => {
        const log: string[] = [];
        const made = {} as { g: TStateMachine<'h' | 'o'>; c: TStateMachine<'c'> };
        const Piece = ({ g }: { g: TStateMachine<'h' | 'o'> }) => {
            const p = useStateMachine('x', { x: logs(log, 'x') }, { parent: g, state: 'h' });
            made.c = useStateMachine('c', { c: logs(log, 'c') }, { parent: p, state: 'x' });
        };
        const { frame } = driven(() => {
            made.g = useStateMachine('o', { h: logs(log, 'h'), o: {} });
            const spawn = useSpawn(Piece);
            let once = false;
            useWatch(() => {
                if (!once) {
                    once = true;
                    spawn({ g: made.g });
                }
            }, [made.g]);
            return createScene();
        });

        frame();
        frame();
        frame();
        log.length = 0;
        made.g.go('h');
        expect(log).toEqual(['enter h', 'enter x', 'enter c']);
        expect(made.c.active).toBe(true);
    });

    it('go in the body of one made during play moves nothing until the body has ended', () => {
        const log: string[] = [];
        const made = {} as { g: TStateMachine<'h' | 'o'> };
        const Piece = ({ g }: { g: TStateMachine<'h' | 'o'> }) => {
            const c = useStateMachine('a', { a: logs(log, 'a'), b: logs(log, 'b') }, { parent: g, state: 'h' });
            c.go('b');
            log.push('body end');
        };
        const { frame } = driven(() => {
            made.g = useStateMachine('o', { h: logs(log, 'h'), o: logs(log, 'o') });
            const spawn = useSpawn(Piece);
            let once = false;
            useWatch(() => {
                if (!once) {
                    once = true;
                    spawn({ g: made.g });
                }
            }, [made.g]);
            return createScene();
        });

        frame();
        // Made on the first frame: the body ends and nothing has moved.
        expect(log).toEqual(['enter o', 'update o', 'body end']);
        frame();
        frame();
        expect(log).toContain('enter b');
        expect(log).not.toContain('enter a');
        expect(log.indexOf('exit o')).toBeGreaterThan(log.indexOf('body end'));
        expect(made.g.state).toBe('h');
    });

    it('what a fresh one asked for is dropped when its parent leaves first', () => {
        const made = {} as { g: TStateMachine<'h' | 'o'>; c: TStateMachine<'a' | 'b'> };
        const Piece = ({ g }: { g: TStateMachine<'h' | 'o'> }) => {
            made.c = useStateMachine('a', { a: {}, b: {} }, { parent: g, state: 'h' });
            made.c.go('b');
            g.go('o');
        };
        const { frame } = driven(() => {
            made.g = useStateMachine('h', { h: {}, o: {} });
            const spawn = useSpawn(Piece);
            let once = false;
            useWatch(() => {
                if (!once) {
                    once = true;
                    spawn({ g: made.g });
                }
            }, [made.g]);
            return createScene();
        });

        frame();
        frame();
        frame();
        expect(made.g.state).toBe('o');
        made.g.go('h');
        expect(made.c.state).toBe('a');
    });

    it('one destroyed by a sibling on the way in does not enter, and on the way out does not leave', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; piece: unknown };
        const Second = ({ guard }: { guard: TGuard }) => {
            useStateMachine('b', { b: logs(log, 'b') }, { parent: guard, state: 'combat' });
        };
        const { frame } = driven(() => {
            made.guard = useStateMachine('calm', { calm: {}, combat: {} });
            useStateMachine('a', {
                a: {
                    onEnter: () => { log.push('enter a'); if (made.guard.state === 'combat' && log.filter((l) => l === 'enter a').length === 1) destroy(made.piece as never); },
                    onExit: () => log.push('exit a'),
                },
            }, { parent: made.guard, state: 'combat' });
            made.piece = useSpawn(Second)({ guard: made.guard });
            return createScene();
        });

        frame();
        made.guard.go('combat');
        expect(log).toEqual(['enter a']);
    });

    it('one destroyed by a sibling on the way out does not run its onExit', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; piece: unknown };
        const First = ({ guard }: { guard: TGuard }) => {
            useStateMachine('b', { b: logs(log, 'b') }, { parent: guard, state: 'combat' });
        };
        const { frame } = driven(() => {
            made.guard = useStateMachine('combat', { calm: {}, combat: {} });
            made.piece = useSpawn(First)({ guard: made.guard });
            // Made after, so it leaves first (from the inside out, the last one in first).
            useStateMachine('a', { a: { onExit: () => { log.push('exit a'); destroy(made.piece as never); } } }, { parent: made.guard, state: 'combat' });
            return createScene();
        });

        frame();
        log.length = 0;
        made.guard.go('calm');
        expect(log).toEqual(['exit a']);
    });

    it('a parent destroyed by a child on the way in tells nobody about the change', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; piece: unknown };
        const Guard = () => {
            made.guard = useStateMachine('calm', { calm: {}, combat: {} });
            made.guard.onChange(() => log.push('guard changed'));
            useStateMachine('approach', {
                approach: { onEnter: () => { log.push('enter approach'); destroy(made.piece as never); } },
            }, { parent: made.guard, state: 'combat' });
        };
        const { frame } = driven(() => {
            made.piece = useSpawn(Guard)();
            return createScene();
        });

        frame();
        made.guard.go('combat');
        expect(log).toEqual(['enter approach']);
    });

    it('a listener that destroys its object is the last one told', () => {
        const log: string[] = [];
        const made = {} as { guard: TGuard; piece: unknown };
        const Guard = () => {
            made.guard = useStateMachine('calm', { calm: {}, combat: {} });
            made.guard.onChange(() => { log.push('first'); destroy(made.piece as never); });
            made.guard.onChange(() => log.push('second'));
        };
        const { frame } = driven(() => {
            made.piece = useSpawn(Guard)();
            return createScene();
        });

        frame();
        made.guard.go('combat');
        expect(log).toEqual(['first']);
    });
});


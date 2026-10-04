import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { destroy } from '../src/destroy/destroy';
import { loadTexture } from '../src/loaders/texture/load_texture';
import { newTexture } from '../src/loaders/texture/new_texture';
import { setScenePaused } from '../src/scene/pause_scene';
import { tick } from '../src/game/loop/tick';
import { useData } from '../src/hooks/state/use_data';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useWatch } from '../src/hooks/state/use_watch';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TRuntimeStore } from '../src/store';
import type { TSceneFn } from '../src/scene';

/**
 * What these two hooks are for: state a piece of a scene owns, and something reacting to it.
 *
 * The thing worth holding on to is that **this engine has almost no setters**. Everything else here
 * is changed in place by whoever owns it, so the count of announced changes has exactly two
 * sources: `setData` and a loader finishing. That is what makes the refusal in `useWatch` matter
 * rather than being ceremony: without it, watching a transform is a callback that runs once and
 * then never again, with nothing in the console to say so.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A game whose frames are driven by hand, so a watch can be checked frame by frame.
 */
const driven = (name: string, body: TSceneFn) => {
    const { store } = createTestGame({}, createFakeCanvas());
    const root = startTestScene(store, name, body);
    const ctx = createFrameContext();
    let now = 0;

    return {
        store,
        root,
        frame: (): void => {
            const prev = now;
            now += 16;
            tick(store, ctx, now, prev);
        },
    };
};

describe('useData', () => {
    it('hands back what it was given, in something that can be read later', () => {
        let read = -1;
        const { frame } = driven('Level', () => {
            const [lives] = useData(3);
            // Read in a later frame, which is the whole reason it is a box and not a number.
            useWatch(() => { read = lives.value; }, [lives]);
            return createScene();
        });

        frame();
        expect(read).toBe(3);
    });

    it('takes the next value on its own', () => {
        let read = -1;
        const { frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            useWatch(() => { read = lives.value; }, [lives]);
            useSpawn(() => { setLives(1); })();
            return createScene();
        });

        frame();
        expect(read).toBe(1);
    });

    it('takes a function that returns the next value', () => {
        const seen: number[] = [];
        const { frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            useWatch(() => { seen.push(lives.value); }, [lives]);
            setLives((previous) => previous - 1);
            return createScene();
        });

        frame();
        expect(seen).toEqual([2]);
    });

    it('takes a function that changes it in place and returns nothing', () => {
        const seen: number[] = [];
        const { frame } = driven('Level', () => {
            const [hero, setHero] = useData({ hits: 0 });
            useWatch(() => { seen.push(hero.value.hits); }, [hero]);
            setHero((current) => { current.hits += 2; });
            return createScene();
        });

        frame();
        expect(seen).toEqual([2]);
    });

    it('throws outside a scene body', () => {
        expect(() => useData(0)).toThrow('useData');
    });
});

describe('useWatch', () => {
    it('runs on the first frame even though nothing changed', () => {
        let runs = 0;
        const { frame } = driven('Level', () => {
            const [lives] = useData(3);
            useWatch(() => { runs++; }, [lives]);
            return createScene();
        });

        frame();
        expect(runs).toBe(1);
    });

    it('does not run again while nothing changes', () => {
        let runs = 0;
        const { frame } = driven('Level', () => {
            const [lives] = useData(3);
            useWatch(() => { runs++; }, [lives]);
            return createScene();
        });

        frame();
        frame();
        frame();
        expect(runs).toBe(1);
    });

    it('runs again once for a change', () => {
        let runs = 0;
        let hit!: () => void;
        const { frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            hit = () => setLives((n) => n - 1);
            useWatch(() => { runs++; }, [lives]);
            return createScene();
        });

        frame();
        hit();
        frame();
        frame();
        expect(runs).toBe(2);
    });

    it('runs once for two changes made in the same frame', () => {
        const seen: number[] = [];
        let hit!: () => void;
        const { frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            hit = () => setLives((n) => n - 1);
            useWatch(() => { seen.push(lives.value); }, [lives]);
            return createScene();
        });

        frame();
        hit();
        hit();
        frame();
        // Where it ended up, not every step it took: watching is a look once a frame.
        expect(seen).toEqual([3, 1]);
    });

    it('runs once when more than one of the things it watches changes at once', () => {
        let runs = 0;
        let hit!: () => void;
        const { frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            const [coins, setCoins] = useData(0);
            hit = () => { setLives(2); setCoins(10); };
            useWatch(() => { runs++; }, [lives, coins]);
            return createScene();
        });

        frame();
        hit();
        frame();
        expect(runs).toBe(2);
    });

    it('refuses a value read out of something, which is frozen where it is written', () => {
        expect(() => {
            driven('Level', () => {
                const [lives] = useData(3);
                // @ts-expect-error the point of the test is the value that typing already refuses
                useWatch(() => {}, [lives.value]);
                return createScene();
            });
        }).toThrow('read once');
    });

    it('refuses something nothing announces changes on', () => {
        expect(() => {
            driven('Level', () => {
                const hero = { x: 0, y: 0 };
                useWatch(() => {}, [hero]);
                return createScene();
            });
        }).toThrow('run once and never again');
    });

    it('throws outside a scene body', () => {
        expect(() => useWatch(() => {}, [])).toThrow('useWatch');
    });

    it('does not watch while the scene is paused, and catches up when it resumes', () => {
        let runs = 0;
        let hit!: () => void;
        const { store, frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            hit = () => setLives((n) => n - 1);
            useWatch(() => { runs++; }, [lives]);
            return createScene();
        });

        frame();
        setScenePaused(store, 'Level', true);
        hit();
        frame();
        frame();
        expect(runs).toBe(1);

        setScenePaused(store, 'Level', false);
        frame();
        expect(runs).toBe(2);
    });

    it('stops with the box it belongs to', () => {
        let runs = 0;
        let hit!: () => void;
        let child!: { destroy: () => void } | undefined;
        const { frame } = driven('Level', () => {
            const [lives, setLives] = useData(3);
            hit = () => setLives((n) => n - 1);
            child = useSpawn(() => {
                useWatch(() => { runs++; }, [lives]);
            })() as unknown as { destroy: () => void };
            return createScene();
        });

        frame();
        expect(runs).toBe(1);

        destroy(child as never);
        hit();
        frame();
        expect(runs).toBe(1);
    });
});

describe('useWatch over an asset', () => {
    afterEach(() => {
        mock.restore();
    });

    it('hears a texture finish loading', async () => {
        spyOn(globalThis, 'fetch').mockImplementation((async () => new Response(new Blob(['png']))) as unknown as typeof fetch);
        Object.assign(globalThis, { createImageBitmap: async () => ({ width: 16, height: 8, close: () => {} }) });

        const texture = newTexture('/hero.png', '/hero.png');
        const seen: string[] = [];
        let store!: TRuntimeStore;

        const game = driven('Level', () => {
            useWatch(() => { seen.push(texture.status); }, [texture]);
            return createScene();
        });
        store = game.store;

        game.frame();
        expect(seen).toEqual(['loading']);

        await loadTexture(store, texture);
        game.frame();
        expect(seen).toEqual(['loading', 'ready']);
    });
});

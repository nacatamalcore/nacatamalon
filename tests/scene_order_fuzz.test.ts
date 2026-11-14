import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { crossfade, fade } from '../src/transition';
import { useScene } from '../src/hooks/scene/use_scene';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { useReady } from '../src/hooks/scene/use_ready';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TTransition } from '../src/transition';

/**
 * Many games, each put through a run of scene changes picked at random from a fixed seed, so a run
 * that breaks breaks the same way every time: levels changed and restarted, cut, faded or crossed,
 * from the level and from the HUD over it, paused and resumed, with frames in between. After each,
 * what must always hold is checked: one scene per name, one level at a time, the HUD still on top,
 * the effects a level launches from its body under it, `isRunning` telling the truth, and nothing
 * the engine says went wrong.
 */

/** A small generator of numbers from a seed: the same seed, the same run. */
const random = (seed: number) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const LEVELS = ['L1', 'L2', 'L3'] as const;
/** What each level is called on screen: L3 is built from a document that calls its root 'Room'. */
const SHOWN: Record<string, string> = { L1: 'L1', L2: 'L2', L3: 'Room' };

const games: Array<ReturnType<typeof createHeadlessGame>> = [];
afterEach(() => {
    while (games.length > 0) {
        try {
            games.pop()!.destroy();
        } catch {
            // Ended already.
        }
    }
});

const play = (seed: number, steps: number): void => {
    const next = random(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
    const transition = (): TTransition | undefined => {
        const r = next();
        return r < 0.5 ? undefined : r < 0.8 ? fade(0.1 + next() * 0.2) : crossfade(0.1 + next() * 0.2);
    };

    let hud!: TSceneHandle;
    let level!: TSceneHandle;
    const roomDoc = sceneFromDoc(parseSceneDoc({
        format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
        root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
    }, 'fuzz'), 'L3');

    const game = createHeadlessGame({
        width: 16,
        height: 16,
        scenes: {
            Boot: () => {
                const scene = useScene();
                useReady(() => {
                    scene.launch('L1');
                    scene.launch('Hud');
                    scene.stop();
                });
                return createScene();
            },
            L1: () => {
                level = useScene();
                return createScene();
            },
            // Launches its effects from its body, under it, and stops them when it goes.
            L2: () => {
                const scene = useScene();
                level = scene;
                if (!scene.isRunning('Fx')) scene.launch('Fx');
                useCleanup(() => { scene.stop('Fx'); });
                return createScene();
            },
            L3: () => {
                level = useScene();
                return roomDoc();
            },
            Fx: () => createScene(),
            Hud: () => {
                hud = useScene();
                return createScene();
            },
        },
    });
    games.push(game);

    const check = (step: number, what: string, settled = false): void => {
        const scenes = game.scenes;
        const where = `seed ${seed}, step ${step} (${what}): ${scenes.join(', ')}`;
        // One scene per name.
        expect(new Set(scenes).size, where).toBe(scenes.length);
        // One level, or two while a change is being covered: the one coming in waits, held, just
        // over the one going out, in its place. Under the HUD, which stays on top.
        const levels = scenes.filter((name) => Object.values(SHOWN).includes(name));
        expect(levels.length, where).toBeGreaterThanOrEqual(1);
        expect(levels.length, where).toBeLessThanOrEqual(settled ? 1 : 2);
        if (levels.length === 2) {
            const between = scenes.slice(scenes.indexOf(levels[0]!) + 1, scenes.indexOf(levels[1]!));
            expect(between.filter((name) => name !== 'Fx'), where).toEqual([]);
        }
        expect(scenes.at(-1), where).toBe('Hud');
        // The effects only with the level that launched them, and under it.
        if (scenes.includes('Fx')) {
            expect(scenes, where).toContain('L2');
            expect(scenes.indexOf('Fx'), where).toBeLessThan(scenes.indexOf('L2'));
        }
        // isRunning tells the truth, by the registered name.
        for (const name of LEVELS) {
            expect(hud.isRunning(name), `${where}: isRunning('${name}')`).toBe(scenes.includes(SHOWN[name]!));
        }
    };

    check(0, 'start');
    for (let step = 1; step <= steps; step++) {
        // The level on top of the two while a change is covered: the one coming in.
        const shownLevels = game.scenes.filter((name) => Object.values(SHOWN).includes(name));
        const current = LEVELS.find((name) => SHOWN[name] === shownLevels.at(-1)) ?? 'L1';
        const op = Math.floor(next() * 7);
        let what = '';
        if (op === 0) {
            const to = pick(LEVELS.filter((name) => name !== current));
            const t = transition();
            what = `level.change('${to}'${t === undefined ? '' : ', covered'})`;
            level.change(to, t === undefined ? undefined : { transition: t });
        } else if (op === 1) {
            const t = transition();
            what = `level.restart(${t === undefined ? '' : 'covered'})`;
            if (t === undefined) {
                level.restart();
            } else {
                level.restart({ transition: t });
            }
        } else if (op === 2) {
            const t = transition();
            what = `hud.restart('${current}'${t === undefined ? '' : ', covered'})`;
            hud.restart(current, t === undefined ? undefined : { transition: t });
        } else if (op === 3) {
            what = `hud.pause('${current}')`;
            hud.pause(current);
        } else if (op === 4) {
            what = `hud.resume('${current}')`;
            hud.resume(current);
        } else {
            const frames = Math.floor(next() * 20);
            what = `run(${frames})`;
            game.run(frames);
        }
        check(step, what);
    }
    // Once every cover is off, the same holds, and nothing is still waiting to come in.
    game.run(120);
    check(steps + 1, 'settled', true);
    const settled = [...game.scenes];
    game.run(30);
    expect(game.scenes, `seed ${seed}: still moving once settled`).toEqual(settled);
};

describe('scenes changed at random', () => {
    it('always keep one scene per name, one level under the HUD, its effects under it, and say nothing went wrong', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            for (let seed = 1; seed <= 200; seed++) {
                play(seed, 40);
                while (games.length > 0) games.pop()!.destroy();
            }
            expect(error.mock.calls.map((call) => String(call[0]))).toEqual([]);
        } finally {
            warn.mockRestore();
            error.mockRestore();
        }
    });
});

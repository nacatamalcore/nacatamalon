import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHeadlessGame as createHeadless } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { crossfade, fade } from '../src/transition';
import { registerGameSystem } from '../src';
import { useScene } from '../src/hooks/scene/use_scene';
import { useGame } from '../src/hooks/game/use_game';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { useReady } from '../src/hooks/scene/use_ready';
import { useSceneTransitionEnd } from '../src/hooks/scene/use_scene_transition_end';
import { useUpdate } from '../src/hooks/loop';
import { useRenderStyle } from '../src/hooks/style';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import { RENDER } from '../src/CONST';
import { getActiveBox, getActiveGame } from '../src/store';
import { flushSystemLaunches, followLayout, startGameSystems, stopGameSystems } from '../src/game_systems/game_systems';
import { registerScene } from '../src/scene/register_scene';
import { inPlaceOf, scenesOnceBuilt, startScene } from '../src/scene/start_scene';
import { stopScene } from '../src/scene/stop_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TTransition } from '../src/transition';

/**
 * A scene started over by name, from itself, from the HUD over it or from a game system: built again
 * with the props it was started with, in the place its old copy had among the scenes, so a level
 * started over stays under the HUD. And whether a scene is running, asked rather than tried.
 */

const removals: Array<() => void> = [];
/**
 * Every game a test makes, ended after it whatever happened: one left running by a test that failed
 * would make the systems the next ones register wait for another game, and fail them too.
 */
const games: Array<ReturnType<typeof createHeadless>> = [];
const createHeadlessGame = (...args: Parameters<typeof createHeadless>): ReturnType<typeof createHeadless> => {
    const game = createHeadless(...args);
    games.push(game);
    return game;
};
afterEach(() => {
    while (games.length > 0) {
        try {
            games.pop()!.destroy();
        } catch {
            // Ended already, by the test itself.
        }
    }
    while (removals.length > 0) removals.pop()!();
});

const setup = () => {
    const told: string[] = [];
    let hud!: TSceneHandle;
    let level!: TSceneHandle;
    const Level = ({ level: number = 1 }: { level?: number }) => {
        level = useScene();
        told.push(`level ${number} up`);
        useCleanup(() => told.push(`level ${number} down`));
        return createScene();
    };
    const game = createHeadlessGame({
        width: 16,
        height: 16,
        scenes: {
            // Starts the level with props and the HUD over it, and leaves.
            Boot: () => {
                const scene = useScene();
                useReady(() => {
                    scene.launch(Level, { props: { level: 3 } });
                    scene.launch('Hud');
                    scene.stop();
                });
                return createScene();
            },
            Level,
            Hud: () => {
                hud = useScene();
                return createScene();
            },
        },
    });
    told.length = 0;
    return { game, told, Level, hud: () => hud, level: () => level };
};

/**
 * Room, a plain scene, and Level1, built from a document that calls its root 'Room' too.
 */
const roomAndLevel1 = () => {
    const level1Doc = sceneFromDoc(parseSceneDoc({
        format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
        root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
    }, 'test'), 'Level1');
    let room!: TSceneHandle;
    const game = createHeadlessGame({
        width: 16,
        height: 16,
        scenes: {
            Room: () => {
                room = useScene();
                return createScene();
            },
            Level1: level1Doc,
        },
    });
    return { game, room: () => room };
};

describe('useScene().restart', () => {
    it('builds a scene again with the props it was started with, in its place under the HUD', () => {
        const { game, told, hud } = setup();
        expect(game.scenes).toEqual(['Level', 'Hud']);
        expect(hud().restart('Level')).toBe(true);
        expect(told).toEqual(['level 3 down', 'level 3 up']);
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });

    it('builds it with the props it is given instead, checked when given the function', () => {
        const { game, told, hud, Level } = setup();
        hud().restart(Level, { props: { level: 4 } });
        expect(told).toEqual(['level 3 down', 'level 4 up']);
        // And the next restart keeps those.
        hud().restart('Level');
        expect(told.slice(2)).toEqual(['level 4 down', 'level 4 up']);
        game.destroy();
    });

    it('restarts the calling scene with no name', () => {
        const { game, told, level } = setup();
        expect(level().restart()).toBe(true);
        expect(told).toEqual(['level 3 down', 'level 3 up']);
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });

    it('covered: the old copy stays until the screen is covered, and the two never run at once', () => {
        const { game, told, hud } = setup();
        expect(hud().restart('Level', { transition: fade(0.2) })).toBe(true);
        expect(told).toEqual([]);
        game.run(30);
        expect(told).toEqual(['level 3 down', 'level 3 up']);
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });

    it('a level restarting itself with change keeps its place under the HUD too, cut or covered', () => {
        const { game, level } = setup();
        level().change('Level');
        expect(game.scenes).toEqual(['Level', 'Hud']);
        level().change('Level', { transition: fade(0.2) });
        game.run(30);
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });

    it('keeps its place under the HUD when its cleanups stop a scene of its own beneath it, and that one comes back under it', () => {
        // The level launches its effects from its body, which puts them under it, and stops them
        // when it goes: the list moves while it stops, cut or covered.
        let hud!: TSceneHandle;
        let level!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    const scene = useScene();
                    level = scene;
                    scene.launch('Fx');
                    useCleanup(() => { scene.stop('Fx'); });
                    return createScene();
                },
                Fx: () => createScene(),
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        const order = ['Fx', 'Level', 'Hud'];
        expect(game.scenes).toEqual(order);
        hud.restart('Level');
        expect(game.scenes).toEqual(order);
        hud.restart('Level', { transition: fade(0.2) });
        game.run(30);
        expect(game.scenes).toEqual(order);
        level.change('Level');
        expect(game.scenes).toEqual(order);
        level.change('Level', { transition: fade(0.2) });
        game.run(30);
        expect(game.scenes).toEqual(order);
        game.destroy();
    });

    it('by its function, restarts the scene started from it, never another whose document took its name', () => {
        // Registered as 'Room', its document calls its root 'Other'; registered as 'Level1', its
        // document calls its root 'Room'.
        const docNamed = (root: string) => parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: root, assets: [],
            root: { id: 'root', name: root, transform: null, children: [], components: [] },
        }, 'test');
        const roomDoc = sceneFromDoc(docNamed('Other'), 'Room');
        const level1Doc = sceneFromDoc(docNamed('Room'), 'Level1');
        const told: string[] = [];
        const Room = () => {
            useCleanup(() => told.push('Room down'));
            return roomDoc();
        };
        const Level1 = () => {
            useCleanup(() => told.push('Level1 down'));
            return level1Doc();
        };
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Room');
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Room,
                Level1,
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        expect(game.scenes).toEqual(['Other', 'Room', 'Hud']);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        // 'Room' is found, never Level1: and it cannot be built again while Level1 answers to its
        // name, so it is left running rather than stopped for good. The same by its name.
        expect(hud.restart(Room)).toBe(false);
        expect(hud.restart('Room')).toBe(false);
        expect(told).toEqual([]);
        expect(String(warn.mock.calls[0]?.[0])).toBe("[NacatamalOn] useScene().restart: 'Room' was left running, because scene 'Room' (started as 'Level1') answers to that name too, and a name means one scene. Stop that one first, or give its document's root another name.");
        warn.mockRestore();
        // Level1 by its function is Level1, built again in its place.
        expect(hud.restart(Level1)).toBe(true);
        expect(told).toEqual(['Level1 down']);
        expect(game.scenes).toEqual(['Other', 'Room', 'Hud']);
        game.destroy();
    });

    it('a scene built from a document answers to the name it was registered under, and to its function', () => {
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
            root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
        }, 'test');
        const Level1 = sceneFromDoc(doc, 'Level1');
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level1,
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        expect(game.scenes).toEqual(['Room', 'Hud']);
        expect(hud.isRunning('Level1')).toBe(true);
        expect(hud.isRunning(Level1)).toBe(true);
        expect(hud.restart('Level1')).toBe(true);
        expect(hud.restart(Level1)).toBe(true);
        expect(hud.restart('Room')).toBe(true);
        expect(game.scenes).toEqual(['Room', 'Hud']);
        game.destroy();
    });

    it('a level with a style of its own, built again under a HUD with another, measures the HUD\'s screen', () => {
        let hud!: TSceneHandle;
        const seen: number[] = [];
        const game = createHeadlessGame({
            width: 800,
            height: 600,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    useRenderStyle(RENDER.STYLES.ps1);
                    // The screen the body places things by, once it has asked for its style.
                    seen.push(getActiveGame()!.get('config').width);
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    useRenderStyle(RENDER.STYLES.cgi);
                    return createScene();
                },
            },
        });
        game.run(1);
        seen.length = 0;
        // Built again under the HUD, whose style is on top: the screen stays the HUD's (cgi, 640
        // across), not the level's own (ps1, 320).
        hud.restart('Level');
        expect(seen).toEqual([640]);
        game.destroy();
    });

    it('a scene its body restarts keeps the place its own restart gave it', () => {
        // The level, built again, starts the HUD over: both go back where they were.
        let hud!: TSceneHandle;
        let level!: TSceneHandle;
        let again = false;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    level = useScene();
                    if (again) level.restart('Hud');
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        again = true;
        hud.restart('Level');
        expect(game.scenes).toEqual(['Level', 'Hud']);
        hud.restart('Level', { transition: fade(0.2) });
        game.run(30);
        expect(game.scenes).toEqual(['Level', 'Hud']);
        level.change('Level');
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });

    it('a scene its body launches, and the scene itself, measure the screen they will be drawn on', () => {
        // The level (ps1, 320 across) launches its effects (cgi, 640) before asking for its style;
        // the HUD over them has none: the level is the top style, and it measures its own screen.
        let hud!: TSceneHandle;
        const seen: number[] = [];
        const width = (): number => getActiveGame()!.get('config').width;
        const game = createHeadlessGame({
            width: 800,
            height: 600,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    useScene().launch('Fx');
                    useRenderStyle(RENDER.STYLES.ps1);
                    seen.push(width());
                    return createScene();
                },
                Fx: () => {
                    useRenderStyle(RENDER.STYLES.cgi);
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        expect(seen).toEqual([320]);
        expect(game.scenes).toEqual(['Fx', 'Level', 'Hud']);
        // Fx is stopped with the level by nobody: stop it, so the level's body can launch it again.
        hud.stop('Fx');
        hud.restart('Level');
        expect(seen).toEqual([320, 320]);
        expect(game.scenes).toEqual(['Fx', 'Level', 'Hud']);
        game.destroy();
    });

    it('a scene launched by the body of one restarted under a styled HUD measures the HUD\'s screen', () => {
        let hud!: TSceneHandle;
        const seen: number[] = [];
        const game = createHeadlessGame({
            width: 800,
            height: 600,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    const scene = useScene();
                    scene.launch('Fx');
                    useCleanup(() => { scene.stop('Fx'); });
                    return createScene();
                },
                Fx: () => {
                    useRenderStyle(RENDER.STYLES.ps1);
                    seen.push(getActiveGame()!.get('config').width);
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    useRenderStyle(RENDER.STYLES.cgi);
                    return createScene();
                },
            },
        });
        game.run(1);
        seen.length = 0;
        hud.restart('Level');
        // Under the HUD (cgi, 640 across) once it is listed, so it measures that.
        expect(seen).toEqual([640]);
        expect(game.scenes).toEqual(['Fx', 'Level', 'Hud']);
        game.destroy();
    });

    it('by its function, never restarts another scene whose document took its name, even with its own stopped', () => {
        const docNamed = (root: string) => parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: root, assets: [],
            root: { id: 'root', name: root, transform: null, children: [], components: [] },
        }, 'test');
        const level1Doc = sceneFromDoc(docNamed('Room'), 'Level1');
        const told: string[] = [];
        const Room = () => createScene();
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Room,
                Level1: () => {
                    useCleanup(() => told.push('Level1 down'));
                    return level1Doc();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        expect(hud.restart(Room)).toBe(false);
        expect(told).toEqual([]);
        expect(String(warn.mock.calls[0]?.[0])).toBe("[NacatamalOn] useScene().restart: scene 'Room' is not running.");
        warn.mockRestore();
        game.destroy();
    });

    it('a name another scene\'s document took too: change to its own name throws before anything stops', () => {
        const { game, room } = roomAndLevel1();
        room().launch('Level1');
        expect(game.scenes).toEqual(['Room', 'Room']);
        expect(() => room().change('Room')).toThrow("[NacatamalOn] useScene().change: 'Room' cannot be started again while scene 'Room' (started as 'Level1') answers to that name too");
        expect(() => room().change('Room', { transition: fade(0.2) })).toThrow('cannot be started again');
        expect(game.scenes).toEqual(['Room', 'Room']);
        game.destroy();
    });

    it('a name another scene\'s document comes to take while the screen covers a restart: the old copy is left, and said', () => {
        const { game, room } = roomAndLevel1();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(room().restart({ transition: fade(0.2) })).toBe(true);
            room().launch('Level1');
            game.run(30);
            expect(String(warn.mock.calls.at(-1)?.[0])).toContain("scene 'Room': it was left running rather than restarted, because scene 'Room' (started as 'Level1') came to answer to that name too");
            expect(game.scenes).toEqual(['Room', 'Room']);
        } finally {
            warn.mockRestore();
            game.destroy();
        }
    });

    it('a scene that restarted itself says nothing when its old handle asks for a change afterwards', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { game, level } = setup();
        try {
            const old = level();
            old.restart();
            old.change('Hud');
            expect(warn).not.toHaveBeenCalled();
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            game.destroy();
            warn.mockRestore();
        }
    });

    it('says a scene that is not running, and does nothing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { game, told, hud } = setup();
        expect(hud().restart('Boot')).toBe(false);
        expect(String(warn.mock.calls[0]?.[0])).toBe("[NacatamalOn] useScene().restart: scene 'Boot' is not running.");
        expect(told).toEqual([]);
        game.destroy();
        warn.mockRestore();
    });

    it('leaves alone a scene that is part of a change being covered', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { game, hud } = setup();
        hud().restart('Level', { transition: fade(0.2) });
        expect(hud().restart('Level')).toBe(false);
        expect(String(warn.mock.calls[0]?.[0])).toContain("useScene().restart: 'Level' is part of a scene change being covered right now");
        game.run(30);
        game.destroy();
        warn.mockRestore();
    });

    it('from a game system, by name; with no name it throws, the system having no scene', () => {
        const told: string[] = [];
        let caught = '';
        removals.push(registerGameSystem('test-restarts', () => {
            const scenes = useScene();
            let frame = 0;
            useUpdate(() => {
                frame++;
                if (frame === 1) {
                    scenes.restart('Level');
                    try {
                        scenes.restart();
                    } catch (error) {
                        caught = (error as Error).message;
                    }
                }
            });
        }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    told.push('up');
                    useCleanup(() => told.push('down'));
                    return createScene();
                },
            },
        });
        game.run(1);
        expect(told).toEqual(['up', 'down', 'up']);
        expect(caught).toBe("[NacatamalOn] useScene().restart: 'test-restarts' is a game system, which belongs to no scene. Name the scene it is about: useScene().restart('Level').");
        game.destroy();
    });
});

describe('useScene().isRunning', () => {
    it('says whether a scene is running, by its name or its function, without a word', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { game, hud, Level } = setup();
        expect(hud().isRunning('Level')).toBe(true);
        expect(hud().isRunning(Level)).toBe(true);
        expect(hud().isRunning('Boot')).toBe(false);
        expect(hud().isRunning('Nowhere')).toBe(false);
        expect(warn).not.toHaveBeenCalled();
        game.destroy();
        warn.mockRestore();
    });

    it('is what launch would refuse: asked first, a HUD is launched once', () => {
        const { game, hud } = setup();
        if (!hud().isRunning('Hud')) hud().launch('Hud');
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });
});

describe('useScene().change to another scene', () => {
    it('brings it in the place of the one it replaces, under the HUD, cut, covered or crossed', () => {
        let level!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level1: () => {
                    level = useScene();
                    useReady(() => { if (!level.isRunning('Hud')) level.launch('Hud'); });
                    return createScene();
                },
                Level2: () => {
                    level = useScene();
                    // Its effects go just under it, as they would on top.
                    level.launch('Fx');
                    useCleanup(() => { level.stop('Fx'); });
                    return createScene();
                },
                Level3: () => {
                    level = useScene();
                    return createScene();
                },
                Fx: () => createScene(),
                Hud: () => createScene(),
            },
        });
        expect(game.scenes).toEqual(['Level1', 'Hud']);
        level.change('Level2');
        expect(game.scenes).toEqual(['Fx', 'Level2', 'Hud']);
        level.change('Level3', { transition: fade(0.2) });
        game.run(30);
        expect(game.scenes).toEqual(['Level3', 'Hud']);
        level.change('Level1', { transition: crossfade(0.2) });
        game.run(30);
        expect(game.scenes).toEqual(['Level1', 'Hud']);
        game.destroy();
    });

    it('while the scene going out is still on screen behind the cover, it keeps its place for the scenes around it', () => {
        // Bg under the first level, restarted by the HUD while the change is being covered: it goes
        // back under the level still on screen, not over it.
        let first!: TSceneHandle;
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Bg');
                        scene.launch('L1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Bg: () => createScene(),
                L1: () => {
                    first = useScene();
                    return createScene();
                },
                L2: () => createScene(),
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        expect(game.scenes).toEqual(['Bg', 'L1', 'Hud']);
        first.change('L2', { transition: fade(0.5) });
        game.run(2);
        expect(game.scenes).toEqual(['Bg', 'L1', 'L2', 'Hud']);
        hud.restart('Bg');
        expect(game.scenes).toEqual(['Bg', 'L1', 'L2', 'Hud']);
        game.run(60);
        expect(game.scenes).toEqual(['Bg', 'L2', 'Hud']);
        game.destroy();
    });
});

describe('a game system launching before the game has a scene', () => {
    it('launches on the first frame the game is shown, over the scene it starts on', () => {
        removals.push(registerGameSystem('test-hud', () => {
            const scenes = useScene();
            scenes.launch('Hud');
            expect(scenes.isRunning('Hud')).toBe(false);
        }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: { Level: () => createScene(), Hud: () => createScene() },
        });
        try {
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            game.destroy();
        }
    });

    it('waits while the scene it starts on is being covered in, and then goes on top', () => {
        removals.push(registerGameSystem('test-hud-late', () => {
            useScene().launch('Hud');
        }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => scene.change('Level', { transition: fade(0.2) }));
                    return createScene();
                },
                Level: () => createScene(),
                Hud: () => createScene(),
            },
        });
        expect(game.scenes).not.toContain('Hud');
        game.run(30);
        expect(game.scenes).toEqual(['Level', 'Hud']);
        game.destroy();
    });

    it('launches at once once the game has started, even with no scene left', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let launched = 0;
        removals.push(registerGameSystem('test-over', () => {
            const scenes = useScene();
            useUpdate(() => {
                if (!scenes.isRunning('Level') && !scenes.isRunning('Over')) {
                    launched++;
                    scenes.launch('Over');
                }
            });
        }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    const scene = useScene();
                    useUpdate(() => { scene.stop(); });
                    return createScene();
                },
                Over: () => createScene(),
            },
        });
        try {
            game.run(5);
            expect(game.scenes).toEqual(['Over']);
            expect(launched).toBe(1);
        } finally {
            game.destroy();
            warn.mockRestore();
        }
    });

    it('one that comes in covered holds the rest until the screen is uncovered, rather than having them refused', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        removals.push(registerGameSystem('test-a', () => { useScene().launch('A', { transition: fade(0.2) }); }));
        removals.push(registerGameSystem('test-b', () => { useScene().launch('B', { transition: fade(0.2) }); }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: { Level: () => createScene(), A: () => createScene(), B: () => createScene() },
        });
        try {
            game.run(60);
            expect(game.scenes).toEqual(['Level', 'A', 'B']);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            game.destroy();
            warn.mockRestore();
        }
    });

    it('says one that throws as it starts by the system that launched it, and the game goes on', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        removals.push(registerGameSystem('test-broken', () => { useScene().launch('Hud'); }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => createScene(),
                Hud: () => { throw new Error('no hud'); },
            },
        });
        try {
            expect(game.scenes).toEqual(['Level']);
            expect(error.mock.calls.map((call) => String(call[0]))).toContain("[NacatamalOn] game system 'test-broken': scene 'Hud', which it launched before the game had a scene, threw while starting, and the game goes on without it. Fix what throws in its body or its useReady.");
        } finally {
            game.destroy();
            error.mockRestore();
        }
    });

    it('is let go of when a tool lays the game out, and launched at once when it is played', () => {
        removals.push(registerGameSystem('test-laid', () => { useScene().launch('Hud'); }));
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
            root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
        }, 'test');
        const { store } = createTestGame();
        registerScene(store, 'Hud', () => createScene());
        startGameSystems(store);
        // Shown and not played, as a tool lays it out: the systems go down, and what they launched.
        const shown = startTestScene(store, 'Level', sceneFromDoc(doc, 'Level', { scripts: 'attach' }));
        followLayout(store);
        flushSystemLaunches(store);
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Level']);
        // Played: the systems start again with a scene there, and launch at once.
        stopScene(store, shown);
        startTestScene(store, 'Played', () => createScene());
        followLayout(store);
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Played', 'Hud']);
        stopGameSystems(store);
    });

    it('leaves the scene the game starts on as it is, and says so, rather than failing to start', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            removals.push(registerGameSystem('test-same', () => {
                useScene().launch('Level');
            }));
            const game = createHeadlessGame({ width: 16, height: 16, scenes: { Level: () => createScene() } });
            try {
                expect(game.scenes).toEqual(['Level']);
                // Found by what it says, so a warning another test left behind does not stand in for it.
                expect(warn.mock.calls.map((call) => String(call[0]))).toContain("[NacatamalOn] useScene().launch: 'Level', launched by game system 'test-same' before the game had a scene, was already running once it was shown, so it was left as it is. Launch it from one place only: before the first frame, isRunning does not see what waits.");
            } finally {
                game.destroy();
            }
        } finally {
            warn.mockRestore();
        }
    });

    it('says a name that is not one of the game\'s scenes at once', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            removals.push(registerGameSystem('test-typo', () => {
                useScene().launch('Hdu');
            }));
            const game = createHeadlessGame({ width: 16, height: 16, scenes: { Level: () => createScene() } });
            try {
                const said = error.mock.calls.map((call) => `${String(call[0])} ${String((call[1] as Error | undefined)?.message)}`);
                expect(said.some((line) => line.includes("game system 'test-typo': it could not start") && line.includes("'Hdu' is not registered"))).toBe(true);
            } finally {
                game.destroy();
            }
        } finally {
            error.mockRestore();
        }
    });
});

describe('a scene built from a document, by the name it was registered under', () => {
    it('is stopped, paused and heard by that name too', () => {
        const level1Doc = sceneFromDoc(parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
            root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
        }, 'test'), 'Level1');
        let hud!: TSceneHandle;
        const heard: string[] = [];
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level1: level1Doc,
                Hud: () => {
                    hud = useScene();
                    hud.onPaused(() => heard.push('paused'), 'Level1');
                    hud.onResumed(() => heard.push('resumed'), 'Level1');
                    return createScene();
                },
            },
        });
        expect(hud.pause('Level1')).toBe(true);
        expect(hud.isPaused('Level1')).toBe(true);
        expect(hud.resume('Level1')).toBe(false);
        expect(heard).toEqual(['paused', 'resumed']);
        expect(hud.stop('Level1')).toBe(true);
        expect(game.scenes).toEqual(['Hud']);
        game.destroy();
    });
});

describe('the place a scene keeps, and what waits for the game to be shown', () => {
    it('keeps no scene that stopped alive: a level restarted many times lets its old copies go', async () => {
        let hud!: TSceneHandle;
        const roots: WeakRef<object>[] = [];
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    roots.push(new WeakRef(getActiveBox()!));
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        try {
            for (let i = 0; i < 80; i++) {
                hud.restart('Level');
            }
            expect(game.scenes).toEqual(['Level', 'Hud']);
            // As a game goes on: a frame or two lets go of what the last one still pointed at. Then
            // collected, with turns let go by, so what this call had on its stack is let go of too.
            game.run(2);
            for (let i = 0; i < 3; i++) {
                Bun.gc(true);
                await Bun.sleep(0);
            }
            Bun.gc(true);
            // The collector here is a careful one: a few copies, here and there, can outlive this
            // because an old value of the stack still looked like a pointer to them. That is no leak.
            // A leak is each copy holding the one before it, and then all eighty would be alive.
            const alive = roots.slice(0, -1).filter((root) => root.deref() !== undefined).length;
            expect(alive).toBeLessThan(20);
            expect(roots.at(-1)!.deref()).toBeDefined();
        } finally {
            game.destroy();
        }
    });

    it('a game that ends while what its systems launched is being launched launches nothing more', () => {
        const built: string[] = [];
        const holder: { game?: ReturnType<typeof createHeadlessGame> } = {};
        removals.push(registerGameSystem('test-ends', () => {
            const scenes = useScene();
            scenes.launch('A');
            scenes.launch('B');
        }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                // Covered in, so what the systems launched waits for a frame run after `holder` is set.
                Boot: () => {
                    const scene = useScene();
                    useReady(() => scene.change('Level', { transition: fade(0.2) }));
                    return createScene();
                },
                Level: () => createScene(),
                A: () => {
                    built.push('A');
                    useReady(() => holder.game!.destroy());
                    return createScene();
                },
                B: () => {
                    built.push('B');
                    return createScene();
                },
            },
        });
        holder.game = game;
        game.run(30);
        expect(built).toEqual(['A']);
    });

    it('a tool laying the game out from its first picture takes the systems down before what they launched comes', () => {
        removals.push(registerGameSystem('test-first-picture', () => { useScene().launch('Hud'); }));
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
            root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
        }, 'test');
        // The scene the game starts on is shown and not played, as the editor's edit mode shows it.
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: { Level: sceneFromDoc(doc, 'Level', { scripts: 'attach' }), Hud: () => createScene() },
        });
        try {
            game.run(3);
            expect(game.scenes).toEqual(['Level']);
        } finally {
            game.destroy();
        }
    });
});

describe('more of the places scenes keep, and of what systems launch', () => {
    /**
     * A level under a HUD, started by a scene that then leaves, as the tests above.
     */
    const levelUnderHud = (scenes: Record<string, () => ReturnType<typeof createScene>> = {}) => {
        let hud!: TSceneHandle;
        let level!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    level = useScene();
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
                ...scenes,
            },
        });
        return { game, hud: () => hud, level: () => level };
    };

    it('two games on one page each launch what their systems asked for, apart', () => {
        removals.push(registerGameSystem('test-two', () => { useScene().launch('Hud'); }));
        const scenes = { Level: () => createScene(), Hud: () => createScene() };
        const a = createHeadlessGame({ width: 16, height: 16, scenes });
        const b = createHeadlessGame({ width: 16, height: 16, scenes });
        try {
            expect(a.scenes).toEqual(['Level', 'Hud']);
            expect(b.scenes).toEqual(['Level', 'Hud']);
        } finally {
            a.destroy();
            b.destroy();
        }
    });

    it('a game paused from the start still shows what its systems launched', () => {
        removals.push(registerGameSystem('test-paused', () => {
            useGame().pause();
            useScene().launch('Hud');
        }));
        const game = createHeadlessGame({ width: 16, height: 16, scenes: { Level: () => createScene(), Hud: () => createScene() } });
        try {
            game.run(2);
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            game.destroy();
        }
    });

    it('what a system launched hands its props over, and a scene it launches from its body goes under it', () => {
        const told: string[] = [];
        removals.push(registerGameSystem('test-props', () => {
            useScene().launch('Hud', { props: { player: 2 } });
        }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => createScene(),
                Hud: ({ player = 1 }: { player?: number }) => {
                    told.push(`hud ${player}`);
                    useScene().launch('Extra');
                    return createScene();
                },
                Extra: () => createScene(),
            },
        });
        try {
            expect(told).toEqual(['hud 2']);
            expect(game.scenes).toEqual(['Level', 'Extra', 'Hud']);
        } finally {
            game.destroy();
        }
    });

    it('what a system launched may restart the level from its useReady, and the level stays under it', () => {
        let built = 0;
        removals.push(registerGameSystem('test-reentry', () => { useScene().launch('Hud'); }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    built++;
                    return createScene();
                },
                Hud: () => {
                    const scene = useScene();
                    useReady(() => scene.restart('Level'));
                    return createScene();
                },
            },
        });
        try {
            expect(built).toBe(2);
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            game.destroy();
        }
    });

    it('isRunning says false while a system\'s launch waits, and true once it is shown', () => {
        const seen: boolean[] = [];
        removals.push(registerGameSystem('test-waits', () => {
            const scenes = useScene();
            scenes.launch('Hud');
            seen.push(scenes.isRunning('Hud'));
            useUpdate(() => { seen.push(scenes.isRunning('Hud')); });
        }));
        const game = createHeadlessGame({ width: 16, height: 16, scenes: { Level: () => createScene(), Hud: () => createScene() } });
        try {
            game.run(1);
            expect(seen).toEqual([false, true]);
        } finally {
            game.destroy();
        }
    });

    it('a crossed restart keeps its place too', () => {
        const { game, hud } = levelUnderHud();
        try {
            hud().restart('Level', { transition: crossfade(0.2) });
            game.run(30);
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            game.destroy();
        }
    });

    it('a scene stopped after a restart and launched again later goes on top, as any launch', () => {
        const { game, hud } = levelUnderHud();
        try {
            hud().restart('Level');
            hud().stop('Level');
            hud().launch('Level');
            expect(game.scenes).toEqual(['Hud', 'Level']);
        } finally {
            game.destroy();
        }
    });

    it('a change from the scene on top brings the new one on top, and one from the bottom keeps the bottom', () => {
        let top!: TSceneHandle;
        let bottom!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Sky');
                        scene.launch('Level');
                        scene.launch('Menu');
                        scene.stop();
                    });
                    return createScene();
                },
                Sky: () => {
                    bottom = useScene();
                    return createScene();
                },
                Night: () => createScene(),
                Level: () => createScene(),
                Menu: () => {
                    top = useScene();
                    return createScene();
                },
                Options: () => createScene(),
            },
        });
        try {
            top.change('Options');
            expect(game.scenes).toEqual(['Sky', 'Level', 'Options']);
            bottom.change('Night');
            expect(game.scenes).toEqual(['Night', 'Level', 'Options']);
        } finally {
            game.destroy();
        }
    });

    it('a paused scene restarted comes back running', () => {
        const { game, hud } = levelUnderHud();
        try {
            hud().pause('Level');
            hud().restart('Level');
            expect(hud().isPaused('Level')).toBe(false);
        } finally {
            game.destroy();
        }
    });

    it('a body that changes the props it was handed does not change what a restart builds it with', () => {
        const levels: number[] = [];
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level', { props: { level: 3 } });
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: (props: { level?: number }) => {
                    levels.push(props.level ?? 1);
                    props.level = 99;
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        try {
            hud.restart('Level');
            expect(levels).toEqual([3, 3]);
        } finally {
            game.destroy();
        }
    });

    it('a scene built from a document hears its own pause once, by either name it is paused by', () => {
        const level1Doc = sceneFromDoc(parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
            root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
        }, 'test'), 'Level1');
        let heard = 0;
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level1: () => {
                    useScene().onPaused(() => { heard++; });
                    return level1Doc();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        try {
            hud.pause('Level1');
            hud.resume('Room');
            hud.pause('Room');
            expect(heard).toBe(2);
        } finally {
            game.destroy();
        }
    });

    it('a system\'s covered restart while a change is being covered is refused, and said', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let outcome: boolean | undefined;
        let systemScenes!: TSceneHandle;
        removals.push(registerGameSystem('test-busy', () => { systemScenes = useScene(); }));
        const { game, level } = levelUnderHud({ Other: () => createScene() });
        try {
            level().change('Other', { transition: fade(0.3) });
            outcome = systemScenes.restart('Hud', { transition: fade(0.3) });
            expect(outcome).toBe(false);
            expect(warn.mock.calls.map((call) => String(call[0])).some((line) => line.includes("useScene().restart: 'Hud' was ignored because a scene change is already being covered"))).toBe(true);
            game.run(60);
            expect(game.scenes).toEqual(['Other', 'Hud']);
        } finally {
            game.destroy();
            warn.mockRestore();
        }
    });
});

describe('what the fifth review asked for', () => {
    it('a HUD built again inside the level\'s own restart measures the screen it will be drawn on', () => {
        // The level (ps1, 320 across) under the HUD (cgi, 640): the level, built again, asks for its
        // style and then starts the HUD over, which measures its own screen while it is built.
        let hud!: TSceneHandle;
        let again = false;
        const seen: number[] = [];
        const game = createHeadlessGame({
            width: 800,
            height: 600,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => {
                    const scene = useScene();
                    useRenderStyle(RENDER.STYLES.ps1);
                    if (again) scene.restart('Hud');
                    return createScene();
                },
                Hud: () => {
                    hud = useScene();
                    useRenderStyle(RENDER.STYLES.cgi);
                    seen.push(getActiveGame()!.get('config').width);
                    return createScene();
                },
            },
        });
        game.run(1);
        seen.length = 0;
        again = true;
        hud.restart('Level');
        expect(seen).toEqual([640]);
        expect(game.scenes).toEqual(['Level', 'Hud']);
    });

    it('a scene held behind a cover is not restarted, and said', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store } = createTestGame();
            let handle!: TSceneHandle;
            const level = startTestScene(store, 'Level', () => createScene());
            startTestScene(store, 'Hud', () => {
                handle = useScene();
                return createScene();
            });
            level.held = true;
            expect(handle.restart('Level')).toBe(false);
            expect(warn.mock.calls.map((call) => String(call[0])).some((line) => line.includes("useScene().restart: 'Level' is waiting to be shown behind a cover, so it was left alone. Restart it once it is shown."))).toBe(true);
            expect(store.get('world').scenes).toContain(level);
        } finally {
            warn.mockRestore();
        }
    });

    it('what systems launched waits while a scene is held, even with no transition', () => {
        removals.push(registerGameSystem('test-held', () => { useScene().launch('Hud'); }));
        const { store } = createTestGame();
        registerScene(store, 'Hud', () => createScene());
        startGameSystems(store);
        const level = startTestScene(store, 'Level', () => createScene());
        level.held = true;
        flushSystemLaunches(store);
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Level']);
        level.held = false;
        flushSystemLaunches(store);
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Level', 'Hud']);
        stopGameSystems(store);
    });

    it('what systems launched stops being launched when the systems are taken down halfway, and a failure is told', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            removals.push(registerGameSystem('test-halfway', () => {
                const scenes = useScene();
                scenes.launch('A');
                scenes.launch('B');
                scenes.launch('Broken');
            }));
            const { store } = createTestGame();
            const built: string[] = [];
            // A takes the systems down as it is built: B and Broken go with them.
            registerScene(store, 'A', () => {
                built.push('A');
                useReady(() => stopGameSystems(store));
                return createScene();
            });
            registerScene(store, 'B', () => {
                built.push('B');
                return createScene();
            });
            registerScene(store, 'Broken', () => { throw new Error('broken'); });
            startGameSystems(store);
            startTestScene(store, 'Level', () => createScene());
            flushSystemLaunches(store);
            expect(built).toEqual(['A']);
            expect(store.get('loop').failure).toBeNull();
        } finally {
            error.mockRestore();
        }
    });

    it('one that throws as it is launched is told to whoever reads the game\'s failure', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            removals.push(registerGameSystem('test-fails', () => { useScene().launch('Broken'); }));
            const { store } = createTestGame();
            registerScene(store, 'Broken', () => { throw new Error('broken'); });
            startGameSystems(store);
            startTestScene(store, 'Level', () => createScene());
            flushSystemLaunches(store);
            expect(store.get('loop').failure?.message).toBe('broken');
            stopGameSystems(store);
        } finally {
            error.mockRestore();
        }
    });

    it('isRunning answers to the name a document gave the scene\'s root too', () => {
        const { game, room } = roomAndLevel1();
        room().launch('Level1');
        expect(room().isRunning('Level1')).toBe(true);
        expect(game.scenes).toEqual(['Room', 'Room']);
        room().stop('Level1');
        expect(room().isRunning('Room')).toBe(true);
        expect(room().isRunning('Level1')).toBe(false);
    });

    it('a body that throws while built in another\'s place leaves nothing behind that later builds would read', () => {
        const { store } = createTestGame();
        const level = startTestScene(store, 'Level', () => createScene());
        startTestScene(store, 'Hud', () => createScene());
        registerScene(store, 'Bad', () => { throw new Error('bad'); });
        expect(() => startScene(store, 'Bad', {}, inPlaceOf(store, level))).toThrow('bad');
        expect(scenesOnceBuilt(store)).toEqual(store.get('world').scenes);
    });
});

describe('what the sixth review asked for', () => {
    it('a scene restarting itself every frame until it goes: only the first call does anything, and nothing is said', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let built = 0;
            let dead = false;
            const results: boolean[] = [];
            const game = createHeadlessGame({
                width: 16,
                height: 16,
                scenes: {
                    Boot: () => {
                        const scene = useScene();
                        useReady(() => {
                            scene.launch('Level');
                            scene.launch('Hud');
                            scene.stop();
                        });
                        return createScene();
                    },
                    Level: () => {
                        built++;
                        const scene = useScene();
                        useUpdate(() => {
                            if (dead) {
                                results.push(scene.restart({ transition: fade(0.5) }));
                            }
                        });
                        return createScene();
                    },
                    Hud: () => createScene(),
                },
            });
            dead = true;
            game.run(10);
            dead = false;
            game.run(60);
            expect(built).toBe(2);
            expect(results.length).toBeGreaterThan(1);
            expect(results.every((result) => result)).toBe(true);
            expect(warn).not.toHaveBeenCalled();
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            warn.mockRestore();
        }
    });

    it('cut, twice from the same old copy: the second says nothing and builds nothing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { game, level } = setup();
            const old = level();
            expect(old.restart()).toBe(true);
            expect(old.restart()).toBe(true);
            expect(old.restart('Level')).toBe(true);
            expect(warn).not.toHaveBeenCalled();
            expect(game.scenes).toEqual(['Level', 'Hud']);
        } finally {
            warn.mockRestore();
        }
    });

    it('a pause heard by its document\'s name that a listener undoes is not told again by the registered name', () => {
        const level1Doc = sceneFromDoc(parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
            root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
        }, 'test'), 'Level1');
        let hud!: TSceneHandle;
        const heard: string[] = [];
        createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level1: level1Doc,
                Hud: () => {
                    hud = useScene();
                    hud.onPaused(() => {
                        heard.push('Room');
                        hud.restart('Room');
                    }, 'Room');
                    hud.onPaused(() => heard.push('Level1'), 'Level1');
                    return createScene();
                },
            },
        });
        hud.pause('Level1');
        expect(heard).toEqual(['Room']);
        expect(hud.isPaused('Level1')).toBe(false);
    });

    it('a game ended by what its systems launched draws nothing more', () => {
        let drawnAfter = 0;
        removals.push(registerGameSystem('test-ends-first', () => {
            const store = getActiveGame()!;
            const renderer = store.get('screen').renderer;
            const frame = renderer.frame.bind(renderer);
            renderer.frame = (ctx) => {
                if (store.get('loop').destroyed) drawnAfter++;
                frame(ctx);
            };
            useScene().launch('Hud');
        }));
        createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => createScene(),
                // Ends the game on the frame it is launched in, which has no step: the first.
                Hud: () => {
                    const store = getActiveGame()!;
                    useReady(() => store.setState('loop', { destroyed: true }));
                    return createScene();
                },
            },
        });
        expect(drawnAfter).toBe(0);
    });
});

describe('three more cases an outside review found', () => {
    /**
     * A scene registered as 'Room', and Level1, whose document calls its root 'Room' too, with a
     * HUD over them.
     */
    const roomAndLevel1UnderHud = () => {
        const level1Doc = sceneFromDoc(parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
            root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
        }, 'test'), 'Level1');
        let hud!: TSceneHandle;
        let level1!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Room');
                        scene.launch('Level1');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Room: () => createScene(),
                Level1: () => {
                    level1 = useScene();
                    return level1Doc();
                },
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
            },
        });
        return { game, hud: () => hud, level1: () => level1 };
    };

    it('onPaused and onResumed by a name hear only the scene pause would pause by that name', () => {
        const { hud } = roomAndLevel1UnderHud();
        const heard: string[] = [];
        hud().onPaused(() => heard.push('Room paused'), 'Room');
        hud().onResumed(() => heard.push('Room resumed'), 'Room');
        hud().onPaused(() => heard.push('Level1 paused'), 'Level1');
        hud().pause('Level1');
        hud().resume('Level1');
        expect(heard).toEqual(['Level1 paused']);
        expect(hud().isPaused('Room')).toBe(false);
        hud().pause('Room');
        hud().resume('Room');
        expect(heard).toEqual(['Level1 paused', 'Room paused', 'Room resumed']);
    });

    it('an old copy that restarted itself still restarts another scene registered under its root\'s name', () => {
        const told: string[] = [];
        const level1Doc = sceneFromDoc(parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Other', assets: [],
            root: { id: 'root', name: 'Other', transform: null, children: [], components: [] },
        }, 'test'), 'Level1');
        let level1!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => {
                        scene.launch('Level1');
                        scene.stop();
                    });
                    return createScene();
                },
                Level1: () => {
                    level1 = useScene();
                    return level1Doc();
                },
                Other: () => {
                    told.push('Other up');
                    return createScene();
                },
            },
        });
        const old = level1;
        // Level1's root is called 'Other': once it restarted itself, its old handle names the scene
        // registered as 'Other', which is not running, and says so; it does not pretend it restarted.
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(old.restart()).toBe(true);
            expect(old.restart('Level1')).toBe(true);
            expect(old.restart('Other')).toBe(false);
            expect(warn.mock.calls.map((call) => String(call[0]))).toContain("[NacatamalOn] useScene().restart: scene 'Other' is not running.");
            // Nothing was built for it: the scene registered as 'Other' never ran, and Level1 was
            // built again once, by the first call.
            expect(told).toEqual([]);
            expect(game.scenes).toEqual(['Other']);
        } finally {
            warn.mockRestore();
        }
    });

    it('what a system launched is in the first picture even when the level waits to hear its transition end', () => {
        removals.push(registerGameSystem('test-first-image', () => { useScene().launch('Hud'); }));
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    useSceneTransitionEnd(() => {});
                    return createScene();
                },
                Hud: () => createScene(),
            },
        });
        expect(game.scenes).toEqual(['Level', 'Hud']);
    });
});

describe('what random sequences of scene changes found', () => {
    /**
     * A level under a HUD, with the game's store kept, and room for more scenes.
     */
    const levelAndHud = (extra: Record<string, (props: never) => ReturnType<typeof createScene>> = {}) => {
        let hud!: TSceneHandle;
        let store!: NonNullable<ReturnType<typeof getActiveGame>>;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    store = getActiveGame()!;
                    useReady(() => {
                        scene.launch('Level');
                        scene.launch('Hud');
                        scene.stop();
                    });
                    return createScene();
                },
                Level: () => createScene(),
                Hud: () => {
                    hud = useScene();
                    return createScene();
                },
                Menu: () => createScene(),
                ...extra,
            },
        });
        return { game, hud: () => hud, store: () => store };
    };

    it('a handle kept past the game\'s end starts, changes and restarts nothing', () => {
        let menuBuilt = 0;
        let levelBuilt = 0;
        let level!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    levelBuilt++;
                    level = useScene();
                    return createScene();
                },
                Menu: () => {
                    menuBuilt++;
                    return createScene();
                },
            },
        });
        const kept = level;
        game.destroy();
        kept.launch('Menu');
        kept.change('Menu');
        expect(kept.restart()).toBe(false);
        expect(menuBuilt).toBe(0);
        expect(levelBuilt).toBe(1);
    });

    it('a cleanup run as the game ends launches nothing into it', () => {
        let built = 0;
        let store!: NonNullable<ReturnType<typeof getActiveGame>>;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    const scene = useScene();
                    store = getActiveGame()!;
                    useCleanup(() => { if (!scene.isRunning('Menu')) scene.launch('Menu'); });
                    return createScene();
                },
                Menu: () => {
                    built++;
                    return createScene();
                },
            },
        });
        game.destroy();
        expect(built).toBe(0);
        expect(store.get('world').scenes.map((scene) => scene.name)).not.toContain('Menu');
    });

    it('a scene launched covered that stops itself from its useReady takes the cover with it', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { game, hud, store } = levelAndHud({
                Popup: () => {
                    const scene = useScene();
                    useReady(() => scene.stop());
                    return createScene();
                },
            });
            hud().launch('Popup', { transition: fade(0.5) });
            expect(store().get('transition').active).toBeNull();
            // So a covered call right after is not refused for a cover that brings nothing in.
            hud().launch('Menu', { transition: fade(0.1) });
            game.run(30);
            expect(game.scenes).toEqual(['Level', 'Hud', 'Menu']);
            expect(warn.mock.calls.some((call) => String(call[0]).includes('already being covered'))).toBe(false);
        } finally {
            warn.mockRestore();
        }
    });

    it('a scene changed to, covered, that stops itself from its useReady lets the change finish onto what is left', () => {
        let level!: TSceneHandle;
        let store!: NonNullable<ReturnType<typeof getActiveGame>>;
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const game = createHeadlessGame({
                width: 16,
                height: 16,
                scenes: {
                    Level: () => {
                        level = useScene();
                        store = getActiveGame()!;
                        return createScene();
                    },
                    Gone: () => {
                        const scene = useScene();
                        useReady(() => scene.stop());
                        return createScene();
                    },
                },
            });
            level.change('Gone', { transition: fade(0.2) });
            game.run(60);
            // Uncovered, the level gone as a cut would leave it, and nothing still waiting.
            expect(store.get('transition').active).toBeNull();
            expect(game.scenes).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });

    it('a change without a transition: the scene coming in cannot restart or stop the one it replaces from its body', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { game, hud } = levelAndHud({
                L2: () => {
                    const scene = useScene();
                    scene.restart('Hud');
                    scene.stop('Hud');
                    return createScene();
                },
            });
            hud().change('L2');
            expect(game.scenes).toEqual(['Level', 'L2']);
            const said = warn.mock.calls.map((call) => String(call[0]));
            expect(said.some((line) => line.includes("useScene().restart: 'Hud' is part of a scene change being covered right now"))).toBe(true);
            expect(said.some((line) => line.includes("useScene().stop: 'Hud' is part of a scene change being covered right now"))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('the latch of a scene that restarted itself lets go once the copy it built is gone', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let built = 0;
            const handles: TSceneHandle[] = [];
            const { hud } = levelAndHud({
                Level: () => {
                    built++;
                    handles.push(useScene());
                    return createScene();
                },
            });
            const old = handles[0]!;
            old.restart();
            // While the copy it built runs, the old handle asking again does nothing.
            expect(old.restart('Level')).toBe(true);
            expect(built).toBe(2);
            hud().stop('Level');
            hud().launch('Level');
            expect(built).toBe(3);
            // Another copy, not the one it built: restarted, as from any handle.
            expect(old.restart('Level')).toBe(true);
            expect(built).toBe(4);
        } finally {
            warn.mockRestore();
        }
    });

    it('the handle of a scene whose body threw changes nothing: it never ran', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let broken!: TSceneHandle;
            let failNext = true;
            const { game, hud, store } = levelAndHud({
                Broken: () => {
                    broken = useScene();
                    if (failNext) throw new Error('boom');
                    return createScene();
                },
            });
            expect(() => hud().launch('Broken')).toThrow('boom');
            failNext = false;
            broken.change('Menu', { transition: fade(0.2) });
            expect(store().get('transition').active).toBeNull();
            game.run(30);
            expect(game.scenes).toEqual(['Level', 'Hud']);
            expect(warn.mock.calls.map((call) => String(call[0]))).toContain("[NacatamalOn] useScene().change: its own scene 'Broken' is not running.");
        } finally {
            warn.mockRestore();
        }
    });
});

describe('a game ended by the cleanups of the scene being started over', () => {
    const endingLevel = () => {
        let built = 0;
        let level!: TSceneHandle;
        let store!: NonNullable<ReturnType<typeof getActiveGame>>;
        const holder: { game?: ReturnType<typeof createHeadlessGame> } = {};
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    built++;
                    level = useScene();
                    store = getActiveGame()!;
                    // The level, as it goes, ends the game.
                    useCleanup(() => holder.game?.destroy());
                    return createScene();
                },
            },
        });
        holder.game = game;
        return { game, level: () => level, store: () => store, built: () => built };
    };

    for (const [how, transition] of [['cut', undefined], ['faded', fade(0.2)], ['crossed', crossfade(0.2)]] as const) {
        it(`a restart ${how} builds no new copy into it`, () => {
            const { game, level, store, built } = endingLevel();
            if (transition === undefined) {
                expect(level().restart()).toBe(false);
            } else {
                level().restart({ transition });
                game.run(30);
            }
            expect(store().get('loop').destroyed).toBe(true);
            expect(built()).toBe(1);
        });
    }

    it('a change to its own name builds no new copy into it', () => {
        const { level, store, built } = endingLevel();
        level().change('Level');
        expect(store().get('loop').destroyed).toBe(true);
        expect(built()).toBe(1);
    });
});

describe('what the eighth review found', () => {
    it('a system\'s waiting launch of a name a running document\'s root answers to is left, and said', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            removals.push(registerGameSystem('test-root-name', () => { useScene().launch('Room'); }));
            const level1Doc = sceneFromDoc(parseSceneDoc({
                format: 'nacatamalon-scene', version: 1, name: 'Room', assets: [],
                root: { id: 'root', name: 'Room', transform: null, children: [], components: [] },
            }, 'test'), 'Level1');
            const game = createHeadlessGame({ width: 16, height: 16, scenes: { Level1: level1Doc, Room: () => createScene() } });
            game.run(1);
            expect(game.scenes).toEqual(['Room']);
            expect(error).not.toHaveBeenCalled();
            expect(warn.mock.calls.map((call) => String(call[0])).some((line) => line.includes("'Room', launched by game system 'test-root-name' before the game had a scene, was already running once it was shown"))).toBe(true);
        } finally {
            warn.mockRestore();
            error.mockRestore();
        }
    });

    it('a change without a transition from a scene\'s own body is left, and said; covered, it goes ahead', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        // A level that, the first time it is built, changes to Next from its own body.
        const changingFromItsBody = (transition: TTransition | undefined) => {
            let built = 0;
            return createHeadlessGame({
                width: 16,
                height: 16,
                scenes: {
                    Boot: () => {
                        const scene = useScene();
                        useReady(() => scene.launch('Level'));
                        return createScene();
                    },
                    Level: () => {
                        built++;
                        const scene = useScene();
                        if (built === 1) scene.change('Next', transition === undefined ? undefined : { transition });
                        return createScene();
                    },
                    Next: () => createScene(),
                },
            });
        };
        try {
            const cut = changingFromItsBody(undefined);
            expect(cut.scenes).toEqual(['Boot', 'Level']);
            expect(warn.mock.calls.map((call) => String(call[0]))).toContain("[NacatamalOn] useScene().change: 'Level' is still being built, so it was left as it is. Change from its useReady, or with a transition.");
            const covered = changingFromItsBody(fade(0.1));
            covered.run(30);
            expect(covered.scenes).toEqual(['Boot', 'Next']);
        } finally {
            warn.mockRestore();
        }
    });

    it('a scene is not started again while its body runs: a body launching its own name throws, and isRunning says so', () => {
        const seen: boolean[] = [];
        let built = 0;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    const scene = useScene();
                    useReady(() => scene.launch('Level'));
                    return createScene();
                },
                Level: () => {
                    built++;
                    const scene = useScene();
                    seen.push(scene.isRunning('Level'));
                    if (built === 1) {
                        expect(() => scene.launch('Level')).toThrow("[NacatamalOn] scenes: 'Level' is being started right now (its body is running), so it cannot start again.");
                    }
                    return createScene();
                },
            },
        });
        expect(game.scenes).toEqual(['Boot', 'Level']);
        expect(built).toBe(1);
        expect(seen).toEqual([true]);
    });

    it('two scenes each making sure of the other start once each', () => {
        let level = 0;
        let hud = 0;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Level: () => {
                    level++;
                    const scene = useScene();
                    if (!scene.isRunning('Hud')) scene.launch('Hud');
                    return createScene();
                },
                Hud: () => {
                    hud++;
                    const scene = useScene();
                    if (!scene.isRunning('Level')) scene.launch('Level');
                    return createScene();
                },
            },
        });
        expect([level, hud]).toEqual([1, 1]);
        expect(game.scenes).toEqual(['Hud', 'Level']);
    });

    it('a scene whose body ends the game is taken down, not left listed, and its cleanups run', () => {
        const told: string[] = [];
        let store!: NonNullable<ReturnType<typeof getActiveGame>>;
        const holder: { game?: ReturnType<typeof createHeadlessGame> } = {};
        let hud!: TSceneHandle;
        const game = createHeadlessGame({
            width: 16,
            height: 16,
            scenes: {
                Boot: () => {
                    hud = useScene();
                    store = getActiveGame()!;
                    return createScene();
                },
                Hud: () => {
                    // The old copy ends the game as it goes.
                    useCleanup(() => holder.game?.destroy());
                    return createScene();
                },
                Level: () => {
                    useScene().restart('Hud');
                    useCleanup(() => told.push('Level down'));
                    return createScene();
                },
            },
        });
        holder.game = game;
        hud.launch('Hud');
        hud.launch('Level');
        expect(store.get('loop').destroyed).toBe(true);
        expect(store.get('world').scenes.map((scene) => scene.name)).not.toContain('Level');
        expect(told).toEqual(['Level down']);
    });

    it('a covered restart whose old copy starts its own name again as it stops says so, not that its body threw', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            let level!: TSceneHandle;
            let copies = 0;
            const game = createHeadlessGame({
                width: 16,
                height: 16,
                scenes: {
                    Level: () => {
                        copies++;
                        level = useScene();
                        const hud = level;
                        // The first copy, as it goes, starts a scene under its own name: a document
                        // whose root is called 'Level'.
                        if (copies === 1) useCleanup(() => hud.launch('Doc'));
                        return createScene();
                    },
                    Doc: sceneFromDoc(parseSceneDoc({
                        format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
                        root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
                    }, 'test'), 'Doc'),
                },
            });
            level.restart({ transition: fade(0.2) });
            game.run(30);
            expect(error).not.toHaveBeenCalled();
            expect(warn.mock.calls.map((call) => String(call[0])).some((line) => line.includes("scene 'Level': it was not built again, because scene 'Level' (started as 'Doc') started under that name while the old copy was stopping"))).toBe(true);
            expect(copies).toBe(1);
        } finally {
            warn.mockRestore();
            error.mockRestore();
        }
    });
});

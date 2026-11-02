import { describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { fade } from '../src/transition';
import { findScene } from '../src/scene/find_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { stopScene } from '../src/scene/stop_scene';
import { tick } from '../src/game/loop/tick';
import { trackLoad } from '../src/loaders/track_load';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useScene } from '../src/hooks/scene/use_scene';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { useReady } from '../src/hooks/scene/use_ready';
import { useSceneTransitionEnd } from '../src/hooks/scene/use_scene_transition_end';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { getActiveBox } from '../src/store';
import { createPixelTexture } from '../src/gameobjects/pixel_texture/create_pixel_texture';
import { createPixels } from '../src/pixels/create_pixels';
import type { TLoadStatus } from '../src/loaders';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TBox } from '../src/box';
import type { TTexture } from '../src/loaders/texture/types/t_texture';

/**
 * What the engine has to own about a covered scene change, which is the lifecycle and not the
 * shader.
 *
 * Three things are being pinned, and each of them is a bug somebody would otherwise ship:
 *
 * 1. The scene coming in **exists without being seen, updated or clicked on**. It exists so its
 *    loading can start; it is not seen because the screen is still showing the scene it replaces;
 *    it does not tick because a scene ticking behind a cover arrives at its first visible frame
 *    already several frames old.
 * 2. The swap waits for the **later** of two things: the screen being covered and the new scene
 *    having loaded. That is what makes a transition worth having twice over.
 * 3. It always comes off. Not slowed by `timeScale`, not stopped by a pause: a screen left covered
 *    has no menu visible to get out of it.
 */

// The loop schedules its next frame before doing anything else. Nothing here wants that frame, so
// it is answered and dropped: the tests drive the clock themselves.
(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1 / 60;

/**
 * A game whose frames are driven by hand, at a fixed rate unless a test says otherwise.
 */
const drivenGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const ctx = createFrameContext();
    let now = 0;

    const frame = (step = FRAME): void => {
        const prev = now;
        now += step * 1000;
        tick(store, ctx, now, prev);
    };
    /**
     * Enough whole frames to cover `seconds`, which is how a cover actually finishes.
     */
    const frames = (seconds: number): void => {
        for (let left = seconds; left > 0; left -= FRAME) {
            frame();
        }
    };

    return { store, canvas, ctx, frame, frames };
};

/**
 * Two rooms and a handle on the first. `B` counts its own updates and puts one sprite on screen,
 * so "did it tick" and "was it drawn" are both answerable.
 */
const twoRooms = () => {
    const driven = drivenGame();
    const counted = { updates: 0, unmounted: 0 };

    registerScene(driven.store, 'B', () => {
        useUpdate(() => { counted.updates += 1; });
        createSprite({ width: 8, height: 8, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        return createScene();
    });

    let handle!: TSceneHandle;
    startTestScene(driven.store, 'A', () => {
        handle = useScene();
        useCleanup(() => { counted.unmounted += 1; });
        createSprite({ width: 8, height: 8, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        return createScene();
    });

    return { ...driven, counted, handle: () => handle };
};

/**
 * How many things the last frame handed the renderer.
 */
const drawnCount = (ctx: ReturnType<typeof createFrameContext>): number => ctx.passes[0].drawables?.length ?? 0;

describe('a scene held behind a transition', () => {
    it('is running from the moment of the change, and is the only one not drawn', () => {
        const { store, ctx, frame, counted, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });

        const incoming = findScene(store, 'B');
        expect(incoming).toBeDefined();
        expect(incoming!.held).toBe(true);
        // Both are running: the one going out is still what the screen shows.
        expect(store.get('world').scenes).toHaveLength(2);

        frame();
        // One sprite, and it is A's. B exists and contributes nothing.
        expect(drawnCount(ctx)).toBe(1);
        expect(counted.updates).toBe(0);
    });

    it('does not answer the pointer, so it cannot act on a frame nobody saw', () => {
        const { store, canvas, frame, handle } = twoRooms();
        const seen: unknown[] = [];

        registerScene(store, 'C', () => {
            const pointer = usePointer();
            pointer.onDown((info) => { seen.push(info); });
            return createScene();
        });

        handle().change('C', { transition: fade(0.3) });
        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 0, clientY: 0, button: 0, pointerId: 1 }));
        frame();

        expect(seen).toHaveLength(0);
    });
});

describe('the swap', () => {
    it('happens once the screen is covered, and not before', () => {
        const { store, frames, counted, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });

        // Half of 0.3 s is 0.15 s of cover. Just short of it, nothing has moved.
        frames(0.12);
        expect(findScene(store, 'A')).toBeDefined();
        expect(counted.unmounted).toBe(0);

        frames(0.06);
        expect(findScene(store, 'A')).toBeUndefined();
        expect(findScene(store, 'B')!.held).toBe(false);
        // The scene leaving runs its cleanups at the swap, not back when `change` was called: a
        // scene leaves when it stops being seen.
        expect(counted.unmounted).toBe(1);
        expect(counted.updates).toBeGreaterThan(0);
    });

    it('waits for the load even when the cover finished long ago', async () => {
        const { store, frames, handle } = twoRooms();
        const asset: { status: TLoadStatus } = { status: 'loading' };
        let arrive!: () => void;

        registerScene(store, 'Slow', () => {
            // Registered exactly the way a real loader registers one: on the scene's own list,
            // which is what `useLoader` counts, with its promise behind the same door.
            store.get('world').boxStack[0].loads.push(asset);
            trackLoad(asset, new Promise<void>((resolve) => {
                arrive = () => { asset.status = 'ready'; resolve(); };
            }));
            return createScene();
        });

        handle().change('Slow', { transition: fade(0.3) });
        frames(1);
        expect(store.get('transition').active!.phase).toBe('cover');
        expect(store.get('transition').active!.progress).toBe(1);
        expect(findScene(store, 'A')).toBeDefined();

        arrive();
        // The promise settles on a microtask, as it would from a real fetch.
        await Promise.resolve();
        frames(0.05);
        expect(findScene(store, 'A')).toBeUndefined();
    });
});

describe('the cover always comes off', () => {
    it('is not slowed by timeScale, and not stopped by a pause', () => {
        const { store, frames, handle } = twoRooms();
        store.setState('loop', { ...store.get('loop'), timeScale: 0, pausedBy: ['test'] });

        handle().change('B', { transition: fade(0.3) });
        frames(0.4);

        expect(store.get('transition').active).toBeNull();
        expect(findScene(store, 'A')).toBeUndefined();
        expect(findScene(store, 'B')).toBeDefined();
    });

    it('is still in the frame that reaches the end, and gone from the one after', () => {
        const { store, ctx, frame, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });

        // Driven until it says it has finished rather than counted out in advance: how many whole
        // frames fit in 0.3 s is not the thing being pinned here.
        for (let i = 0; i < 60 && store.get('transition').active?.done !== true; i++) {
            frame();
        }
        const state = store.get('transition').active;
        expect(state).not.toBeNull();
        expect(state!.done).toBe(true);
        // The effect is still in the chain on the frame that finished, so the last thing anybody
        // saw was the cover fully gone rather than a few percent of it left behind.
        expect(ctx.post).toHaveLength(1);
        expect(ctx.progress).toBe(1);

        frame();
        expect(store.get('transition').active).toBeNull();
        expect(ctx.post).toBeUndefined();
    });
});

describe('what the shader of a change reads', () => {
    it('counts up while covering, then says it is uncovering and counts up again', () => {
        // Through the frame's context, which is what reaches the shader, and not the transition's
        // own state: the state said 'reveal' all along, while a line lost on the way would have
        // left `phase` at 0 and every wipe coming back the way it went.
        const { store, ctx, frame, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });

        const seen: { phase: number; progress: number }[] = [];
        for (let i = 0; i < 60 && store.get('transition').active?.done !== true; i++) {
            frame();
            seen.push({ phase: ctx.phase, progress: ctx.progress });
        }
        const covering = seen.filter((sample) => sample.phase === 0);
        const uncovering = seen.filter((sample) => sample.phase === 1);

        expect(covering.length).toBeGreaterThan(2);
        expect(uncovering.length).toBeGreaterThan(2);
        // Every covering frame before every uncovering one, never back and forth.
        expect(seen.map((sample) => sample.phase)).toEqual([...covering.map(() => 0), ...uncovering.map(() => 1)]);
        for (const half of [covering, uncovering]) {
            for (let i = 1; i < half.length; i++) {
                expect(half[i].progress).toBeGreaterThanOrEqual(half[i - 1].progress);
            }
            expect(half[0].progress).toBeLessThan(0.5);
        }
        // The frame that finishes covering is already the first of uncovering, carrying what it
        // went over, so covering ends a frame short of 1 and uncovering ends on it.
        const oneFrame = FRAME / 0.15;
        expect(covering[covering.length - 1].progress).toBeGreaterThanOrEqual(1 - oneFrame - 1e-9);
        expect(uncovering[uncovering.length - 1].progress).toBe(1);
    });
});

describe('a change that cannot be made', () => {
    it('is refused while another one is being covered, rather than stranding it', () => {
        const { store, frame, handle } = twoRooms();
        let other!: TSceneHandle;
        registerScene(store, 'D', () => createScene());

        handle().change('B', { transition: fade(0.3) });
        // A scene launched alongside holds its own handle and knows nothing about the change in
        // flight. Cutting now would leave that change with neither of its ends.
        startTestScene(store, 'Hud', () => {
            other = useScene();
            return createScene();
        });
        other.change('D');

        frame();
        expect(findScene(store, 'D')).toBeUndefined();
        expect(store.get('transition').active).not.toBeNull();
        expect(store.get('transition').active!.incoming!.name).toBe('B');
    });

    it('will not let either end be stopped out from under it', () => {
        const { store, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });

        expect(handle().stop('A')).toBe(false);
        expect(handle().stop('B')).toBe(false);
        expect(findScene(store, 'A')).toBeDefined();
        expect(findScene(store, 'B')).toBeDefined();
    });

    it('lets go of a transition whose end is torn down by the lower door', () => {
        const { store, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });

        // `stopScene` is the door a destroyed game and a host loading another scene both go
        // through, and neither of those is polite enough to ask first.
        stopScene(store, 'B');

        expect(store.get('transition').active).toBeNull();
    });

});

/**
 * A level that restarts itself, and a HUD over it. Each copy of the level counts its own updates
 * and cleanups and keeps its own handle, so which copy did what is answerable. `ask` is what the
 * next copy's body does besides, to make one that loads something new or that throws.
 */
const restartingLevel = (ask: () => void = () => {}) => {
    const driven = drivenGame();
    const copies: { root: TBox; handle: TSceneHandle; updates: number; cleaned: number; ended: number; props: object }[] = [];
    const level = { ask };
    let hud!: TSceneHandle;

    registerScene(driven.store, 'Hud', () => {
        hud = useScene();
        return createScene();
    });
    startTestScene(driven.store, 'Level', (props) => {
        const copy = { root: getActiveBox()!, handle: useScene(), updates: 0, cleaned: 0, ended: 0, props };
        copies.push(copy);
        useUpdate(() => { copy.updates += 1; });
        useCleanup(() => { copy.cleaned += 1; });
        useSceneTransitionEnd(() => { copy.ended += 1; });
        level.ask();
        return createScene();
    });
    startScene(driven.store, 'Hud');

    return { ...driven, copies, level, hud: () => hud };
};

describe('a scene restarting itself with a transition', () => {
    it('is covered: the old copy runs on screen until the swap, and the new one is built there', () => {
        const { store, frame, frames, copies } = restartingLevel();
        const [old] = copies;
        old!.handle.change('Level', { transition: fade(0.3) });

        // Never two copies at once: the new one is not built yet.
        expect(copies).toHaveLength(1);
        expect(store.get('transition').active!.outgoing).toBe(old!.root);
        frames(0.1);
        expect(old!.updates).toBeGreaterThan(0);
        expect(old!.cleaned).toBe(0);

        frames(0.05);
        frame();
        const [, fresh] = copies;
        expect(old!.cleaned).toBe(1);
        expect(fresh!.root.held).toBe(false);
        expect(store.get('world').scenes.filter((scene) => scene.name === 'Level')).toEqual([fresh!.root]);
        expect(findScene(store, 'Level')).toBe(fresh!.root);
        // Its end waits for the uncover, as any scene coming in does.
        expect(fresh!.ended).toBe(0);

        frames(0.2);
        expect(store.get('transition').active).toBeNull();
        expect(fresh!.updates).toBeGreaterThan(0);
        expect(fresh!.ended).toBe(1);
    });

    it('hands the new copy its props, and says nothing about it', () => {
        const { frames, copies } = restartingLevel();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        copies[0]!.handle.change('Level', { transition: fade(0.3), props: { lives: 2 } });
        frames(0.2);

        expect(copies[1]!.props).toEqual({ lives: 2 });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('leaves the old copy alone while it is covered, and runs only once', () => {
        const { store, frames, copies, hud } = restartingLevel();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [old] = copies;
        old!.handle.change('Level', { transition: fade(0.3) });

        expect(hud().stop('Level')).toBe(false);
        expect(old!.handle.stop()).toBe(false);
        // The latch is set: the condition that asked usually stays true for a while.
        old!.handle.change('Level', { transition: fade(0.3) });
        warn.mockRestore();

        frames(0.5);
        expect(copies).toHaveLength(2);
        expect(store.get('world').scenes.filter((scene) => scene.name === 'Level')).toEqual([copies[1]!.root]);
    });

    it('keeps the screen covered while the new copy loads something new', async () => {
        const { store, frames, copies, level } = restartingLevel();
        const asset: { status: TLoadStatus } = { status: 'loading' };
        let arrive!: () => void;
        level.ask = () => {
            store.get('world').boxStack[0].loads.push(asset);
            trackLoad(asset, new Promise<void>((resolve) => {
                arrive = () => { asset.status = 'ready'; resolve(); };
            }));
        };
        copies[0]!.handle.change('Level', { transition: fade(0.3) });

        frames(1);
        const [, fresh] = copies;
        expect(fresh!.root.held).toBe(true);
        expect(fresh!.updates).toBe(0);
        expect(store.get('transition').active!.phase).toBe('cover');
        expect(store.get('transition').active!.progress).toBe(1);

        arrive();
        await Promise.resolve();
        frames(0.05);
        expect(fresh!.root.held).toBe(false);
        expect(store.get('transition').active!.phase).toBe('reveal');
        frames(0.2);
        expect(store.get('transition').active).toBeNull();
        expect(fresh!.ended).toBe(1);
    });

    it('reports a new copy that throws, takes the cover away, and leaves the game as a cut would', () => {
        const { store, frames, copies, level } = restartingLevel();
        const error = spyOn(console, 'error').mockImplementation(() => {});
        level.ask = () => { throw new Error('broken level'); };
        copies[0]!.handle.change('Level', { transition: fade(0.3) });

        frames(0.2);
        expect(store.get('transition').active).toBeNull();
        expect(store.get('loop').failure?.message).toBe('broken level');
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Hud']);
        error.mockRestore();
    });

    it('builds the new copy once the old one has let go of what it keeps under a key', () => {
        const textures: TTexture[] = [];
        const { frames, copies } = restartingLevel(() => {
            textures.push(createPixelTexture(createPixels(4, 4), { key: 'terrain' }));
        });
        copies[0]!.handle.change('Level', { transition: fade(0.3) });

        // Covering: the old copy still shows its picture, and nobody has asked for it again.
        frames(0.1);
        expect(textures).toHaveLength(1);
        expect(textures[0]!.status).not.toBe('released');

        frames(0.1);
        expect(textures).toHaveLength(2);
        expect(textures[1]).toBe(textures[0]);
    });

    it('lets the old copy\'s listeners go with it', () => {
        const heard: number[] = [];
        let built = 0;
        const { frames, copies, hud } = restartingLevel(() => {
            const copy = ++built;
            useScene().onPaused(() => { heard.push(copy); });
        });
        copies[0]!.handle.change('Level', { transition: fade(0.3) });
        frames(0.5);

        hud().pause('Level');
        expect(heard).toEqual([2]);
    });

    it('takes the cover away when the new copy\'s useReady throws, and keeps that copy alone', () => {
        const { store, frames, copies, level } = restartingLevel();
        const error = spyOn(console, 'error').mockImplementation(() => {});
        level.ask = () => { useReady(() => { throw new Error('broken ready'); }); };
        copies[0]!.handle.change('Level', { transition: fade(0.3) });

        frames(0.2);
        expect(store.get('transition').active).toBeNull();
        expect(copies[0]!.cleaned).toBe(1);
        expect(store.get('world').scenes.filter((scene) => scene.name === 'Level')).toEqual([copies[1]!.root]);
        expect(copies[1]!.root.held).toBe(false);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('uncovers onto what is left when the new copy stops itself in its useReady', () => {
        const { store, frames, copies, level } = restartingLevel();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        level.ask = () => {
            const scene = useScene();
            useReady(() => { scene.stop(); });
        };
        copies[0]!.handle.change('Level', { transition: fade(0.3) });

        frames(0.5);
        expect(store.get('transition').active).toBeNull();
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Hud']);
        warn.mockRestore();
    });

    it('says so, and does nothing, from a copy someone else has already stopped', () => {
        const { store, copies, hud } = restartingLevel();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [old] = copies;
        hud().stop('Level');
        hud().launch('Level');

        old!.handle.change('Level', { transition: fade(0.3) });
        expect(store.get('transition').active).toBeNull();
        expect(store.get('world').scenes.filter((scene) => scene.name === 'Level')).toEqual([copies[1]!.root]);
        expect(String(warn.mock.calls[0]![0])).toMatch(/useScene\(\)\.change: its own scene 'Level' is not running/);
        warn.mockRestore();
    });

    it('knows a scene built from a document by the name it was started under', () => {
        const { store, frames } = drivenGame();
        const handles: TSceneHandle[] = [];
        // A document gives its root the name it says, which need not be the one it was registered by.
        startTestScene(store, 'room-a', () => {
            getActiveBox()!.name = 'Room';
            handles.push(useScene());
            return createScene();
        });

        expect(() => startScene(store, 'room-a')).toThrow(/'room-a' is already running/);
        handles[0]!.change('room-a', { transition: fade(0.3) });
        expect(store.get('world').scenes).toHaveLength(1);

        frames(0.5);
        expect(handles).toHaveLength(2);
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['Room']);
    });

    it('stops its own old copy, not another scene answering to the same name', () => {
        const { store, frames } = drivenGame();
        const handles: TSceneHandle[] = [];
        startTestScene(store, 'Menu', () => createScene());
        registerScene(store, 'title', () => {
            getActiveBox()!.name = 'Menu';
            handles.push(useScene());
            return createScene();
        });
        const menu = findScene(store, 'Menu')!;
        startScene(store, 'title');

        handles[0]!.change('title', { transition: fade(0.3) });
        frames(0.5);
        expect(handles).toHaveLength(2);
        expect(store.get('world').scenes).toHaveLength(2);
        expect(store.get('world').scenes[0]).toBe(menu);
    });

    it('lets a handle with no name reach its own scene, not another answering to the same name', () => {
        const { store } = drivenGame();
        const handles: TSceneHandle[] = [];
        const heard: string[] = [];
        startTestScene(store, 'Menu', () => {
            handles.push(useScene());
            handles[0]!.onPaused(() => { heard.push('menu'); });
            return createScene();
        });
        registerScene(store, 'title', () => {
            getActiveBox()!.name = 'Menu';
            handles.push(useScene());
            handles[1]!.onPaused(() => { heard.push('title'); });
            return createScene();
        });
        const menu = findScene(store, 'Menu')!;
        const title = startScene(store, 'title');

        handles[1]!.pause();
        expect(title.paused).toBe(true);
        expect(menu.paused).toBe(false);
        expect(handles[1]!.isPaused()).toBe(true);
        expect(heard).toEqual(['title']);
        handles[0]!.pause();
        expect(heard).toEqual(['title', 'menu']);
        handles[0]!.resume();

        handles[1]!.stop();
        expect(store.get('world').scenes).toEqual([menu]);
    });

    it('still restarts at once without one', () => {
        const { store, copies } = restartingLevel();
        const [old] = copies;
        old!.handle.change('Level');

        expect(old!.cleaned).toBe(1);
        expect(store.get('transition').active).toBeNull();
        expect(store.get('world').scenes.filter((scene) => scene.name === 'Level')).toEqual([copies[1]!.root]);
    });
});

describe('a scene launched or stopped with a transition', () => {
    it('launches behind the cover, with the scene underneath still running, and shows it at the swap', () => {
        const { store, frame, frames, counted, handle } = twoRooms();
        handle().launch('B', { transition: fade(0.2) });

        const menu = findScene(store, 'B')!;
        expect(menu.held).toBe(true);
        expect(store.get('transition').active!.outgoing).toBeNull();

        frames(0.1);
        frame();
        expect(menu.held).toBe(false);
        expect(store.get('world').scenes.map((scene) => scene.name)).toEqual(['A', 'B']);
        expect(counted.updates).toBeGreaterThan(0);
        expect(counted.unmounted).toBe(0);

        frames(0.2);
        expect(store.get('transition').active).toBeNull();
    });

    it('stops behind the cover, its cleanups at the swap, and leaves the rest', () => {
        const { store, frame, frames, handle } = twoRooms();
        let closed = 0;
        registerScene(store, 'Menu', () => {
            useCleanup(() => { closed += 1; });
            return createScene();
        });
        handle().launch('Menu');

        expect(handle().stop('Menu', { transition: fade(0.2) })).toBe(true);
        frame();
        expect(findScene(store, 'Menu')).toBeDefined();
        expect(closed).toBe(0);

        frames(0.1);
        frame();
        expect(findScene(store, 'Menu')).toBeUndefined();
        expect(closed).toBe(1);
        expect(findScene(store, 'A')).toBeDefined();
    });

    it('stops the scene that asked, given only the options', () => {
        const { store, frames, handle } = twoRooms();
        let menu!: TSceneHandle;
        registerScene(store, 'Menu', () => {
            menu = useScene();
            return createScene();
        });
        handle().launch('Menu');

        expect(menu.stop({ transition: fade(0.2) })).toBe(true);
        frames(0.15);
        expect(findScene(store, 'Menu')).toBeUndefined();
        expect(findScene(store, 'A')).toBeDefined();
    });

    it('is refused while another one is being covered, and the scene is not started or stopped', () => {
        const { store, handle } = twoRooms();
        registerScene(store, 'Menu', () => createScene());
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            handle().launch('B', { transition: fade(0.2) });
            handle().launch('Menu', { transition: fade(0.2) });
            expect(findScene(store, 'Menu')).toBeUndefined();
            expect(handle().stop('A', { transition: fade(0.2) })).toBe(false);
            expect(findScene(store, 'A')).toBeDefined();
            expect(warn.mock.calls.some((call) => String(call[0]).includes('already being covered'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('runs the launched scene\'s useSceneTransitionEnd once it is uncovered', () => {
        const { store, frame, frames, handle } = twoRooms();
        let seen = 0;
        registerScene(store, 'Menu', () => {
            useSceneTransitionEnd(() => { seen += 1; });
            return createScene();
        });
        handle().launch('Menu', { transition: fade(0.2) });

        frames(0.1);
        frame();
        expect(seen).toBe(0);
        frames(0.2);
        expect(seen).toBe(1);
    });
});

describe('a covered change asked for while the scene of another is being built', () => {
    for (const via of ['launch', 'change'] as const) {
        it(`is refused, so the first one, by ${via}, keeps its scene and lets it go`, () => {
            const { store, frames, handle } = twoRooms();
            registerScene(store, 'Dialog', () => createScene());
            registerScene(store, 'Menu', () => {
                const menu = useScene();
                useReady(() => { menu.launch('Dialog', { transition: fade(0.2) }); });
                return createScene();
            });
            const warn = spyOn(console, 'warn').mockImplementation(() => {});
            try {
                if (via === 'launch') handle().launch('Menu', { transition: fade(0.2) });
                else handle().change('Menu', { transition: fade(0.2) });

                expect(findScene(store, 'Dialog')).toBeUndefined();
                expect(store.get('transition').active!.incoming!.name).toBe('Menu');
                frames(0.5);
                expect(store.get('transition').active).toBeNull();
                expect(findScene(store, 'Menu')!.held).toBe(false);
                expect(warn.mock.calls.some((call) => String(call[0]).includes('already being covered'))).toBe(true);
            } finally {
                warn.mockRestore();
            }
        });
    }

    it('lets go of the cover when the scene it was bringing in fails to build', () => {
        const { store, frame, handle } = twoRooms();
        registerScene(store, 'Broken', () => { throw new Error('broken'); });
        expect(() => handle().launch('Broken', { transition: fade(0.2) })).toThrow('broken');
        frame();
        expect(store.get('transition').active).toBeNull();
    });
});

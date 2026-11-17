import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHeadlessGame } from '../src/headless';
import { colorAdjust, outline } from '../src/post/builtin';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { crossfade } from '../src/transition';
import { startWithSplash } from '../src/splash/run_splash';
import { splashOf } from '../src/splash/behind_splash';
import { startGameSystems, stopGameSystems } from '../src/game_systems/game_systems';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createShapes } from '../src/gameobjects/shapes/create_shapes';
import { createPolygon } from '../src/gameobjects/polygon/create_polygon';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createParticles } from '../src/gameobjects/particles';
import { createTilemap } from '../src/gameobjects/tilemap';
import { createSpriteAtlas } from '../src/atlas';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useLines } from '../src/hooks/helpers/use_lines';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { captureScreen } from '../src/game/capture';
import { effectDoc } from './helpers/particles';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap } from './helpers/test_tilemap';
import { whenLoaded } from '../src/loaders';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import { useOverlay } from '../src/hooks/post/use_overlay';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useScene } from '../src/hooks/scene/use_scene';
import { useReady } from '../src/hooks/scene/use_ready';
import { useRenderStyle } from '../src/hooks/style';
import { useSelf } from '../src/hooks';
import { useMask } from '../src/hooks/mask/use_mask';
import { useFilter } from '../src/hooks/filter';
import { createPixels, fillRect, sheetFromRows } from '../src/pixels';
import { getColor } from '../src/color';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { cutsOf, overlayFrameOf, settleOver } from '../src/game/loop/helper/post_over';
import { newPostEffect } from '../src/post/new_post_effect';
import { normalizePostChain } from '../src/post/post_chain';
import { effectFromEntry, installPostChain } from '../src/post/install_post_chain';
import { isOverlayPlace } from '../src/post/overlay_place';
import { RENDER_STYLES } from '../src/style/styles';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import type { THeadlessGame } from '../src/headless';
import type { TPixels } from '../src/pixels';
import type { TSceneFn } from '../src/scene';
import type { TFrameContext } from '../src/render/interface';
import type { TBox } from '../src/box';
import type { TPostChain } from '../src/post';
import type { TRenderStyle } from '../src/style/t_render_style';

/**
 * What is drawn over the screen effects (`useOverlay`): once the effects before the chain's
 * `{ overlay: true }` entry have run, or all of them, untouched by those and under the ones after.
 * Only what is in front of everything else is drawn there, so nothing changes its order on screen.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const games: THeadlessGame[] = [];
afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
});

const make = (scenes: Record<string, TSceneFn>, more: { post?: TPostChain; style?: TRenderStyle } = {}): THeadlessGame => {
    const game = createHeadlessGame({ width: 32, height: 16, background: { r: 0, g: 0, b: 0, a: 1 }, scenes, ...more });
    games.push(game);
    game.run(1);
    return game;
};

const pixelAt = (pixels: TPixels, x: number, y: number): number[] => Array.from(pixels.data.subarray((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 3));

const block = (width: number, height: number, color: string, at: { x: number; y: number }) => {
    const pixels = createPixels(width, height);
    fillRect(pixels, 0, 0, width, height, getColor(color));
    return createSprite({ texture: createPixelTexture(pixels), anchor: { x: 0, y: 0 }, transform: { ...at } });
};

/** The world: white all over. */
const world = () => block(32, 16, '#ffffff', { x: 0, y: 0 });
/** A red square pinned to the top left, over the effects unless told otherwise. */
const hud = (overlay = true) => useSpawn(function Hud() {
    useScreenSpace();
    useOverlay(overlay);
    block(4, 4, '#ff0000', { x: 0, y: 0 });
})();

/** Every pixel black: what is under it shows it was run. */
const darken = () => colorAdjust({ brightness: 0 });
/** Every pixel grey: red comes out with its three channels the same. */
const grey = () => colorAdjust({ saturation: 0 });
const isGrey = (rgb: number[]) => rgb[0] === rgb[1] && rgb[1] === rgb[2] && rgb[0]! > 0;
/** The two as a chain's entries, with the place between them. */
const DARKEN = { builtin: 'colorAdjust', uniforms: { brightness: 0 } };
const GREY = { builtin: 'colorAdjust', uniforms: { saturation: 0 } };

describe('what is drawn over the screen effects', () => {
    it('draws an overlay over every effect, untouched, and the world under them; pinned alone is not one', () => {
        const over = make({ Scene: () => {
            world();
            hud();
            usePostProcess(darken());
            usePostProcess(grey());
            return createScene();
        } }).capture();
        expect(pixelAt(over, 1, 1)).toEqual([255, 0, 0]);
        expect(pixelAt(over, 20, 8)).toEqual([0, 0, 0]);

        // Pinned to the screen and nothing more: through the effects, as it always was.
        const pinned = make({ Scene: () => {
            world();
            hud(false);
            usePostProcess(darken());
            return createScene();
        } }).capture();
        expect(pixelAt(pinned, 1, 1)).toEqual([0, 0, 0]);
    });

    it('goes where the chain says { overlay: true }: the effects before it under, the ones after over it too', () => {
        const scene = { Scene: () => {
            world();
            hud();
            return createScene();
        } };
        const project = make(scene, { post: [DARKEN, { overlay: true }, GREY] }).capture();
        expect(isGrey(pixelAt(project, 1, 1))).toBe(true);
        expect(pixelAt(project, 20, 8)).toEqual([0, 0, 0]);

        // In a style the same: a CGI bloom under the HUD, an old screen over it.
        const style: TRenderStyle = { ...RENDER_STYLES.cgi, width: 32, height: 16, post: [DARKEN, { overlay: true }, GREY] };
        const styled = make(scene, { style }).capture();
        expect(isGrey(pixelAt(styled, 1, 1))).toBe(true);
        expect(pixelAt(styled, 20, 8)).toEqual([0, 0, 0]);

        // A scene's own effects come after the project's: after the place too.
        const sceneAfter = make({ Scene: () => {
            world();
            hud();
            usePostProcess(grey());
            return createScene();
        } }, { post: [DARKEN, { overlay: true }] }).capture();
        expect(isGrey(pixelAt(sceneAfter, 1, 1))).toBe(true);

        // At the very start: nothing under it, so it is drawn with the rest, through everything.
        const first = make(scene, { post: [{ overlay: true }, DARKEN] }).capture();
        expect(pixelAt(first, 1, 1)).toEqual([0, 0, 0]);

        // A place switched off is not used: after every effect.
        const off = make(scene, { post: [DARKEN, { overlay: true, enabled: false }, GREY] }).capture();
        expect(pixelAt(off, 1, 1)).toEqual([255, 0, 0]);
    });

    it('takes a HUD scene of its own started over the level, and a pause menu over the blur it asks for', () => {
        const hudScene = make({
            Level: () => {
                world();
                usePostProcess(darken());
                // Once the level is up, so the HUD is started after it, over it.
                const scenes = useScene();
                useReady(() => scenes.launch('Hud'));
                return createScene();
            },
            Hud: () => {
                useScreenSpace();
                useOverlay();
                block(4, 4, '#ff0000', { x: 0, y: 0 });
                return createScene();
            },
        });
        hudScene.run(1);
        expect(pixelAt(hudScene.capture(), 1, 1)).toEqual([255, 0, 0]);

        const pause = make({
            Level: () => {
                world();
                const scenes = useScene();
                useReady(() => scenes.launch('Pause'));
                return createScene();
            },
            Pause: () => {
                useScreenSpace();
                useOverlay();
                block(4, 4, '#ff0000', { x: 0, y: 0 });
                usePostProcess(darken());
                return createScene();
            },
        });
        pause.run(1);
        const shot = pause.capture();
        expect(pixelAt(shot, 1, 1)).toEqual([255, 0, 0]);
        expect(pixelAt(shot, 20, 8)).toEqual([0, 0, 0]);
    });

    it('takes every drawing of an overlay, shapes and outlines and maps too, whatever the card is handed', () => {
        const sheet = sheetFromRows({ red: ['rr', 'rr'] }, { r: '#ff0000' });
        const shot = make({ Scene: () => {
            world();
            useSpawn(function Hud() {
                useScreenSpace();
                useOverlay();
                block(4, 4, '#ff0000', { x: 0, y: 0 });
                createShapes({ shapes: [{ type: 'rect', x: 4, y: 0, width: 4, height: 4, fill: '#ff0000' }] });
                createPolygon({ points: [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 4 }, { x: 8, y: 4 }], tint: '#ff0000' });
                createTilemap({ doc: { cell: 2, width: 2, height: 1, tiles: { 1: { frame: 0 } }, layers: [{ name: 'frame', order: 'over', data: [1, 1] }] }, atlas: createSpriteAtlas({ texture: createPixelTexture(sheet.pixels), columns: sheet.columns }) });
            })();
            usePostProcess(darken());
            return createScene();
        } });
        shot.run(1);
        const picture = shot.capture();
        expect([pixelAt(picture, 1, 1), pixelAt(picture, 5, 1), pixelAt(picture, 10, 2), pixelAt(picture, 1, 0)]).toEqual([[255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0]]);
        expect(pixelAt(picture, 20, 8)).toEqual([0, 0, 0]);
    });

    it('leaves an overlay something is drawn in front of where it is, under the effects, and says so once', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            // The sign first, then the wall over all of it: drawn later the sign would come out on top.
            const game = make({ Scene: () => {
                useSpawn(function Sign() {
                    useOverlay();
                    block(4, 4, '#ff0000', { x: 0, y: 0 });
                })();
                useSpawn(function Wall() {
                    block(32, 16, '#ffffff', { x: 0, y: 0 });
                })();
                usePostProcess(darken());
                return createScene();
            } });
            game.run(3);
            // The wall in front of it, as it always was, and darkened like the rest.
            expect(pixelAt(game.capture(), 1, 1)).toEqual([0, 0, 0]);
            const said = warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes('useOverlay'));
            expect(said).toEqual(["[NacatamalOn] useOverlay: 'Sign' is drawn over the screen effects, but 'Wall', which is not, is drawn in front of it, so it stays under them, in its place. Draw it in front of that (a higher zIndex, or a scene started after), or make that an overlay too."]);
        } finally {
            warn.mockRestore();
        }
    });

    it('keeps an overlay inside the filter of an object that is not one under the effects with it, and says so', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const shot = make({ Scene: () => {
                world();
                const panel = useSpawn(function Panel() {
                    useSpawn(function Icon() {
                        useOverlay();
                        block(4, 4, '#ff0000', { x: 0, y: 0 });
                    })();
                })();
                useFilter({ effects: [outline({ color: '#00ff00', thickness: 1 })] }).add(panel);
                usePostProcess(darken());
                return createScene();
            } }).capture();
            expect(pixelAt(shot, 1, 1)).toEqual([0, 0, 0]);
            expect(warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes('useOverlay'))).toEqual([
                "[NacatamalOn] useOverlay: 'Icon' is drawn over the screen effects, but it is inside the filter of 'Panel', which is not, and a filter draws what it holds as one picture, in one place: it stays under them with it. Make 'Panel' an overlay too.",
            ]);
        } finally {
            warn.mockRestore();
        }
    });

    it('keeps a masked or filtered overlay over the effects, its mask and filter as they were', () => {
        const masked = make({ Scene: () => {
            world();
            useSpawn(function Hud() {
                useScreenSpace();
                useOverlay();
                const shape = useSpawn(function Shape() {
                    block(2, 2, '#ffffff', { x: 0, y: 0 });
                })();
                block(4, 4, '#ff0000', { x: 0, y: 0 });
                useMask({ by: shape }).add(useSelf());
            })();
            usePostProcess(darken());
            return createScene();
        } }).capture();
        expect(pixelAt(masked, 0, 0)).toEqual([255, 0, 0]);
        // Outside the mask the HUD is not drawn: the world under it shows, darkened.
        expect(pixelAt(masked, 3, 3)).toEqual([0, 0, 0]);

        const filtered = make({ Scene: () => {
            world();
            const box = hud();
            useFilter({ effects: [outline({ color: '#00ff00', thickness: 1 })] }).add(box);
            usePostProcess(darken());
            return createScene();
        } }).capture();
        expect(pixelAt(filtered, 1, 1)).toEqual([255, 0, 0]);
        expect(pixelAt(filtered, 4, 1)).toEqual([0, 255, 0]);
        expect(pixelAt(filtered, 20, 8)).toEqual([0, 0, 0]);
    });
});

describe('the place in a chain, and an overlay in a document', () => {
    it('reads { overlay: true } as a place, once, and makes it a record with nothing to run', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(normalizePostChain([{ builtin: 'bloom' }, { overlay: true, builtin: 'crt' }, { builtin: 'crt' }, { overlay: true }]))
                .toEqual([{ effect: '', builtin: 'bloom' }, { overlay: true }, { effect: '', builtin: 'crt' }]);
            expect(warn.mock.calls.some(([message]) => String(message).includes('two { overlay: true } entries'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
        const { store } = createTestGame();
        const place = effectFromEntry(store, { overlay: true }, 'project')!.effect;
        expect(isOverlayPlace(place)).toBe(true);
        expect(place.fragment).toBeNull();
        // Switched off, kept and not used: the overlay goes after every effect.
        expect(normalizePostChain([{ overlay: true, enabled: false }])).toEqual([{ overlay: true, enabled: false }]);
        expect(effectFromEntry(store, { overlay: true, enabled: false }, 'project')!.effect.enabled).toBe(false);
        // A filter has no place for it.
        const said = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(effectFromEntry(store, { overlay: true }, 'filter')).toBeNull();
            expect(said.mock.calls.some(([message]) => String(message).includes("a filter's effects have none"))).toBe(true);
        } finally {
            said.mockRestore();
        }
        // In the game's list, keeping the places of the entries after it.
        installPostChain(store, [{ builtin: 'bloom' }, { overlay: true }, { builtin: 'crt' }]);
        expect(store.get('post').effects.map((effect) => effect.name)).toEqual(['bloom', 'overlay', 'crt']);
    });

    it('is written in a scene document and read back', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Hud() {
                useOverlay();
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.root.children[0]).toMatchObject({ name: 'Hud', overlay: true });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        const again = startTestScene(createTestGame().store, 'Level', sceneFromDoc(doc));
        expect(again.children[0]!.overlay).toBe(true);
    });
});

describe('where a pass stops for its effects', () => {
    const effect = (name: string) => newPostEffect({ name, fragment: 'x' }, null, 'project');

    it('costs nothing, and moves nothing, with no overlay, even with a place in the chain', () => {
        const { store } = createTestGame();
        installPostChain(store, [DARKEN, { overlay: true }, GREY]);
        startTestScene(store, 'Level', () => {
            world();
            hud(false);
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        expect(ctx.passes[0]!.postCuts).toBeUndefined();
        expect(ctx.post).toHaveLength(2);
    });

    it('leaves a scene change\'s cover first, and draws an overlay with everything else while it runs', () => {
        const { store } = createTestGame({}, createFakeCanvas(32, 16));
        installPostChain(store, [DARKEN, { overlay: true }, GREY]);
        registerScene(store, 'Title', () => {
            useSpawn(function Hud() {
                useScreenSpace();
                useOverlay();
                block(4, 4, '#ff0000', { x: 0, y: 0 });
            })();
            return createScene();
        });
        let scenes!: ReturnType<typeof useScene>;
        startTestScene(store, 'Level', () => {
            scenes = useScene();
            world();
            hud();
            return createScene();
        });
        const ctx = createFrameContext();
        let now = 0;
        const frame = () => {
            const before = now;
            now += 1000 / 60;
            tick(store, ctx, now, before);
            const screen = ctx.passes[ctx.passes.length - 1]!;
            return { chain: (ctx.post ?? []).map((one) => one.source), cuts: screen.postCuts };
        };
        expect(frame()).toEqual({ chain: ['project', 'project'], cuts: [{ at: 1, through: 0 }] });
        scenes.change('Title', { transition: crossfade(0.2) });
        // The whole crossing, out and in: the cover first, where it always was, and nothing over it.
        const during: Array<ReturnType<typeof frame>> = [];
        while (store.get('transition').active !== null && during.length < 60) {
            during.push(frame());
        }
        const changing = during.filter((one) => one.chain.includes('transition'));
        expect(changing.length).toBeGreaterThan(5);
        for (const one of changing) {
            expect(one.chain).toEqual(['transition', 'project', 'project']);
            expect(one.cuts).toBeUndefined();
        }
        // Over, the overlay is over the effects again.
        expect(frame()).toEqual({ chain: ['project', 'project'], cuts: [{ at: 0, through: 0 }] });
    });

    it('never runs an effect twice over a crossing\'s picture when the styles put the place apart', () => {
        // The scene going out: an effect, then the place. The one coming in: the place, then the effect.
        const { store } = createTestGame({}, createFakeCanvas(32, 16));
        const half = { builtin: 'colorAdjust', uniforms: { brightness: 0.5 } };
        registerScene(store, 'Next', () => {
            useRenderStyle({ post: [{ overlay: true }, half] });
            world();
            return createScene();
        });
        let scenes!: ReturnType<typeof useScene>;
        startTestScene(store, 'Level', () => {
            useRenderStyle({ post: [half, { overlay: true }] });
            scenes = useScene();
            world();
            hud();
            return createScene();
        });
        const ctx = createFrameContext();
        let now = 0;
        const frame = () => {
            const before = now;
            now += 1000 / 60;
            tick(store, ctx, now, before);
            return { chain: (ctx.post ?? []).map((one) => one.source), cuts: ctx.passes[ctx.passes.length - 1]!.postCuts };
        };
        expect(frame()).toEqual({ chain: ['scene'], cuts: [{ at: 1, through: 0 }] });
        scenes.change('Next', { transition: crossfade(0.3) });
        // Every frame of the crossing, out and in, through the change of style: the cover first, where it
        // takes its picture of the scene going out from nothing, and the effect once, after it.
        const changing: Array<ReturnType<typeof frame>> = [];
        for (let i = 0; i < 60 && store.get('transition').active !== null; i++) {
            const one = frame();
            if (one.chain.includes('transition')) {
                changing.push(one);
            }
        }
        expect(changing.length).toBeGreaterThan(5);
        for (const one of changing) {
            expect(one.chain).toEqual(['transition', 'scene']);
            expect(one.cuts).toBeUndefined();
        }
    });

    it('draws an overlay with everything else while the splash is on, and says nothing of it', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({ width: 480, height: 320 }, canvas);
        try {
            installPostChain(store, [DARKEN]);
            registerScene(store, 'Level', () => {
                world();
                hud();
                return createScene();
            });
            startGameSystems(store);
            startWithSplash(store, 'Level', canvas);
            const ctx = createFrameContext();
            let now = 0;
            let withSplash = 0;
            let after: TFrameContext['passes'][number]['postCuts'];
            for (let i = 0; i < 400 && after === undefined; i++) {
                const before = now;
                now += 1000 / 60;
                tick(store, ctx, now, before);
                const cuts = ctx.passes[ctx.passes.length - 1]!.postCuts;
                if (splashOf(store) !== null) {
                    withSplash++;
                    expect(cuts).toBeUndefined();
                } else {
                    after = cuts;
                }
            }
            expect(withSplash).toBeGreaterThan(0);
            // Once it is gone, over the effects.
            expect(after).toEqual([{ at: 1, through: 0 }]);
            expect(warn.mock.calls.some(([message]) => String(message).includes('useOverlay'))).toBe(false);
        } finally {
            stopGameSystems(store);
            warn.mockRestore();
        }
    });

    it('leaves the HUD over the effects with debug drawing on, which goes where it falls and says nothing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const cutsWith = (debug: boolean) => {
                const { store } = createTestGame({ width: 32, height: 16 }, createFakeCanvas(32, 16));
                store.setState('config', { debug });
                installPostChain(store, [DARKEN]);
                startTestScene(store, 'Level', () => {
                    world();
                    hud();
                    return createScene();
                });
                const ctx = createFrameContext();
                let now = 0;
                for (let i = 0; i < 3; i++) {
                    const before = now;
                    now += 16;
                    tick(store, ctx, now, before);
                }
                const screen = ctx.passes[ctx.passes.length - 1]!;
                return { cuts: screen.postCuts, drawn: screen.drawables!.length };
            };
            const off = cutsWith(false);
            const on = cutsWith(true);
            expect(off.cuts).toEqual([{ at: 1, through: 0 }]);
            // The debug drawing on top of the scene, after the HUD, over the effects with it.
            expect(on.drawn).toBeGreaterThan(off.drawn);
            expect(on.cuts).toEqual([{ at: 1, through: 0 }]);
            expect(warn.mock.calls.some(([message]) => String(message).includes('useOverlay'))).toBe(false);
        } finally {
            warn.mockRestore();
        }
    });

    it('makes no stop at the place, with no place at the start, nothing switched on, or effects off', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            hud();
            return createScene();
        });
        const [bloom, crt] = [effect('bloom'), effect('crt')];
        const place = effectFromEntry(store, { overlay: true }, 'project')!.effect;
        store.get('post').effects.push(bloom, place, crt);
        expect(overlayFrameOf(store, [bloom, crt]).frame!.through).toBe(0);
        // With no place, after every effect.
        store.get('post').effects.splice(1, 1);
        expect(overlayFrameOf(store, [bloom, crt]).frame!.through).toBe(1);
        // A place at the start has nothing under it.
        store.get('post').effects.unshift(place);
        expect(overlayFrameOf(store, [bloom, crt]).frame).toBeNull();
        // Effects switched off: nothing.
        store.get('post').effects.shift();
        store.setState('post', { enabled: false });
        expect(overlayFrameOf(store, [bloom, crt]).frame).toBeNull();
    });

    it('counts an overlay switched off as none', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            world();
            useSpawn(function Hud() {
                useOverlay();
                useOverlay(false);
                block(4, 4, '#ff0000', { x: 0, y: 0 });
            })();
            usePostProcess(darken());
            return createScene();
        });
        expect(overlayFrameOf(store, [effect('bloom')]).frame).toBeNull();
    });

    it('stops once, and settles what would change the order', () => {
        expect(cutsOf([-1, -1, 0, 0])).toEqual([{ at: 2, through: 0 }]);
        expect(cutsOf([-1, -1])).toBeUndefined();
        expect(cutsOf([1, 1])).toEqual([{ at: 0, through: 1 }]);

        const walk = { at: [-1, 1, -1, 1, 1], box: [null, null, null, null, null] };
        settleOver(walk);
        // What has something under the effects after it comes back under; the rest keep theirs.
        expect(walk.at).toEqual([-1, -1, -1, 1, 1]);
    });

    it('stops the screen\'s pass and a capture of it alike, and a picture the game draws not at all', () => {
        const { store, renderer } = createTestGame({}, createFakeCanvas(32, 16));
        renderer.createRenderTexture = () => ({ resourceType: 'texture' });
        startTestScene(store, 'Level', () => {
            world();
            hud();
            usePostProcess(darken());
            return createScene();
        });
        void captureScreen(store).catch(() => undefined);
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const screen = ctx.passes[ctx.passes.length - 1]!;
        expect(screen.postCuts).toEqual([{ at: 1, through: 0 }]);
        const capture = ctx.passes.find((pass) => pass !== screen && pass.postProcess === true)!;
        expect(capture.postCuts).toEqual([{ at: 1, through: 0 }]);
        expect(ctx.passes.filter((pass) => pass.postProcess !== true).every((pass) => pass.postCuts === undefined)).toBe(true);
    });

    it('finds every kind of drawing in an overlay by its object, after what stands in for it is made', () => {
        const { store } = createTestGame({}, createFakeCanvas(32, 16));
        const file = newParticlesFile('flat', 'flat');
        file.doc = effectDoc({ spread: 0, speed: 0, life: 9, max: 4 });
        file.status = 'ready';
        store.get('assets').particles.set('flat', file);
        startTestScene(store, 'Level', () => {
            // Behind, so it is drawn first: at the same number a model is drawn before the 2D, and the
            // HUD's model and lines would be under the world, and stay under the effects.
            world().zIndex = -1;
            useSpawn(function Hud() {
                useScreenSpace();
                useOverlay();
                block(2, 2, '#ff0000', { x: 0, y: 0 });
                createNineSlice({ texture: createPixelTexture(createPixels(6, 6)), slice: 2, width: 8, height: 8 });
                createShapes({ shapes: [{ type: 'rect', x: 0, y: 0, width: 2, height: 2, fill: '#ff0000' }] });
                createPolygon({ points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], tint: '#ff0000' });
                createParticles({ effect: 'flat' });
                createMesh({ geometry: useCubeGeometry() });
                useLines();
            })();
            usePostProcess(darken());
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const screen = ctx.passes[ctx.passes.length - 1]!;
        expect(screen.postCuts).toEqual([{ at: 1, through: 0 }]);
        expect(new Set(screen.drawables!.slice(1).map((item) => item.type))).toEqual(new Set(['sprite', 'tilemap', 'particles', 'mesh', 'lines']));
    });

    it('finds a map from a file by where it is laid, wherever and however often it is laid', async () => {
        const served = serveTilemap();
        try {
            const { store } = createTestGame({}, createFakeCanvas(32, 16));
            // The first scene lays the map in its world; the second, started after, in its overlay.
            let map!: ReturnType<typeof createTilemap>;
            const first = startTestScene(store, 'World', () => {
                map = createTilemap({ src: '/maps/level.tilemap' });
                return createScene();
            });
            const second = startTestScene(store, 'Hud', () => {
                useSpawn(function Frame() {
                    useScreenSpace();
                    useOverlay();
                    createTilemap({ src: '/maps/level.tilemap' });
                })();
                usePostProcess(darken());
                return createScene();
            });
            await whenLoaded(map);
            runHookUpdates(first, 1 / 60);
            runHookUpdates(second, 1 / 60);
            const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, ctx);
            const screen = ctx.passes[ctx.passes.length - 1]!;
            const layers = map.layers.length;
            // The same layers twice: under the effects in the world, over them in the overlay.
            expect(screen.drawables!.map((item) => item.type)).toEqual(Array.from({ length: layers * 2 }, () => 'tilemap'));
            expect(screen.postCuts).toEqual([{ at: layers, through: 0 }]);

            // And a capture leaving out the overlay's frame leaves out its map, and only that one.
            const frame: TBox = second.children[0]!;
            void captureScreen(store, {}, { hide: new Set([frame]) }).catch(() => undefined);
            const again: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, again);
            const capture = again.passes.find((pass) => pass !== again.passes[again.passes.length - 1] && pass.postProcess === true)!;
            expect(capture.drawables!.map((item) => item.type)).toEqual(Array.from({ length: layers }, () => 'tilemap'));
            expect(capture.postCuts).toBeUndefined();
        } finally {
            served.restore();
        }
    });
});

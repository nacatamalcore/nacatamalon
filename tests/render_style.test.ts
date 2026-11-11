import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useRenderStyle } from '../src/hooks/style';
import { useStudio } from '../src/hooks/light';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import type { TTexture } from '../src/loaders';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { collectLighting } from '../src/game/loop/helper/collect_lights';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { cameraSpacesFor, fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { syncStylePost } from '../src/style/sync_style_post';
import { syncStyleScreen } from '../src/style/sync_style_screen';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { createHeadlessGame } from '../src/headless';
import { spyOn } from 'bun:test';
import { builtinKeyOf } from '../src/post/install_post_chain';
import { RENDER } from '../src/CONST';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawMesh } from '../src/render/interface';
import type { TFrameContext } from '../src/render/interface/t_frame_context';
import type { TRenderStyle } from '../src/style';

/**
 * Render styles: a whole game or scene drawn one way (every material at every pixel, swimming
 * pictures, shivering corners) and seen through its effects, with a material that says otherwise
 * keeping what it says. And `useStudio`, the studio's lights in one line.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const at = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

const drawMesh = (material: Partial<{ perPixel: boolean; affine: boolean; vertexSnap: boolean | number }> = {}): TDrawMesh => ({
    type: 'mesh',
    geometry: null,
    transform: at,
    skeleton: null,
    material: {
        id: 'm', name: null,
        fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null,
        uniforms: null, uniformSig: null,
        texture: null,
        tint: { r: 1, g: 1, b: 1, a: 1 },
        emissive: { r: 0, g: 0, b: 0, a: 1 },
        specular: { r: 0, g: 0, b: 0, a: 1 },
        shininess: 32,
        alpha: 1,
        ...material,
    },
});

const filled = (mesh: TDrawMesh, style: TRenderStyle | null): Float32Array => {
    const space = fillCameraSpace(newCameraSpace(), null, 320, 240);
    space.style = style;
    const out = new Float32Array(MESH_UNIFORM_FLOATS);
    fillMeshUniforms(out, 0, mesh, space);
    return out;
};

describe('what a material that does not say takes', () => {
    it('is the style\'s light at every pixel, picture stretched and grid, from the view\'s space', () => {
        expect(filled(drawMesh(), RENDER.STYLES.cgi)[39]).toBe(2);
        const ps1 = filled(drawMesh(), RENDER.STYLES.ps1);
        expect(ps1[47]).toBe(1);
        expect(ps1[59]).toBe(120);
        // No style, nothing.
        const plain = filled(drawMesh(), null);
        expect([plain[39], plain[47], plain[59]]).toEqual([0, 0, 0]);
    });

    it('is never what the material says itself, a no included', () => {
        expect(filled(drawMesh({ perPixel: false }), RENDER.STYLES.cgi)[39]).toBe(0);
        const ps1 = filled(drawMesh({ affine: false, vertexSnap: false }), RENDER.STYLES.ps1);
        expect([ps1[47], ps1[59]]).toEqual([0, 0]);
        expect(filled(drawMesh({ perPixel: true }), null)[39]).toBe(2);
    });

    it('reaches each view\'s space with its camera', () => {
        const spaces = cameraSpacesFor([{ camera: null, style: RENDER.STYLES.ps1 }, { camera: null }], 320, 240);
        expect(spaces[0]!.style).toBe(RENDER.STYLES.ps1);
        expect(spaces[1]!.style).toBeNull();
    });
});

describe('the style of a view', () => {
    const frame = (store: Parameters<typeof fillFrameContext>[0]): TFrameContext => {
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        return ctx;
    };
    const styleOf = (ctx: TFrameContext) => ctx.passes[ctx.passes.length - 1]!.views3d?.[0]?.style ?? null;

    it('is the game\'s, unless the scene has its own, which it can change while it runs', () => {
        const { store } = createTestGame({ style: RENDER.STYLES.ps1 });
        let handle!: ReturnType<typeof useRenderStyle>;
        startTestScene(store, 'Level', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        expect(styleOf(frame(store))).toBe(RENDER.STYLES.ps1);

        const other = createTestGame({ style: RENDER.STYLES.ps1 }).store;
        startTestScene(other, 'Museum', () => {
            handle = useRenderStyle(RENDER.STYLES.cgi);
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        expect(styleOf(frame(other))).toBe(RENDER.STYLES.cgi);
        handle.set(null);
        expect(handle.style).toBeNull();
        expect(styleOf(frame(other))).toBe(RENDER.STYLES.ps1);
    });

    it('in a picture of a world of its own, is the picture\'s, its scene\'s or the game\'s, and a monitor in it sees that world in it', () => {
        const { store } = createTestGame({ style: RENDER.STYLES.ps1 });
        let room!: TTexture;
        let plain!: TTexture;
        let monitor!: TTexture;
        const Feed = () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
        };
        const Room = () => {
            useRenderStyle(RENDER.STYLES.cgi);
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            createMesh({ geometry: useCubeGeometry() });
            monitor = createSpriteTexture({ width: 16, height: 16, sees: '3d' }, Feed);
        };
        const Plain = () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            createMesh({ geometry: useCubeGeometry() });
        };
        startTestScene(store, 'Museum', () => {
            room = createSpriteTexture({ width: 32, height: 32 }, Room);
            plain = createSpriteTexture({ width: 32, height: 32 }, Plain);
            return createScene();
        });
        const ctx = frame(store);
        const passFor = (texture: TTexture) => ctx.passes.find((pass) => pass.renderTarget === texture.gpu)!;

        expect(passFor(room).views3d![0]!.style).toBe(RENDER.STYLES.cgi);
        expect(passFor(monitor).views3d![0]!.style).toBe(RENDER.STYLES.cgi);
        expect(passFor(plain).views3d![0]!.style).toBe(RENDER.STYLES.ps1);
    });

    it('is taken from the game\'s options as given', () => {
        expect(cleanGameOptions({ width: 320, height: 240, style: RENDER.STYLES.cgi }).style).toBe(RENDER.STYLES.cgi);
        expect(cleanGameOptions({ width: 320, height: 240 }).style).toBeUndefined();
    });
});

describe('the screen of a style', () => {
    const screen = (store: ReturnType<typeof createTestGame>['store']) => {
        const { width, height, smooth } = store.get('config');
        return { width, height, smooth };
    };

    it('is the game\'s when it says nothing of its own, and what the game says wins over it', () => {
        const fromStyle = cleanGameOptions({ style: RENDER.STYLES.n64 });
        expect([fromStyle.width, fromStyle.height, fromStyle.smooth]).toEqual([320, 240, true]);
        const rewritten = cleanGameOptions({ style: RENDER.STYLES.n64, width: 640, height: 480, smooth: false });
        expect([rewritten.width, rewritten.height, rewritten.smooth]).toEqual([640, 480, false]);
        // No style and nothing said: the default, as before.
        const plain = cleanGameOptions({});
        expect([plain.width, plain.height, plain.smooth]).toEqual([800, 600, false]);
    });

    it('comes in with a scene\'s style and goes with it, the game\'s put back', () => {
        const { store } = createTestGame({ width: 640, height: 480, smooth: true });
        syncStyleScreen(store, RENDER.STYLES.ps1);
        expect(screen(store)).toEqual({ width: 320, height: 240, smooth: false });
        // Another style after it: the game's are still what comes back.
        syncStyleScreen(store, { ...RENDER.STYLES.n64, width: 400 });
        expect(screen(store)).toEqual({ width: 400, height: 240, smooth: true });
        syncStyleScreen(store, null);
        expect(screen(store)).toEqual({ width: 640, height: 480, smooth: true });
    });

    it('changes only what the style says', () => {
        const { store } = createTestGame({ width: 640, height: 480 });
        syncStyleScreen(store, { perPixel: true, smooth: true });
        expect(screen(store)).toEqual({ width: 640, height: 480, smooth: true });
        syncStyleScreen(store, null);
        expect(screen(store)).toEqual({ width: 640, height: 480, smooth: false });
    });

    it('leaves what the game changed while it was on: that is the game\'s word', () => {
        const { store } = createTestGame({ width: 640, height: 480 });
        const game = createGameHandle(store);
        syncStyleScreen(store, RENDER.STYLES.ps1);
        game.setResolution(800, 600);
        syncStyleScreen(store, null);
        expect(screen(store)).toEqual({ width: 800, height: 600, smooth: false });
    });

    it('reaches the game a frame after a scene asks for it, before the frame measures the screen', () => {
        const { store } = createTestGame({ width: 640, height: 480 });
        let handle!: ReturnType<typeof useRenderStyle>;
        startTestScene(store, 'Level', () => {
            handle = useRenderStyle(RENDER.STYLES.ps1);
            return createScene();
        });
        fillFrameContext(store, { passes: [{}], time: 0, progress: 0, phase: 0 });
        expect(screen(store)).toEqual({ width: 320, height: 240, smooth: false });
        handle.set(null);
        fillFrameContext(store, { passes: [{}], time: 0, progress: 0, phase: 0 });
        expect(screen(store)).toEqual({ width: 640, height: 480, smooth: false });
    });
});

describe('the screen of a scene\'s style, at once', () => {
    it('is the game\'s while the scene is still being built, so what it places by the screen fits', () => {
        const { store } = createTestGame({ width: 800, height: 600 });
        let seen = 0;
        startTestScene(store, 'Level', () => {
            useRenderStyle(RENDER.STYLES.ps1);
            seen = store.get('config').width;
            return createScene();
        });
        expect(seen).toBe(320);
    });

    it('comes with set too, before any frame', () => {
        const { store } = createTestGame({ width: 800, height: 600 });
        let handle!: ReturnType<typeof useRenderStyle>;
        startTestScene(store, 'Level', () => {
            handle = useRenderStyle(null);
            return createScene();
        });
        handle.set(RENDER.STYLES.cgi);
        expect([store.get('config').width, store.get('config').height]).toEqual([640, 480]);
        handle.set(null);
        expect([store.get('config').width, store.get('config').height]).toEqual([800, 600]);
    });

    it('waits for the swap while the scene is built behind a transition\'s cover', () => {
        const { store } = createTestGame({ width: 800, height: 600 });
        store.setState('transition', { active: { incoming: null } as never });
        startTestScene(store, 'Level', () => {
            useRenderStyle(RENDER.STYLES.ps1);
            return createScene();
        });
        expect(store.get('config').width).toBe(800);
    });
});

describe('a style\'s resolution', () => {
    it('is both sides or none: one alone keeps the game\'s, and says so once', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame({ width: 800, height: 600 });
        const half = { ...RENDER.STYLES.ps1, height: undefined };
        syncStyleScreen(store, half);
        expect([store.get('config').width, store.get('config').height]).toEqual([800, 600]);
        syncStyleScreen(store, null);
        syncStyleScreen(store, half);
        expect(warn.mock.calls.filter(([said]) => String(said).includes('with no height'))).toHaveLength(1);
        warn.mockRestore();
        // In the game's options as well: the game's one side is the game's resolution.
        const said = cleanGameOptions({ style: RENDER.STYLES.n64, width: 640 });
        expect([said.width, said.height]).toEqual([640, 600]);
    });

    it('brings the pixel snap with its smoothing, while the game leaves the snap to it', () => {
        const { store } = createTestGame({ width: 640, height: 480, smooth: true });
        expect(store.get('config').pixelSnap).toBe('off');
        syncStyleScreen(store, RENDER.STYLES.ps1);
        expect(store.get('config').pixelSnap).toBe('screen');
        syncStyleScreen(store, null);
        expect(store.get('config').pixelSnap).toBe('off');
        // A game that chose its snap keeps it.
        const chose = createTestGame({ width: 640, height: 480, smooth: true, pixelSnap: 'game' }).store;
        syncStyleScreen(chose, RENDER.STYLES.ps1);
        expect(chose.get('config').pixelSnap).toBe('game');
    });
});

describe('a headless game', () => {
    it('follows its resolution as a page does, and takes its pictures at it', () => {
        const game = createHeadlessGame({
            width: 800,
            height: 600,
            scenes: {
                Level: () => {
                    useRenderStyle(RENDER.STYLES.ps1);
                    return createScene();
                },
            },
        });
        const picture = game.capture();
        expect([picture.width, picture.height]).toEqual([320, 240]);
        game.destroy();
    });
});

describe('a style\'s pixels', () => {
    it('are scaled up as the pictures are read, unless the style or the game says otherwise', () => {
        // Nobody said: it follows `smooth`.
        expect(cleanGameOptions({ smooth: true }).smoothScaling).toBeNull();
        const n64 = cleanGameOptions({ style: RENDER.STYLES.n64 });
        expect([n64.smooth, n64.smoothScaling]).toEqual([true, false]);
        expect(cleanGameOptions({ style: RENDER.STYLES.n64, smoothScaling: true }).smoothScaling).toBe(true);
    });

    it('bring their shape and their scaling with a scene\'s style, and the game\'s come back', () => {
        const { store } = createTestGame({ width: 640, height: 480, smooth: true, pixelAspect: 1 });
        syncStyleScreen(store, RENDER.STYLES.snes);
        expect(store.get('config').pixelAspect).toBeCloseTo(8 / 7);
        // Scaled as its pictures are read: nobody said otherwise.
        expect([store.get('config').smooth, store.get('config').smoothScaling]).toEqual([false, null]);
        syncStyleScreen(store, RENDER.STYLES.n64);
        expect(store.get('config').pixelAspect).toBe(1);
        expect([store.get('config').smooth, store.get('config').smoothScaling]).toEqual([true, false]);
        syncStyleScreen(store, null);
        expect([store.get('config').pixelAspect, store.get('config').smooth, store.get('config').smoothScaling]).toEqual([1, true, null]);
    });

    it('scale with setSmooth while nobody said how they scale', () => {
        const { store } = createTestGame({ smooth: false });
        expect(store.get('config').smoothScaling).toBeNull();
        createGameHandle(store).setSmooth(true);
        expect(store.get('config').smoothScaling ?? store.get('config').smooth).toBe(true);
        const apart = createTestGame({ smooth: true, smoothScaling: false }).store;
        createGameHandle(apart).setSmooth(false);
        createGameHandle(apart).setSmooth(true);
        expect(apart.get('config').smoothScaling).toBe(false);
    });
});

describe('the engine\'s styles', () => {
    it('each put their effects in the chain, a console\'s palette included', () => {
        const names = ['nes', 'snes', 'genesis', 'gameBoy', 'gba', 'ps1', 'saturn', 'n64', 'dreamcast', 'cgi'] as const;
        expect(Object.keys(RENDER.STYLES).sort()).toEqual([...names].sort());
        for (const name of names) {
            const { store } = createTestGame();
            syncStylePost(store, RENDER.STYLES[name]);
            expect(store.get('post').effects.length).toBe(RENDER.STYLES[name].post!.length);
        }
        const { store } = createTestGame();
        syncStylePost(store, RENDER.STYLES.nes);
        expect(store.get('post').effects[0]!.palette?.src).toBe('nacatamalon:nes');
    });

    it('each have a whole screen: both sides, a pixel shape and its smoothing', () => {
        for (const style of Object.values(RENDER.STYLES)) {
            expect(style.width! > 0 && style.height! > 0).toBe(true);
            expect(typeof style.smooth).toBe('boolean');
        }
        expect(RENDER.STYLES.nes.pixelAspect).toBeCloseTo(8 / 7);
        expect(RENDER.STYLES.genesis.pixelAspect).toBeCloseTo(32 / 35);
    });
});

describe('setResolution', () => {
    it('writes the game\'s resolution, and refuses what is no whole number of pixels', () => {
        const { store } = createTestGame({ width: 320, height: 240 });
        const game = createGameHandle(store);
        game.setResolution(640, 480);
        expect([store.get('config').width, store.get('config').height]).toEqual([640, 480]);
        expect(() => game.setResolution(0, 240)).toThrow('width');
        expect(() => game.setResolution(320, 240.5)).toThrow('height');
    });
});

describe('the effects of a style', () => {
    const keys = (store: Parameters<typeof syncStylePost>[0]) => store.get('post').effects.map((effect) => builtinKeyOf(effect));

    it('go into the chain when it comes in and leave when another does, the others untouched', () => {
        const { store } = createTestGame();
        syncStylePost(store, RENDER.STYLES.cgi);
        expect(keys(store)).toEqual(['bloom']);
        // The same again changes nothing.
        const first = store.get('post').effects[0];
        syncStylePost(store, RENDER.STYLES.cgi);
        expect(store.get('post').effects[0]).toBe(first);

        syncStylePost(store, RENDER.STYLES.ps1);
        expect(keys(store)).toEqual(['dither']);
        syncStylePost(store, null);
        expect(keys(store)).toEqual([]);
    });

    it('stay the last of the chain when a scene adds one of its own later', () => {
        const { store } = createTestGame();
        syncStylePost(store, RENDER.STYLES.ps1);
        const dither = store.get('post').effects[0]!;
        const grade = { ...dither, source: 'scene' } as typeof dither;
        store.get('post').effects.push(grade);
        syncStylePost(store, RENDER.STYLES.ps1);
        expect(store.get('post').effects).toEqual([grade, dither]);
        expect(store.get('post').effects[1]).toBe(dither);
    });

    it('tell what holds an effect by name that the chain is another, only when it is', () => {
        const { store } = createTestGame();
        const chain = () => store.get('post').chain;
        const before = chain();
        syncStylePost(store, RENDER.STYLES.cgi);
        expect(chain()).toBe(before + 1);
        syncStylePost(store, RENDER.STYLES.cgi);
        expect(chain()).toBe(before + 1);
        syncStylePost(store, null);
        expect(chain()).toBe(before + 2);
        // A style with no effects after none changes nothing in the chain.
        syncStylePost(store, { perPixel: true });
        expect(chain()).toBe(before + 2);
    });

    it('read their entries as the game\'s own chain does, leaving out what cannot run', () => {
        const { store } = createTestGame();
        syncStylePost(store, { post: [{ builtin: 'bloom' }, { nothing: true } as never] });
        expect(keys(store)).toEqual(['bloom']);
    });

    it('work on a copy of the style\'s numbers, so turning them leaves the style as it was', () => {
        const { store } = createTestGame();
        syncStylePost(store, RENDER.STYLES.cgi);
        const effect = store.get('post').effects[0]!;
        (effect.uniforms as Record<string, unknown>).threshold = 0.2;
        expect(RENDER.STYLES.cgi.post?.[0]?.uniforms?.threshold).toBe(0.8);
    });
});

describe('useStudio', () => {
    it('lights the scene with a key that casts, a fill, a back light and two-coloured ambient, and paints its picture', () => {
        const { store } = createTestGame();
        let studio!: ReturnType<typeof useStudio>;
        const scene = startTestScene(store, 'Showroom', () => {
            studio = useStudio({ ground: '#3a2a22' });
            return createScene();
        });
        const lighting = collectLighting(scene);
        expect(lighting.lights).toHaveLength(3);
        expect(lighting.lights).toContain(studio.key);
        expect(studio.key.castShadow).toBe(true);
        expect(studio.fill.type).toBe('rect');
        expect(studio.back.type).toBe('rect');
        expect(lighting.ground).not.toBeNull();
        expect(studio.environment.type).toBe('texture');
        expect(studio.environment.width).toBe(64);
    });

    it('points each panel at the middle of the scene', () => {
        const { store } = createTestGame();
        let studio!: ReturnType<typeof useStudio>;
        startTestScene(store, 'Showroom', () => {
            studio = useStudio();
            return createScene();
        });
        for (const panel of [studio.fill, studio.back]) {
            const { x, y, z, rotationX, rotationY } = panel.transform;
            // Its own -Z, turned, is the way it shines: towards the middle, from where it stands.
            const forward = { x: -Math.sin(rotationY) * Math.cos(rotationX), y: Math.sin(rotationX), z: -Math.cos(rotationY) * Math.cos(rotationX) };
            const toMiddle = { x: -x, y: -y, z: -z };
            const length = Math.hypot(toMiddle.x, toMiddle.y, toMiddle.z);
            const dot = (forward.x * toMiddle.x + forward.y * toMiddle.y + forward.z * toMiddle.z) / length;
            expect(dot).toBeGreaterThan(0.99);
        }
    });
});

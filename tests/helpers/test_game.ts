import { createRuntimeStore } from '../../src/store/runtime_store';
import { registerScene } from '../../src/scene/register_scene';
import { startScene } from '../../src/scene/start_scene';
import type { TBox } from '../../src/box';
import type { IRenderer, TFrameContext } from '../../src/render';
// `ITexture` is not on the render barrel, only on the interface folder.
import type { IBuffer, ITexture } from '../../src/render/interface';
import type { TGameConfig } from '../../src/game/types/t_game_config';
import type { TRuntimeStore } from '../../src/store';
import type { TSceneFn } from '../../src/scene';

/**
 * A renderer that draws nowhere and remembers what it was asked to draw.
 *
 * Everything below the store can be exercised without a GPU, and that is the whole point of
 * having it: these tests run in a terminal, in milliseconds, on every change. What only a real
 * device can answer (does it end up on screen, in which order, at what cost) belongs to the
 * browser checks instead.
 */
export type TFakeRenderer = IRenderer & {
    /**
     * Every frame it was handed, oldest first.
     */
    frames: TFrameContext[];
    /**
     * Every `setSmooth` it was told about, oldest first.
     */
    smoothCalls: boolean[];
    /**
     * Every buffer it was asked for, with what was written into it and whether it is still alive.
     */
    buffers: Array<{ handle: IBuffer; data: Float32Array | Uint16Array | Uint32Array; usage: string; writes: number; alive: boolean }>;
    /**
     * Every texture it was told to let go, oldest first.
     */
    destroyedTextures: ITexture[];
};

export const createFakeRenderer = (): TFakeRenderer => {
    const frames: TFrameContext[] = [];
    const smoothCalls: boolean[] = [];
    const buffers: TFakeRenderer['buffers'] = [];
    const destroyedTextures: ITexture[] = [];

    /**
     * The bookkeeping of one buffer, found by the handle the game holds.
     */
    const entryOf = (handle: IBuffer) => buffers.find((buffer) => buffer.handle === handle);

    return {
        frames,
        smoothCalls,
        buffers,
        destroyedTextures,
        capabilities: { backend: 'WEBGPU', msaa: 1 },
        frame: (ctx) => { frames.push(ctx); },
        createTexture: (): ITexture => ({ resourceType: 'texture' }),
        createBuffer: (data, usage) => {
            const handle: IBuffer = { resourceType: 'buffer' };
            buffers.push({ handle, data: data.slice(), usage, writes: 0, alive: true });
            return handle;
        },
        updateBuffer: (handle, data) => {
            const entry = entryOf(handle);
            if (entry === undefined) {
                throw new Error('updateBuffer: that buffer was never made here.');
            }
            if (data.byteLength > entry.data.byteLength) {
                throw new Error('updateBuffer: what was written does not fit.');
            }
            entry.data = data.slice();
            entry.writes += 1;
        },
        destroyBuffer: (handle) => {
            const entry = entryOf(handle);
            if (entry !== undefined) {
                entry.alive = false;
            }
        },
        createDataTexture: (data, width, height): ITexture => {
            if (data.length !== width * height * 4) {
                throw new Error('createDataTexture: the bytes do not match the size.');
            }
            return { resourceType: 'texture' };
        },
        createRenderTexture: (): ITexture => ({ resourceType: 'texture' }),
        readTexture: async () => ({ width: 0, height: 0, data: new Uint8Array(0) }),
        destroyTexture: (texture) => { destroyedTextures.push(texture); },
        setSmooth: (smooth) => { smoothCalls.push(smooth); },
        destroy: () => {},
    };
};

/**
 * The boot configuration these tests run with: the game's own defaults would do, but a fixed size
 * and a black background keep every check reading the same numbers.
 */
const TEST_CONFIG: TGameConfig = {
    width: 320,
    height: 224,
    background: { r: 0, g: 0, b: 0, a: 1 },
    renderer: 'WEBGPU',
    smooth: false,
    msaa: 1,
    scaling: 'contain',
    keep: 'none',
    pauseOnBlur: false,
    pixelRatio: 1,
    fullscreenScaling: 'integer',
    actions: [],
    banner: false,
};

/**
 * A running game with no page and no device behind it: the store the engine reads, wired to the
 * fake renderer. `document` is never touched, so nothing here needs a browser.
 */
/**
 * A canvas with no page: a real `EventTarget`, so pointer events can be dispatched at it, sized
 * like the game's buffer and shown at `scale` times that size, starting at `left`, `top` on the page.
 */
export const createFakeCanvas = (width = 320, height = 224, scale = 1, left = 0, top = 0): HTMLCanvasElement =>
    Object.assign(new EventTarget(), {
        width,
        height,
        // Where the engine writes the cursor and the touch behaviour, read back by the tests.
        style: {} as CSSStyleDeclaration,
        getBoundingClientRect: () => ({ left, top, width: width * scale, height: height * scale }),
    }) as unknown as HTMLCanvasElement;

export const createTestGame = (
    overrides: Partial<TGameConfig> = {},
    canvas: HTMLCanvasElement = createFakeCanvas(),
): { store: TRuntimeStore; renderer: TFakeRenderer } => {
    const renderer = createFakeRenderer();
    const store = createRuntimeStore({
        canvas,
        renderer,
        config: { ...TEST_CONFIG, ...overrides },
    });
    return { store, renderer };
};

/**
 * Registers a scene and starts it, which is what puts a body's hooks and game objects where the
 * engine expects them. Returns its root, the box every check looks at.
 */
export const startTestScene = (store: TRuntimeStore, name: string, body: TSceneFn): TBox => {
    registerScene(store, name, body);
    return startScene(store, name);
};

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { buildPostChain } from '../src/post/build_post_chain';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { stopScene } from '../src/scene/stop_scene';
import { dither, paletteMatch } from '../src/post';
import { loadShader } from '../src/loaders/shader/load_shader';
import { newShader } from '../src/loaders/shader/new_shader';
import { usePostProcess } from '../src/hooks/post/use_post_process';

/**
 * What installing an effect does, and who owns the result.
 *
 * The chain belongs to the game and the entry belongs to the scene, which is the split that lets a
 * pause menu open over a level without changing how the screen looks.
 */

const inScene = <T>(store: Parameters<typeof startTestScene>[0], name: string, body: () => T): T => {
    let made!: T;
    startTestScene(store, name, () => {
        made = body();
        return createScene();
    });
    return made;
};

const serve = (files: Record<string, string>) =>
    spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const body = files[input];
        return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
    }) as unknown as typeof fetch);

const POST_FILE = `// @shader post
// @uniform amount: f32 = 0.5
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color * mu.amount; }
`;

const MESH_FILE = `// @shader mesh3d
fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }
`;

describe('installing an effect', () => {
    afterEach(() => {
        mock.restore();
    });

    it('takes a hook written right there', () => {
        const { store } = createTestGame();
        const effect = inScene(store, 'Level', () => usePostProcess({
            name: 'crt',
            fragment: 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }',
        }));

        expect(effect.type).toBe('post');
        expect(effect.fragment).toContain('fn effect');
        expect(store.get('post').effects).toEqual([effect]);
    });

    it('takes one of the engine\'s own, spread in whole', () => {
        const { store } = createTestGame();
        const effect = inScene(store, 'Level', () => usePostProcess({ ...dither({ levels: 4 }) }));

        expect(effect.uniforms).toEqual({ levels: 4, strength: 1 });
        // Given and not guessed back off the values: it was written with its kinds.
        expect(effect.uniformSig).toEqual({ levels: 'f32', strength: 'f32' });
        expect(effect.fragmentGlsl).toContain('vec4 effect');
    });

    it('refuses an effect with nothing to run', () => {
        const { store } = createTestGame();

        expect(() => inScene(store, 'Level', () => usePostProcess({ name: 'empty' }))).toThrow(/needs something to run/);
    });

    it('refuses a palette and a table at once, because it reads one data texture', () => {
        const { store } = createTestGame();

        expect(() => inScene(store, 'Level', () => usePostProcess({
            ...paletteMatch(),
            palette: { type: 'palette' } as never,
            lut: { type: 'lut' } as never,
        }))).toThrow(/palette or a table and not both/);
    });

    it('is loud about a name no shader was loaded under', () => {
        const { store } = createTestGame();

        expect(() => inScene(store, 'Level', () => usePostProcess({ effect: 'crt' })))
            .toThrow(/no shader loaded under key 'crt'/);
    });
});

describe('an effect built on a file', () => {
    afterEach(() => {
        mock.restore();
    });

    it('takes the hook on when the file lands', async () => {
        const { store } = createTestGame();
        serve({ '/crt.wgsl': POST_FILE });

        const shader = newShader('/crt.wgsl', '/crt.wgsl');
        store.get('assets').shaders.set('crt', shader);
        const effect = inScene(store, 'Level', () => usePostProcess({ effect: 'crt' }));

        expect(effect.fragment).toBeNull();
        await loadShader(store, shader);

        expect(effect.fragment).toContain('fn effect');
        expect(effect.uniforms).toEqual({ amount: 0.5 });
    });

    it('lets the scene have the last word over the file, whichever arrives first', async () => {
        const { store } = createTestGame();
        serve({ '/crt.wgsl': POST_FILE });

        const shader = newShader('/crt.wgsl', '/crt.wgsl');
        store.get('assets').shaders.set('crt', shader);
        const effect = inScene(store, 'Level', () => usePostProcess({ effect: 'crt', uniforms: { amount: 0.9 } }));
        await loadShader(store, shader);

        expect(effect.uniforms).toEqual({ amount: 0.9 });
    });

    it('refuses a file written for models, and goes on showing the frame', async () => {
        const { store } = createTestGame();
        serve({ '/lit.wgsl': MESH_FILE });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        const shader = newShader('/lit.wgsl', '/lit.wgsl');
        store.get('assets').shaders.set('lit', shader);
        const effect = inScene(store, 'Level', () => usePostProcess({ effect: 'lit' }));
        await loadShader(store, shader);

        expect(effect.fragment).toBeNull();
        expect(warn.mock.calls.some(([message]) => String(message).includes('for models'))).toBe(true);
        // Nothing to run means nothing runs, and nothing runs means nothing is copied.
        expect(buildPostChain(store)).toBeNull();
    });
});

describe('who owns what', () => {
    it('keeps a switched-off effect where it is, so turning it on does not move it', () => {
        const { store } = createTestGame();
        const { first, middle, last } = inScene(store, 'Level', () => ({
            first: usePostProcess({ ...dither() }),
            middle: usePostProcess({ ...dither(), enabled: false }),
            last: usePostProcess({ ...dither() }),
        }));

        expect(store.get('post').effects).toEqual([first, middle, last]);
        middle.enabled = true;
        expect(buildPostChain(store)).toEqual([first, middle, last]);
    });

    it('takes a scene\'s effect away with the scene, and leaves everyone else\'s', () => {
        const { store } = createTestGame();
        const kept = inScene(store, 'Level', () => usePostProcess({ ...dither() }));
        const going = inScene(store, 'Menu', () => usePostProcess({ ...paletteMatch() }));

        expect(store.get('post').effects).toEqual([kept, going]);
        stopScene(store, 'Menu');

        expect(store.get('post').effects).toEqual([kept]);
    });
});

import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { trackLoad } from '../../loaders';
import { loadShader, newShader } from '../../loaders/shader';
import type { TShader } from '../../loaders/shader';

/**
 * What `useLoadShader` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadShaderOptions = {
    /**
     * Where the shader is. Its WGSL half, which is the one that has to exist.
     */
    src: string;
    /**
     * Where its GLSL half is, when it was written in a second file instead of after a `// @glsl`
     * line in the same one.
     *
     * Two files work, and one is usually better: with two, the header is written twice and the
     * halves are free to drift. The loader reads both and refuses them if they disagree, so the
     * drift is caught, but not writing it twice is simpler than catching it.
     */
    glslSrc?: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a shader written in a file, so an effect can live beside the game instead of inside it.
 *
 * Hand what comes back to `createMaterial({ effect })`. It arrives still loading, and anything built
 * on it draws with the built-in shader until it lands: a scene is never held up waiting for an
 * effect, it simply gets the effect a moment late.
 *
 * The file says which family it is for and what knobs it has, so the scene repeats neither.
 *
 * A file ending in `.shader` is a shader drawn as nodes rather than written, and it is loaded the
 * same way: it brings both languages with it, so it never takes a `glslSrc`.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The shader, filled in when it arrives.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const crt = useLoadShader({ src: '/shaders/crt.wgsl' });
 *     const texture = useLoadTexture({ src: '/assets/hero.png' });
 *
 *     createSprite({ texture, material: createMaterial({ effect: crt, uniforms: { lines: 80 } }) });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadShader = ({ src, glslSrc, key }: TUseLoadShaderOptions): TShader => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadShader: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { shaders } = store.get('assets');

    let shader = shaders.get(cacheKey);
    if (shader === undefined) {
        shader = newShader(src, cacheKey, glslSrc ?? null);
        shaders.set(cacheKey, shader);
        trackLoad(shader, loadShader(store, shader));
    }

    // Listed on the scene even when it came from the cache: `useLoader()` counts everything the
    // scene asked for, and a cached shader counts as already loaded.
    const { loads } = rootOf(box);
    if (!loads.includes(shader)) {
        loads.push(shader);
    }

    return shader;
};

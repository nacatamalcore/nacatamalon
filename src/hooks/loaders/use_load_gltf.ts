import { rootOf } from '../../box';
import { loadGltf, newGltfModel, trackLoad } from '../../loaders';
import { getActiveBox, getActiveGame } from '../../store';
import type { TGltfModel, TShading } from '../../loaders';

/**
 * Where a model comes from, and how to read it.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadGltfOptions = {
    /**
     * The model file: either kind, `.gltf` or `.glb`.
     */
    src: string;
    /**
     * One named piece of the file and whatever hangs beneath it, instead of all of it. For taking
     * one turret out of a file holding a whole fortress.
     */
    node?: string;
    /**
     * How its surfaces are made to face. `'auto'`, the default, keeps what the file says.
     * `'smooth'` works them out afresh so the surface shades evenly across; `'flat'` gives every
     * triangle a hard edge, which is the look of the era and of a model built to have it.
     */
    shading?: TShading;
    /**
     * `false` loads no pictures, leaving each piece in its plain colour. Default `true`.
     */
    textures?: boolean;
    /**
     * What to call it in this game. Default: `src`, or `src` and the piece when one is named.
     */
    key?: string;
};

/**
 * Loads a model made somewhere else: something sculpted in Blender, bought in a pack, exported from
 * anywhere that writes glTF.
 *
 * **Both kinds of the format are read, and you do not have to know which you have.** One is a
 * description in text with its numbers and pictures in files beside it, the other is all of it in a
 * single file, and which you were given is an accident of the button somebody pressed. The file is
 * asked, not its name.
 *
 * You get the model back at once, still loading. Hand it to `createModel` straight away: it appears
 * by itself when the file arrives, and `useLoader` counts it like any other asset.
 *
 * A file is usually several pieces, each with its own colour or picture: a vehicle is a body, glass
 * and tyres. All of them come, and `createModel` draws them as one thing you move with one
 * placement.
 *
 * Asking for the same model twice, in this scene or another, gives back the one already loaded, and
 * its shapes are on the graphics card once however many of it you put in the world.
 *
 * @param options Where the model is, and how to read it.
 * @returns The model.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useCamera3d({ projection: 'perspective', z: 6 });
 *     useLight({ intensity: 1 });
 *
 *     const tower = useLoadGltf({ src: '/models/tower.glb' });
 *     const placed = createModel({ model: tower });
 *
 *     useUpdate((delta) => {
 *         placed.transform.rotationY += delta * 0.5;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadGltf = ({ src, node, shading = 'auto', textures = true, key }: TUseLoadGltfOptions): TGltfModel => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadGltf: call it inside a scene body.');
    }

    // The piece is part of the name: one file asked for whole and asked for a piece at a time are
    // two different models, and sharing a name would hand back whichever was asked for first.
    const cacheKey = key ?? (node !== undefined ? `${src}#${node}` : src);
    const { gltf } = store.get('assets');

    let model = gltf.get(cacheKey);
    if (model === undefined) {
        model = newGltfModel(src, cacheKey);
        gltf.set(cacheKey, model);
        trackLoad(model, loadGltf(store, model, { node, shading, textures }));
    }

    // Listed on the scene even when it came from the cache, so `useLoader()` counts it.
    const { loads } = rootOf(box);
    if (!loads.includes(model)) {
        loads.push(model);
    }

    return model;
};

import { createRecord } from '../create_record';
import { newMaterial } from '../../materials';
import { getColor } from '../../color';
import { nanoId } from '../../utils';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { whenLoaded } from '../../loaders';
import type { TColor } from '../../color';
import type { TBox } from '../../box';
import { copyPose } from '../../animation';
import type { TGltfPart } from '../../loaders';
import type { TSkeleton } from '../../animation';
import type { TMesh } from '../mesh/types/t_mesh';
import type { TMeshMaterial } from '../../materials';
import type { TModel } from './types/t_model';
import type { TModelOptions } from './types/t_model_options';
import type { TRuntimeStore } from '../../store';
import type { TTransform3d } from '../types/t_transform_3d';

/** No tint: what a piece's own colour is multiplied by when nothing was asked for. */
const WHITE: TColor = { r: 1, g: 1, b: 1, a: 1 };

/**
 * Nowhere in particular, which is where a model goes when it is not told.
 */
const NOWHERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * Two colours multiplied: the file's own, shaded by whatever was asked for on top.
 */
const multiply = (a: TColor, b: TColor): TColor => ({ r: a.r * b.r, g: a.g * b.g, b: a.b * b.b, a: a.a * b.a });

/**
 * What is set on a placed model and goes to every piece of it, the ones still on the way included.
 */
type TModelState = {
    visible: boolean;
    tint: TColor;
    alpha: number | undefined;
    zIndex: number | undefined;
    castShadow: boolean | undefined;
    destroyed: boolean;
};

/**
 * Each piece's own colour, as its file has it: what the model's `tint` multiplies, so shading the
 * model again does not shade what was already shaded.
 */
const fileTints = new WeakMap<TMesh, TColor>();

/**
 * Each placed model's state, for `destroy`, which is the one thing that changes it from outside.
 */
const states = new WeakMap<TModel, TModelState>();

/**
 * Marks a placed model as gone and hands back the pieces to take with it; `null` for one that was
 * already gone. What `destroy(model)` asks.
 *
 * @internal
 */
export const endModel = (model: TModel): TMesh[] | null => {
    const state = states.get(model);
    if (state === undefined || state.destroyed) return null;
    state.destroyed = true;
    return [...model.parts];
};

/**
 * Makes one drawable piece out of one piece of the file.
 *
 * Every piece is handed the **same** placement object rather than a copy of it, which is the whole
 * trick: there is nothing to keep in step afterwards, because there is only one of them.
 */
const buildPart = (
    store: TRuntimeStore,
    box: TBox,
    part: TGltfPart,
    skeleton: TSkeleton | null,
    transform: TTransform3d,
    options: TModelOptions,
    state: TModelState,
): TMesh => {
    const mesh = createRecord('mesh', {
        geometry: part.geometry,
        transform,
        skeleton,
        // One material per piece and not one for the model: the pieces are a body, glass and tyres,
        // and having their own colours is the reason the file bothered to keep them apart.
        material: newMaterial(
            {
                shader: 'mesh3d',
                tint: multiply(part.tint, state.tint),
                emissive: part.emissive,
                specular: options.specular === undefined ? undefined : getColor(options.specular),
                shininess: options.shininess,
                vertexSnap: options.vertexSnap,
                affine: options.affine,
                alpha: state.alpha,
                // The file's word unless the game says otherwise. A piece the file does not call
                // see-through is left to its alpha, rather than written down as solid.
                transparent: options.transparent ?? (part.transparent ? true : undefined),
                smooth: options.smooth,
                // The game's word over the file's, the same as for see-through.
                wrap: options.wrap ?? part.wrap,
                // The same looks on every piece, each over its own picture and colour.
                lighting: options.lighting,
                steps: options.steps,
            },
            part.texture,
            null,
        ) as TMeshMaterial,
        zIndex: state.zIndex,
        visible: state.visible,
        // Absent means casting, as for any model: written down only when it was said.
        ...(state.castShadow !== undefined ? { castShadow: state.castShadow } : {}),
        destroyed: false,
    });
    fileTints.set(mesh, part.tint);

    box.drawables.push(mesh);
    trackDrawableOwner(mesh, box, store);
    return mesh;
};

/**
 * Puts a loaded model in the scene.
 *
 * A model file is usually several pieces, each with its own colour or picture: a vehicle is a body,
 * glass and tyres. All of them are drawn, and **one placement moves the lot**, however deep the
 * file's own structure went. Where each piece sits inside the model is already worked into it.
 *
 * **The pieces appear when the file does.** On the frame you call this the model may still be on the
 * way, so `parts` is empty and nothing is drawn; a frame or two later it fills in and the model is
 * there. Nothing has to be waited for or wired up.
 *
 * `tint` multiplies, so the colours the model was made with survive: white leaves it exactly as it
 * was made, and a darker colour shades all of it at once.
 *
 * What comes back is used like any other drawing: `tint`, `alpha`, `zIndex`, `castShadow` and
 * `visible` on it change every piece at once, and can be set straight away (a model hidden before its
 * file arrives arrives hidden); `destroy(model)` takes it all. To change one piece alone, reach into
 * `parts` once the file is here.
 *
 * @param options The model, and anything else about how it looks.
 * @returns The placement and its pieces.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 6 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     const tower = useLoadGltf({ src: '/models/tower.glb' });
 *     const placed = createModel({ model: tower, transform: { y: -1 } });
 *
 *     useUpdate((delta) => {
 *         placed.transform.rotationY += delta * 0.5;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createModel = (options: TModelOptions): TModel => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error('[NacatamalOn] createModel: call it inside a scene body, or inside something created with useSpawn.');
    }

    const transform: TTransform3d = { ...NOWHERE, ...options.transform };
    // Kept here and not on any one piece, because there may be no pieces yet to keep it on.
    const state: TModelState = {
        visible: options.visible ?? true,
        tint: getColor(options.tint ?? 'white'),
        alpha: options.alpha,
        zIndex: options.zIndex,
        castShadow: options.castShadow,
        destroyed: false,
    };
    const source = options.model;
    const model = { id: nanoId(), type: 'model', transform, model: source, parts: [] as TMesh[], skeletons: [] as TSkeleton[] } as unknown as TModel;
    states.set(model, state);
    /**
     * A field of the model that goes to every piece: kept in the state, and written on each piece
     * there is when it is set.
     */
    const shared = <K extends keyof TModelState>(key: K, read: () => unknown, write: (value: TModelState[K]) => void, onPart: (part: TMesh) => void): void => {
        Object.defineProperty(model, key, {
            enumerable: true,
            get: read,
            set: (value: TModelState[K]) => {
                write(value);
                for (const part of model.parts) onPart(part);
            },
        });
    };
    shared('visible', () => state.visible, (value) => { state.visible = value; }, (part) => { part.visible = state.visible; });
    const tintPart = (part: TMesh): void => {
        part.material.tint = multiply(fileTints.get(part) ?? WHITE, state.tint);
    };
    /**
     * The tint as it is handed out: a channel changed on it (`model.tint.a = 0.2`, which is what a
     * tween does) reaches every piece too, as a whole colour set on the model does.
     */
    const tintView = (): TColor => new Proxy(state.tint, {
        set: (target, channel, value) => {
            (target as Record<string | symbol, unknown>)[channel] = value;
            for (const part of model.parts) tintPart(part);
            return true;
        },
    });
    let tint = tintView();
    shared('tint', () => tint, (value) => { state.tint = getColor(value); tint = tintView(); }, tintPart);
    shared('alpha', () => state.alpha ?? 1, (value) => { state.alpha = value; }, (part) => { part.material.alpha = state.alpha ?? 1; });
    shared('zIndex', () => state.zIndex ?? 0, (value) => { state.zIndex = value; }, (part) => { part.zIndex = state.zIndex; });
    shared('castShadow', () => state.castShadow !== false, (value) => { state.castShadow = value; }, (part) => { part.castShadow = state.castShadow; });
    Object.defineProperty(model, 'destroyed', { enumerable: true, get: () => state.destroyed });

    const build = (): void => {
        // Bones of its own, so another model of the same file can be doing something else. What
        // never changes (how the bones hang, how they stand at rest) is the file's and shared; what
        // a movement writes is this model's. The key is its own too: the card keeps a skeleton's
        // bones by it.
        const own = new Map<TSkeleton, TSkeleton>();
        for (const skeleton of source.skeletons) {
            const copy: TSkeleton = {
                ...skeleton,
                key: `${skeleton.key}@${model.id}`,
                pose: copyPose(skeleton.bindPose),
                jointMatrices: new Float32Array(skeleton.jointMatrices.length),
                posedOn: -1,
            };
            own.set(skeleton, copy);
            model.skeletons.push(copy);
        }
        for (const part of source.parts) {
            const skeleton = part.skeleton === null ? null : own.get(part.skeleton) ?? null;
            model.parts.push(buildPart(store, box, part, skeleton, transform, options, state));
        }
    };

    if (source.status === 'ready') {
        build();
        return model;
    }

    // The pieces are added to the scene after its body has run, which is the one thing here that is
    // not like every other game object. It is safe because the drawables of a box are read afresh
    // every frame, and it is necessary because how many pieces a file holds is not knowable until
    // the file is here. Both guards matter: a scene can be left, or the whole game ended, in the
    // time a file takes to arrive, and adding to either would be adding to something nobody draws.
    void whenLoaded(source).then(() => {
        // A model destroyed while its file was on the way never comes.
        if (store.get('loop').destroyed || box.destroyed || state.destroyed || source.status !== 'ready') {
            return;
        }
        build();
    });

    return model;
};

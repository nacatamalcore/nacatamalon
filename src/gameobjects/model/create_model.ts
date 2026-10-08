import { createRecord } from '../create_record';
import { newMaterial } from '../../materials';
import { getColor } from '../../color';
import { nanoId } from '../../utils';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { whenLoaded } from '../../loaders';
import type { TColor } from '../../color';
import type { TBox } from '../../box';
import type { TGltfPart } from '../../loaders';
import type { TMesh } from '../mesh/types/t_mesh';
import type { TMeshMaterial } from '../../materials';
import type { TModel } from './types/t_model';
import type { TModelOptions } from './types/t_model_options';
import type { TRuntimeStore } from '../../store';
import type { TTransform3d } from '../types/t_transform_3d';

/**
 * Nowhere in particular, which is where a model goes when it is not told.
 */
const NOWHERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * Two colours multiplied: the file's own, shaded by whatever was asked for on top.
 */
const multiply = (a: TColor, b: TColor): TColor => ({ r: a.r * b.r, g: a.g * b.g, b: a.b * b.b, a: a.a * b.a });

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
    transform: TTransform3d,
    options: TModelOptions,
    visible: boolean,
): TMesh => {
    const mesh = createRecord('mesh', {
        geometry: part.geometry,
        transform,
        skeleton: part.skeleton,
        // One material per piece and not one for the model: the pieces are a body, glass and tyres,
        // and having their own colours is the reason the file bothered to keep them apart.
        material: newMaterial(
            {
                shader: 'mesh3d',
                tint: multiply(part.tint, options.tint ?? getColor('white')),
                emissive: part.emissive,
                specular: options.specular,
                shininess: options.shininess,
                vertexSnap: options.vertexSnap,
                affine: options.affine,
                alpha: options.alpha,
                // The file's word unless the game says otherwise. A piece the file does not call
                // see-through is left to its alpha, rather than written down as solid.
                transparent: options.transparent ?? (part.transparent ? true : undefined),
                smooth: options.smooth,
                // The game's word over the file's, the same as for see-through.
                wrap: options.wrap ?? part.wrap,
            },
            part.texture,
            null,
        ) as TMeshMaterial,
        zIndex: options.zIndex,
        visible,
        destroyed: false,
    });

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
 * was made, and a darker colour shades all of it at once. To change one piece, reach into `parts`
 * once the file is here.
 *
 * `visible` on what this returns hides or shows the whole model, and can be set straight away: a
 * model hidden before its file arrives arrives hidden.
 *
 * @param options The model, and anything else about how it looks.
 * @returns The placement and its pieces.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', z: 6 });
 *     useLight({ intensity: 1 });
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
    let visible = options.visible ?? true;
    const model = { id: nanoId(), type: 'model', transform, parts: [] as TMesh[] } as TModel;
    Object.defineProperty(model, 'visible', {
        enumerable: true,
        get: () => visible,
        set: (value: boolean) => {
            visible = value;
            for (const part of model.parts) {
                part.visible = value;
            }
        },
    });
    const source = options.model;

    const build = (): void => {
        for (const part of source.parts) {
            model.parts.push(buildPart(store, box, part, transform, options, visible));
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
        if (store.get('loop').destroyed || box.destroyed || source.status !== 'ready') {
            return;
        }
        build();
    });

    return model;
};

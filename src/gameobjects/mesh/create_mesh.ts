import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { newMaterial } from '../../materials';
import type { TMesh } from './types/t_mesh';
import type { TMeshOptions } from './types/t_mesh_options';
import type { TMeshMaterial } from '../../materials';
import type { TTexture } from '../../loaders';

/**
 * Nowhere in particular, which is where a model goes when it is not told.
 */
const NOWHERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * The picture the options ask for: one given outright, or one looked up by the name it was loaded
 * under. A name that is not there throws, because a name is always deliberate and a plain surface
 * would hide the typo.
 */
const resolveTexture = (options: TMeshOptions): TTexture | null => {
    if (options.texture !== undefined) {
        return options.texture;
    }
    if (options.key === undefined) {
        return null;
    }

    const found = getActiveGame()?.get('assets').textures.get(options.key);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] createMesh: no texture loaded under key '${options.key}'. ` +
            `Did you forget useLoadTexture({ src, key: '${options.key}' })?`,
        );
    }
    return found;
};

/**
 * Puts a model in the scene: a shape, somewhere, with a surface.
 *
 * The shape comes from one of the shape hooks and is shared, so making a hundred of these from one
 * shape costs a hundred placements and not a hundred shapes.
 *
 * It is drawn through the scene's 3D camera, or flat on in the game's pixels when it has none. It
 * shares its draw order with everything else, so a model can sit between two sprites, and on a tie
 * the model is drawn first and the sprite paints over it.
 *
 * What comes back is the model itself, plain data: move it, turn it, tint it, hide it.
 *
 * @param options The shape, and anything else about how it looks.
 * @returns The model.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', z: 4 });
 *     const crate = createMesh({ geometry: useCubeGeometry(), tint: getColor('#c08040') });
 *
 *     useUpdate((delta) => {
 *         crate.transform.rotationY += delta;
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
export const createMesh = (options: TMeshOptions): TMesh => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error('[NacatamalOn] createMesh: call it inside a scene body, or inside something created with useSpawn.');
    }

    const mesh = createRecord('mesh', {
        geometry: options.geometry,
        transform: { ...NOWHERE, ...options.transform },
        // A shape built from one of the shape hooks never bends. Bones arrive with a loaded model,
        // through `createModel`.
        skeleton: null,
        // One handed in is shared with whatever else was handed it. Otherwise this model gets its
        // own, built from the very same fields it used to carry, so nothing about the call changes.
        material: options.material ?? newMaterial(
            {
                shader: 'mesh3d',
                tint: options.tint,
                emissive: options.emissive,
                specular: options.specular,
                shininess: options.shininess,
                vertexSnap: options.vertexSnap,
                affine: options.affine,
                alpha: options.alpha,
                transparent: options.transparent,
                smooth: options.smooth,
                wrap: options.wrap,
            },
            resolveTexture(options),
            null,
        ) as TMeshMaterial,
        zIndex: options.zIndex,
        visible: options.visible,
        // Left as written rather than defaulted to `true` here: absent means casting, and writing
        // the default down would make a scene document record a decision nobody took.
        castShadow: options.castShadow,
        destroyed: false,
    });

    box.drawables.push(mesh);
    trackDrawableOwner(mesh, box, store);

    return mesh;
};

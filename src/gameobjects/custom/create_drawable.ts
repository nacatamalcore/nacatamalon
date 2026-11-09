import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { drawableKindOf } from './drawable_kinds';
import type { TTransform3d } from '../types/t_transform_3d';
import type { TCustomDrawable } from './types/t_custom_drawable';

/**
 * Where a drawing is drawn from when nobody says: its object's own place.
 */
const HERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * Where a drawing of a registered kind goes, and whether it starts drawn.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCreateDrawableOptions = {
    /**
     * A name to find it by.
     */
    name?: string;
    /**
     * Where it is drawn from. Left out, the place of whatever it is made in.
     */
    transform?: Partial<TTransform3d>;
    /**
     * Draw order within the scene, as for any other drawing.
     */
    zIndex?: number;
    /**
     * Whether it starts drawn. Default `true`.
     */
    visible?: boolean;
};

/**
 * Makes a drawing of a kind a plugin registered (`registerDrawableKind`) on the object being built,
 * and gives it back: the engine's fields, and the plugin's own `fields` beside them.
 *
 * From there it is the engine's like any other drawing: it follows its object, is ordered with the
 * models of its scene, goes when its object does or with `destroy`, and the kind's `dispose` is
 * called then.
 *
 * Inside a scene body, a piece made with `useSpawn` or a behaviour, as `createMesh` is.
 *
 * @param kind The name the kind was registered under.
 * @param options Its name, where it goes and whether it starts drawn.
 * @param fields The plugin's own fields, kept on the drawing as they are.
 * @returns The drawing.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createDrawable = <TFields extends object = object>(
    kind: string,
    options: TCreateDrawableOptions = {},
    fields?: TFields,
): TCustomDrawable & TFields => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw outsideSceneBody('createDrawable');
    }
    const registered = drawableKindOf(kind);
    if (registered === undefined) {
        throw new Error(`[NacatamalOn] createDrawable: no kind '${kind}' is registered. Register it with registerDrawableKind before making its drawings.`);
    }

    const drawable = createRecord('custom', {
        ...fields,
        kind,
        space: registered.space ?? '3d',
        ...(options.name === undefined ? {} : { name: options.name }),
        transform: { ...HERE, ...options.transform },
        zIndex: options.zIndex,
        visible: options.visible,
        destroyed: false,
    }) as TCustomDrawable & TFields;

    box.drawables.push(drawable);
    trackDrawableOwner(drawable, box, store);
    return drawable;
};

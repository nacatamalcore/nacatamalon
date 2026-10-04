import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { writeLines } from './lines_state';
import type { TTransform3d } from '../types/t_transform_3d';
import type { TLines } from './types/t_lines';

/**
 * Where a set is drawn from when nobody says: its object's own place.
 */
const HERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * What every way of making lines shares: where they go, and whether they are drawn.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNewLinesOptions = {
    /**
     * A name to find the lines by.
     */
    name?: string;
    /**
     * Where the lines are drawn from. Left out, the place of whatever they are made in.
     */
    transform?: Partial<TTransform3d>;
    /**
     * Draw order within the scene, as for any other drawing.
     */
    zIndex?: number;
    /**
     * Whether they start drawn. Default `true`.
     */
    visible?: boolean;
};

/**
 * Makes a set of lines on the thing being built, with `vertices` as its first corners.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newLines = (caller: string, options: TNewLinesOptions, vertices: Float32Array): TLines => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error(`[NacatamalOn] ${caller}: call it inside a scene body, or inside something created with useSpawn.`);
    }

    const lines = createRecord('lines', {
        ...(options.name === undefined ? {} : { name: options.name }),
        transform: { ...HERE, ...options.transform },
        zIndex: options.zIndex,
        visible: options.visible,
        destroyed: false,
    });
    writeLines(lines, vertices);

    box.drawables.push(lines);
    trackDrawableOwner(lines, box, store);
    return lines;
};

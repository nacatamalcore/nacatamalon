import { worldPlacementOf } from '../../box';
import type { TBox } from '../../box/types/t_box';

/**
 * A rectangle of the world, unturned, by its edges.
 */
export type TBlock = { left: number; top: number; right: number; bottom: number };

/**
 * The objects under `root` with a flat collider that never moves (a `'static'` body that is not a
 * sensor), as the rectangles of the world they cover: the floors, walls and platforms a level lays
 * out as objects rather than as tiles. A round or many-sided collider counts as the rectangle around
 * it, and a turned one as if it were not turned, as the old games measured. `except` is left out:
 * the character itself.
 *
 * Read from the objects' own data, so it needs no physics engine.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stillColliders2d = (root: TBox, except: TBox): TBlock[] => {
    const out: TBlock[] = [];
    const visit = (box: TBox): void => {
        const body = box.physics;
        if (box !== except && !box.destroyed && body !== null && body._type === 'physics-body-2d' && body.body === 'static' && !body.sensor) {
            const at = worldPlacementOf(box);
            const c = body.collider;
            const [w, h] = c.shape === 'rect'
                ? [c.width, c.height]
                : c.shape === 'circle'
                    ? [c.radius * 2, c.radius * 2]
                    : [Math.max(...c.vertices.map((v) => Math.abs(v[0]))) * 2, Math.max(...c.vertices.map((v) => Math.abs(v[1]))) * 2];
            const hw = (w * Math.abs(at.scaleX)) / 2;
            const hh = (h * Math.abs(at.scaleY)) / 2;
            out.push({ left: at.x - hw, top: at.y - hh, right: at.x + hw, bottom: at.y + hh });
        }
        for (const child of box.children) visit(child);
    };
    visit(root);
    return out;
};

import type { TMesh } from '../../mesh/types/t_mesh';
import type { TTransform3d } from '../../types/t_transform_3d';

/**
 * A loaded model placed in the scene: one placement, and the pieces it is made of.
 *
 * **Move the placement and all of it moves**, however many pieces the file turned out to hold. The
 * pieces are ordinary models of their own, so anything you can do to one you can do to a wheel: tint
 * it, hide it, give it its own draw order.
 *
 * `parts` fills in when the file arrives, so it is empty on the frame you make this and has what the
 * file held on a later one. Look a piece up by the name it had in the file when you need one in
 * particular.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TModel = {
    id: string;
    type: 'model';
    /**
     * Where the whole thing is. Shared by every piece, which is what moves them together.
     */
    transform: TTransform3d;
    /**
     * The pieces, in the order the file lists them. Empty until it arrives.
     */
    parts: TMesh[];
    /**
     * Whether any of it is drawn. Setting it hides or shows every piece at once, and holds for the
     * pieces still on the way too: hidden before the file arrives, they arrive hidden.
     *
     * A piece can still be hidden on its own through `parts`; this overwrites them all.
     */
    visible: boolean;
};

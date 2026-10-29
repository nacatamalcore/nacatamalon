import type { TColor } from '../../../color';
import type { TMesh } from '../../mesh/types/t_mesh';
import type { TGltfModel } from '../../../loaders';
import type { TSkeleton } from '../../../animation';
import type { TTransform3d } from '../../types/t_transform_3d';

/**
 * A loaded model placed in the scene: one placement, and the pieces it is made of.
 *
 * **Move the placement and all of it moves**, however many pieces the file turned out to hold. What
 * is set on the model (`tint`, `alpha`, `zIndex`, `castShadow`, `visible`) goes to every piece at once,
 * the ones still on the way too, and `destroy(model)` takes them all. The pieces are ordinary models
 * of their own, so one alone can still be changed through `parts`: the glass of a car.
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
     * The file it was placed from, with the movements it knows (`clips`).
     */
    model: TGltfModel;
    /**
     * The pieces, in the order the file lists them. Empty until it arrives.
     */
    parts: TMesh[];
    /**
     * Its own bones, one set per skeleton in the file, which its pieces wear: what
     * `useSkeletalAnimation` moves. Its own and not the file's, so two models placed from one file
     * stand, walk and jump each on their own. Empty until the file arrives.
     */
    skeletons: TSkeleton[];
    /**
     * Whether any of it is drawn. Setting it hides or shows every piece at once, and holds for the
     * pieces still on the way too: hidden before the file arrives, they arrive hidden.
     *
     * A piece can still be hidden on its own through `parts`; this overwrites them all.
     */
    visible: boolean;
    /**
     * Multiplies the colour of every piece, so the file's own colours are kept and shaded: white
     * leaves it as it was made. Setting it shades them all at once, a flash of red on a hit:
     * `enemy.tint = getColor('red')`. It takes any colour, and reads back as `{ r, g, b, a }`.
     */
    tint: TColor;
    /**
     * How solid every piece is, `0` to `1`. Setting it fades them all at once.
     */
    alpha: number;
    /**
     * Draw order within its scene, for every piece. `0` by default.
     */
    zIndex: number;
    /**
     * Whether its pieces throw a shadow. `true` by default.
     */
    castShadow: boolean;
    /**
     * Whether every piece is drawn even off screen. `false` by default: a piece wholly outside what
     * the camera sees is skipped.
     */
    alwaysDrawn: boolean;
    /**
     * How far past its shape each piece can reach, in its own units, before it is judged off screen.
     * `undefined` until it is said.
     */
    boundsMargin: number | undefined;
    /**
     * `true` once `destroy(model)` has been asked: its pieces are gone, and one still on the way
     * never comes.
     */
    readonly destroyed: boolean;
};

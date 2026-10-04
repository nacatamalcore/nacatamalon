import type { TTransform3d } from '../../types/t_transform_3d';

/**
 * A set of lines in space: plain, unlit, one colour per corner. What the debug helpers draw (an
 * axis gizmo, a floor grid, an outline), and anything else that is best said with a line.
 *
 * **The corners are not here.** A record is plain data and a run of numbers the card reads is not,
 * so they live beside it: `useHelperLines` hands back the function that writes them. What is here is
 * what an ordinary drawable has, where it is and whether it is drawn, and changing those is all it
 * takes for the next frame to show it.
 *
 * Lines are hidden by the models in front of them, and hide what is behind them, the same as a
 * model: a line that ignored the scene would read as a wireframe floating over it. They are one
 * pixel wide on both backends, which is all the cards promise.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLines = {
    id: string;
    type: 'lines';
    /**
     * A name to find it by, like any other drawable.
     */
    name?: string;
    /**
     * Where the lines are drawn from: their corners are measured from here, turned and scaled by it.
     */
    transform: TTransform3d;
    /**
     * Where it ends up once everything above it has moved it. Set each frame; never authored.
     */
    worldMatrix?: Float32Array;
    /**
     * Draw order within its scene. On a tie, lines and models are drawn in the order they were made.
     */
    zIndex?: number;
    /**
     * Whether they are drawn at all. Omitted is drawn.
     */
    visible?: boolean;
    /**
     * Set by `destroy` and never cleared.
     */
    destroyed: boolean;
};

/**
 * What the debug mode hands whatever draws into it, a physics among them: outlines in the world, in
 * its pixels (or its units, in space), drawn over everything for one frame.
 *
 * A package that adds a physics of its own draws its bodies here from its provider's `drawDebug`, so
 * `useGame().setDebugEnabled(true)` shows them with everything else.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDebugDraw = {
    /**
     * The outline of a rectangle, by its middle and its size, turned about its middle by `rotation`
     * radians.
     */
    rect(x: number, y: number, width: number, height: number, color: string, rotation?: number): void;
    /**
     * The outline of a circle.
     */
    circle(x: number, y: number, radius: number, color: string): void;
    /**
     * A line between two points.
     */
    line(x1: number, y1: number, x2: number, y2: number, color: string): void;
    /**
     * The closed outline through some points.
     */
    polygon(points: ReadonlyArray<{ x: number; y: number }>, color: string): void;
    /**
     * A line in space, for what is three-dimensional.
     */
    line3d(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, color: string): void;
};

/**
 * The colours the debug mode draws in, by what a thing is, so every physics speaks the same language:
 * still things, things that move by themselves, things the game drives, sensors, things switched off,
 * hitboxes, the tiles that stop things, rays, and the edges of a world.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEBUG_COLORS = Object.freeze({
    still: '#8a9bb0',
    moving: '#4cff91',
    driven: '#ffd93d',
    sensor: '#5db6ff',
    off: '#5a5a6a',
    hitbox: '#ff5fd2',
    tile: '#ff9f45',
    ledge: '#c77dff',
    ray: '#ffffff',
    bounds: '#ff6b6b',
});

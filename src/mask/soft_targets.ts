import type { IRenderer, ITexture } from '../render/interface';

/**
 * The pictures soft masks draw into, kept per renderer between frames and handed out again in the
 * same order, so a scene with a soft mask makes its pictures once and then only draws into them.
 */
type TPool = {
    pictures: Array<{ texture: ITexture; width: number; height: number; idle: number }>;
    next: number;
};

const pools = new WeakMap<IRenderer, TPool>();

/**
 * How many frames a picture nobody asked for is kept before it is let go: long enough that a soft
 * mask switched off for a moment finds its pictures again, short enough that a scene that stopped
 * using them gives the memory back.
 */
const KEPT_IDLE = 120;

const poolOf = (renderer: IRenderer): TPool => {
    let pool = pools.get(renderer);
    if (pool === undefined) {
        pool = { pictures: [], next: 0 };
        pools.set(renderer, pool);
    }
    return pool;
};

/**
 * Starts handing out from the first picture again: called once at the start of every frame's
 * collection.
 *
 * @internal
 */
export const beginSoftTargets = (renderer: IRenderer): void => {
    poolOf(renderer).next = 0;
};

/**
 * A picture of this size to draw into this frame, made only when there is none to reuse.
 *
 * @internal
 */
export const takeSoftTarget = (renderer: IRenderer, width: number, height: number): ITexture => {
    const pool = poolOf(renderer);
    const at = pool.next++;
    const kept = pool.pictures[at];
    if (kept !== undefined && kept.width === width && kept.height === height) {
        kept.idle = 0;
        return kept.texture;
    }
    if (kept !== undefined) {
        renderer.destroyTexture(kept.texture);
    }
    const texture = renderer.createRenderTexture(width, height);
    pool.pictures[at] = { texture, width, height, idle: 0 };
    return texture;
};

/**
 * Lets go of the pictures nobody has asked for in a while: called once at the end of every frame's
 * collection.
 *
 * @internal
 */
export const endSoftTargets = (renderer: IRenderer): void => {
    const pool = pools.get(renderer);
    if (pool === undefined) {
        return;
    }
    for (let i = pool.next; i < pool.pictures.length; i++) {
        pool.pictures[i]!.idle++;
    }
    while (pool.pictures.length > pool.next && pool.pictures[pool.pictures.length - 1]!.idle > KEPT_IDLE) {
        renderer.destroyTexture(pool.pictures.pop()!.texture);
    }
};

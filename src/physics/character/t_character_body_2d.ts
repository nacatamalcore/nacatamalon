import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';

/**
 * A character of a platformer, moved by the game and stopped by the map: by its walls, ledges and
 * slopes, and, made with `useCharacterBody2d`, by everything else in the simulation, which it can
 * push. `useTileBody2d` and `useCharacterBody2d` both give one, so a game can change which it uses
 * by changing one line.
 *
 * Every field but `velocity` and `climbing` is read only, and each says what happened in the last
 * move, the one after the updates of the previous frame.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCharacterBody2d = {
    /**
     * Pixels per second, written by the game from a `useUpdate`: `x` walks, a negative `y` jumps, and
     * gravity pulls `y` down between moves. Standing on the ground or hitting a ceiling sets `y` back
     * to nothing; `x` is left as the game wrote it.
     */
    velocity: { x: number; y: number };
    /**
     * On a ladder, climbing: no gravity, ledges passed through, moved only by `velocity`. The game
     * sets it, when up is pressed on a ladder (`onLadder`); it goes back to `false` by itself once the
     * character has left the ladder.
     */
    climbing: boolean;
    /**
     * Standing on something: a floor, a ledge, a slope, a crate.
     */
    readonly onGround: boolean;
    /**
     * Its head hit something on the way up.
     */
    readonly onCeiling: boolean;
    /**
     * Pressed against a wall, and on which side.
     */
    readonly onWall: 'left' | 'right' | null;
    /**
     * Standing on a ledge (`oneWay`), which `dropThrough()` falls through.
     */
    readonly onOneWay: boolean;
    /**
     * In front of a ladder tile, which is when the game may set `climbing`.
     */
    readonly onLadder: boolean;
    /**
     * The tile underfoot, for what the game wrote on it (`ground?.props?.ice`), or `undefined` in the
     * air and on anything that is not a map.
     */
    readonly ground: TTileDoc | undefined;
    /**
     * The largest `damage` of the tiles it is touching, `0` for none. The game decides what it means.
     */
    readonly damage: number;
    /**
     * Falls through the ledge it is standing on. Nothing happens anywhere else.
     */
    dropThrough: () => void;
    /**
     * Puts it somewhere without asking the world: spawning, respawning. It can put it inside a wall.
     */
    setPosition: (x: number, y: number) => void;
    /**
     * Stops moving the object and takes the character out of the simulation.
     */
    destroy: () => void;
};

/**
 * What a character is, whatever moves it: its size, where that sits on the object, and how it falls.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCharacterShape2d = {
    /**
     * The box it collides with, in the object's own pixels: usually narrower than its picture, as
     * the old games did, so it fits through a gap one tile wide.
     */
    width: number;
    height: number;
    /**
     * Where the box's centre is from the object's position, in its own pixels. `[0, 0]` by default.
     */
    offset?: [number, number];
    /**
     * Pixels per second squared, pulling down. 900 by default (the world's gravity, for a character
     * in one), which with `step: 60` is a quarter of a pixel a frame, a classic platformer's.
     */
    gravity?: number;
    /**
     * The fastest it falls, in pixels per second. `420` by default: seven pixels a frame at `step: 60`.
     */
    maxFall?: number;
};

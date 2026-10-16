import { getActiveBox, getActiveGame } from '../../store';
import { rootOf } from '../../box/root_of';
import { placementOf } from '../../box/placement_of';
import { sceneTilemaps } from '../../gameobjects/tilemap/scene_tilemaps';
import { createTileBody2d } from './tile_body_2d';
import { stillColliders2d } from './still_colliders';
import type { TCharacterBody2d, TCharacterShape2d } from './t_character_body_2d';

/**
 * Makes this object a platformer's character that walks on the scene's maps, with no physics engine:
 * the game says how fast it goes, and the map stops it at walls, holds it on ledges and slopes, lets
 * it climb ladders and carries it on belts.
 *
 * **The classic way, in pixels.** It moves across, settles against walls, then up or down, settles
 * against the floor or the ceiling, the way the old platformers did, with nothing to load and the same
 * result on every machine at a fixed `step`. It knows the maps, and the objects laid out with a 2D
 * collider that never moves (a `'static'` body that is not a sensor: a floor, a wall, a platform made
 * of an object rather than of tiles), measured as the rectangle around them. For crates to push,
 * bridges that sag or anything else simulated, `useCharacterBody2d` from `nacatamalon/physics2d` gives the same
 * character in the 2D world, and changing between the two is changing this one line.
 *
 * It is moved once every `useUpdate` of the scene is over, where the game set its speed, and before
 * hitboxes are compared and `useLateUpdate` runs. Slopes are measured under the middle of its feet,
 * and a block of any height on flat ground is a wall. A map can be moved and scaled, not turned.
 *
 * @param options Its size, and how it falls.
 * @returns The character: `velocity` and `climbing` to drive it, and what happened in its last move.
 *
 * @example
 * ```ts
 * const Hero = () => {
 *     createSprite({ key: 'hero', transform: { x: 40, y: 100 } });
 *     const body = useTileBody2d({ width: 12, height: 24 });
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         const walk = (keys.isDown('ArrowRight') ? 1 : 0) - (keys.isDown('ArrowLeft') ? 1 : 0);
 *         body.velocity.x = walk * 90;
 *         if (keys.justPressed('x') && body.onGround) body.velocity.y = -300;
 *         if (keys.justPressed('ArrowDown') && body.onOneWay && !body.onLadder) body.dropThrough();
 *
 *         // Onto a ladder with up in front of it, or with down standing on its top.
 *         const up = keys.isDown('ArrowUp') && !body.onOneWay;
 *         const down = keys.isDown('ArrowDown') && body.onOneWay;
 *         if (body.onLadder && (up || down)) body.climbing = true;
 *         if (body.climbing) body.velocity.y = keys.isDown('ArrowUp') ? -60 : keys.isDown('ArrowDown') ? 60 : 0;
 *     });
 * };
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useTileBody2d = (options: TCharacterShape2d): TCharacterBody2d => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useTileBody2d: call it inside a scene body, or inside something created with useSpawn.');
    }
    if (placementOf(box) === null) {
        throw new Error(`[NacatamalOn] useTileBody2d: '${box.name}' is nowhere: give it a placement, or something to draw, so the character has somewhere to be.`);
    }
    const character = createTileBody2d({
        box,
        options,
        // The scene asked when it moves, not now: a map loads after the scene is built.
        tilemaps: () => sceneTilemaps(store, rootOf(box)),
        // And the floors and walls laid out as objects with a collider that never moves.
        blocks: () => stillColliders2d(rootOf(box), box),
    });
    // Moved once the updates that set its speed are over: see `runMoves`.
    box.moveCallbacks.push((dt) => character.move(dt));
    box.cleanups.push(character.remove);
    return character.body;
};

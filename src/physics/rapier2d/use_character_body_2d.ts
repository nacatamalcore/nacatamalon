import { getActiveBox, getActiveGame } from '../../store';
import { firstTimeIn } from '../../utils/first_time_in';
import { getPhysicsProviders } from '../physics_provider';
import { getPhysicsWorld2d } from './provider';
import type { TCharacterOptions2d } from './character_body_2d';
import type { TCharacterBody2d } from '../character/t_character_body_2d';

/**
 * A character that is not simulated: what a scene opened in a tool gets, where nothing is.
 */
const inert = (): TCharacterBody2d => ({
    velocity: { x: 0, y: 0 },
    climbing: false,
    onGround: false,
    onCeiling: false,
    onWall: null,
    onOneWay: false,
    onLadder: false,
    ground: undefined,
    damage: 0,
    dropThrough: () => {},
    setPosition: () => {},
    destroy: () => {},
});

/**
 * Makes this object a platformer's character: the game says how fast it goes, and the world stops it
 * at the map's walls, holds it on ledges and slopes, and lets it push what the simulation moves.
 *
 * **Moved by the game, not by physics.** It does not slide, bounce or keep its speed: it goes at the
 * speed the game writes into `velocity`, every frame, and stops dead when the game writes nothing.
 * That is how the old platformers felt, and it still lives in the simulation, so a crate is pushed by
 * it, a bridge sags under it, and something falling lands on its head.
 *
 * It is moved once every `useUpdate` of the scene is over, where the game set its speed, so what the
 * game decides this frame is seen this frame, and before hitboxes are compared and `useLateUpdate`
 * runs, so a camera follows it where it ended up.
 *
 * What it reads from the map's tiles: walls (`solid`), ledges (`oneWay`, landed on from above,
 * `dropThrough()` to fall through), slopes (`slope`), ladders (`onLadder`, then the game sets
 * `climbing`), belts and currents (`push`, which carry it), harm (`damage`, which it reports and
 * never applies) and the tile underfoot (`ground`, for whatever the game wrote in its `props`).
 *
 * Needs the scene's 2D world (`usePhysicsWorld2d`) and `installPhysics2d()`. Where nothing simulates,
 * as in a tool showing the scene, it is a character that never moves.
 *
 * @param options Its size, and how it falls, climbs and pushes.
 * @returns The character: `velocity` and `climbing` to drive it, and what happened in its last move.
 *
 * @example
 * ```ts
 * import { createSprite, useKeyboard, useUpdate } from 'nacatamalon';
 * import { useCharacterBody2d } from 'nacatamalon/physics2d';
 *
 * const Hero = () => {
 *     createSprite({ key: 'hero', transform: { x: 40, y: 100 } });
 *     const body = useCharacterBody2d({ width: 12, height: 24 });
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
export const useCharacterBody2d = (options: TCharacterOptions2d): TCharacterBody2d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useCharacterBody2d: call it inside a scene body, or inside something created with useSpawn.');
    }
    const world = getPhysicsWorld2d();
    if (world === null) {
        // Nothing installed is a tool showing the scene, and is said by nobody. Installed and still no
        // world is a scene that forgot to declare one.
        if (getPhysicsProviders().length > 0 && firstTimeIn(getActiveGame(), 'useCharacterBody2d: no world')) {
            console.warn('[NacatamalOn] useCharacterBody2d: the scene has no 2D world, so the character never moves. Call usePhysicsWorld2d() in the scene\'s body, before what is in it.');
        }
        return inert();
    }
    return world.addCharacter(box, options);
};

import { worldPose2d, writeWorldPose2d } from './world_pose';
import type { Collider, KinematicCharacterController, RigidBody, World } from '@dimforge/rapier2d-compat';
import type { TRapierModule } from './load_rapier';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';
import type { TCharacterBody2d, TCharacterShape2d } from '../character/t_character_body_2d';
import { readCharacterTiles, tilesUnder } from '../character/character_tiles';

/**
 * What a character in the simulation is: its size and how it falls, and how it climbs and pushes.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCharacterOptions2d = TCharacterShape2d & {
    /**
     * The steepest slope it walks up, in radians. About 50° by default; steeper ones it slides down.
     */
    maxSlope?: number;
    /**
     * Whether walking into something the simulation moves pushes it. `true` by default.
     */
    pushes?: boolean;
    /**
     * How heavy it counts as when it pushes. Left out, it pushes as if nothing could stop it.
     */
    mass?: number;
    /**
     * Its collision layer and what it collides with, as any body's.
     */
    layer?: number;
    collidesWith?: number;
};

/**
 * A ledge in the world: the top a character's feet have to be above for it to stand on it, its
 * bottom, and how far it reaches either side.
 *
 * @internal
 */
export type TLedge = { top: number; bottom: number; left: number; right: number };

const DEFAULT_MAX_FALL = 420;
const DEFAULT_MAX_SLOPE = (50 * Math.PI) / 180;
/**
 * The gap Rapier keeps between the character and what it touches, in pixels: too small to see, large
 * enough that a character resting on a floor is not inside it.
 */
const SKIN = 0.1;
/**
 * How round a character's corners are, in pixels.
 */
const CORNER = 1;
/**
 * How far below its feet a character walking down a slope is still pulled onto it, in pixels.
 */
const SNAP = 4;
/**
 * How far down a character that was standing is pressed to find the ground again, in pixels.
 */
const SETTLE = 2;
/**
 * A floor or a wall is a surface facing this much towards up or sideways: about 45°.
 */
const FACING = Math.SQRT1_2;

/**
 * Builds one character for a world: what `useCharacterBody2d` asks for.
 *
 * The character lives in the simulation as a body the game moves, so what is simulated (a crate, a
 * bridge) is pushed by it and lands on it, and it is moved by a controller that asks the world where
 * it can go. It is moved once a frame, after the updates that set its speed, rather than with the
 * world's own steps: what the game decides this frame is seen this frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCharacter2d = (deps: {
    rapier: () => TRapierModule | null;
    world: () => World | null;
    ledgeOf: (collider: number) => TLedge | undefined;
    ledges: () => Iterable<[number, TLedge]>;
    tilemaps: () => readonly TTilemap[];
    worldGravity: number;
    box: TGameObject;
    options: TCharacterOptions2d;
}): { body: TCharacterBody2d; move: (dt: number) => void; remove: () => void } => {
    const { box, options } = deps;
    const pose = worldPose2d(box);
    const halfWidth = Math.abs(options.width * pose.scaleX) / 2;
    const halfHeight = Math.abs(options.height * pose.scaleY) / 2;
    const shift = { x: (options.offset?.[0] ?? 0) * pose.scaleX, y: (options.offset?.[1] ?? 0) * pose.scaleY };
    const gravity = options.gravity ?? deps.worldGravity;
    const maxFall = options.maxFall ?? DEFAULT_MAX_FALL;
    const maxSlope = options.maxSlope ?? DEFAULT_MAX_SLOPE;

    const centre = { x: pose.x + shift.x, y: pose.y + shift.y };
    const velocity = { x: 0, y: 0 };
    const state = {
        climbing: false,
        onGround: false,
        onCeiling: false,
        onWall: null as 'left' | 'right' | null,
        onOneWay: false,
        onLadder: false,
        ground: undefined as TTileDoc | undefined,
        damage: 0,
    };
    // The ledges it is falling through, until its head is below their top.
    const dropping = new Set<number>();
    let rigid: RigidBody | null = null;
    let collider: Collider | null = null;
    let controller: KinematicCharacterController | null = null;
    let removed = false;
    // Whether it is touching a ladder, which is what keeps it climbing.
    let inLadder = false;

    const build = (rapier: TRapierModule, world: World): void => {
        rigid = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(centre.x, centre.y));
        // Its corners rounded by a pixel, inside its size: a sharp corner trips over the point where two
        // pieces of the level meet (a floor and the top of a slope), and lifts the character off the
        // ground for a frame.
        const round = Math.min(CORNER, halfWidth / 2, halfHeight / 2);
        const desc = rapier.ColliderDesc.roundCuboid(halfWidth - round, halfHeight - round, round);
        if (options.layer !== undefined || options.collidesWith !== undefined) {
            desc.setCollisionGroups(((((1 << (options.layer ?? 0)) << 16) | (options.collidesWith ?? 0xffff)) >>> 0));
        }
        collider = world.createCollider(desc, rigid);
        controller = world.createCharacterController(SKIN);
        // Up is towards the top of the screen, which is negative y here.
        controller.setUp({ x: 0, y: -1 });
        controller.setSlideEnabled(true);
        controller.setMaxSlopeClimbAngle(maxSlope);
        controller.setMinSlopeSlideAngle(maxSlope);
        controller.enableSnapToGround(SNAP);
        controller.setApplyImpulsesToDynamicBodies(options.pushes ?? true);
        controller.setCharacterMass(options.mass ?? null);
    };

    /**
     * What the tiles around it say, once it has moved: a ladder in front of it, harm, and the tile
     * under its feet.
     */
    const readTiles = (): void => {
        const tiles = readCharacterTiles(deps.tilemaps(), centre, halfWidth, halfHeight, state.onGround);
        state.onLadder = tiles.onLadder;
        state.damage = tiles.damage;
        state.ground = tiles.ground;
        inLadder = tiles.inLadder;
    };

    const move = (dt: number): void => {
        const rapier = deps.rapier();
        const world = deps.world();
        if (removed || rapier === null || world === null || dt <= 0) return;
        if (collider === null) build(rapier, world);
        if (collider === null || controller === null || rigid === null) return;

        if (!state.climbing) {
            velocity.y = Math.min(velocity.y + gravity * dt, maxFall);
        }
        // A belt carries what stands on it; a current or the wind, what is in it.
        const push = state.onGround ? state.ground?.push : tilesUnder(deps.tilemaps(), centre.x, centre.y, centre.x, centre.y).find((tile) => tile.push !== undefined)?.push;
        const desired = { x: (velocity.x + (push?.x ?? 0)) * dt, y: (velocity.y + (push?.y ?? 0)) * dt };
        // Standing, gravity is not pressed into the floor: asked to walk and sink at once, the
        // controller now and then walks nowhere. Staying on a floor that drops away (a slope going
        // down) is what its snap to the ground does.
        if (state.onGround && !state.climbing && velocity.y >= 0 && desired.y > 0) {
            desired.y = 0;
        }

        const feet = centre.y + halfHeight;
        const head = centre.y - halfHeight;
        // Fallen through: a ledge it dropped through is solid again once it is wholly below it.
        for (const handle of dropping) {
            const ledge = deps.ledgeOf(handle);
            if (ledge === undefined || head > ledge.top) dropping.delete(handle);
        }

        collider.setTranslation(centre);
        controller.computeColliderMovement(collider, desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS, collider.collisionGroups(), (other) => {
            const ledge = deps.ledgeOf(other.handle);
            if (ledge === undefined) return true;
            // A ledge holds what lands on it from above, and nothing else: not what jumps up into
            // it, not what climbs, not what is dropping through it.
            return !state.climbing && !dropping.has(other.handle) && desired.y >= 0 && feet <= ledge.top + SKIN * 2;
        });

        const moved = controller.computedMovement();
        centre.x += moved.x;
        centre.y += moved.y;

        const wasOnGround = state.onGround;
        state.onGround = controller.computedGrounded();
        const hits = [];
        for (let i = 0; i < controller.numComputedCollisions(); i++) {
            const hit = controller.computedCollision(i);
            if (hit !== null) hits.push({ x: hit.normal1.x, y: hit.normal1.y, ledge: hit.collider !== null && deps.ledgeOf(hit.collider.handle) !== undefined });
        }

        // Walking over the point where two pieces of the level meet (a floor and the top of a slope)
        // lifts it a hair, and for that frame it would be in the air. Something that was standing and
        // is not jumping is pressed back down a little, and stands if there is ground there.
        if (wasOnGround && !state.onGround && !state.climbing && velocity.y >= 0 && desired.y >= 0) {
            collider.setTranslation(centre);
            controller.computeColliderMovement(collider, { x: 0, y: SETTLE }, rapier.QueryFilterFlags.EXCLUDE_SENSORS, collider.collisionGroups(), (other) => {
                const ledge = deps.ledgeOf(other.handle);
                return ledge === undefined || (!dropping.has(other.handle) && centre.y + halfHeight <= ledge.top + SKIN * 2);
            });
            const settle = controller.computedMovement();
            if (settle.y < SETTLE - 1e-3) {
                centre.y += settle.y;
                state.onGround = true;
            }
        }
        state.onCeiling = false;
        state.onWall = null;
        state.onOneWay = false;
        // Each obstacle's normal, pointing at the character.
        for (const { x, y, ledge } of hits) {
            if (y >= FACING && desired.y < 0) state.onCeiling = true;
            else if (x >= FACING) state.onWall = 'left';
            else if (x <= -FACING) state.onWall = 'right';
            if (y <= -FACING && ledge) state.onOneWay = true;
        }
        if (state.onGround && !state.onOneWay) {
            // Resting on a ledge reports no collision once it has settled, so it is asked directly.
            const standing = centre.y + halfHeight;
            for (const [handle, ledge] of deps.ledges()) {
                if (!dropping.has(handle) && Math.abs(ledge.top - standing) <= SKIN * 3 && centre.x + halfWidth > ledge.left && centre.x - halfWidth < ledge.right) {
                    state.onOneWay = true;
                    break;
                }
            }
        }
        if ((state.onGround && velocity.y > 0) || (state.onCeiling && velocity.y < 0)) {
            velocity.y = 0;
        }

        readTiles();
        // Climbed out of the ladder, by its top or its side: no longer climbing.
        if (state.climbing && !inLadder) state.climbing = false;

        rigid.setNextKinematicTranslation(centre);
        collider.setTranslation(centre);
        writeWorldPose2d(box, centre.x - shift.x, centre.y - shift.y, 0);
    };

    const remove = (): void => {
        if (removed) return;
        removed = true;
        const world = deps.world();
        if (world !== null) {
            if (controller !== null) world.removeCharacterController(controller);
            if (rigid !== null) world.removeRigidBody(rigid);
        }
        controller = null;
        rigid = null;
        collider = null;
    };

    const body: TCharacterBody2d = {
        velocity,
        get climbing() { return state.climbing; },
        set climbing(value: boolean) { state.climbing = value; },
        get onGround() { return state.onGround; },
        get onCeiling() { return state.onCeiling; },
        get onWall() { return state.onWall; },
        get onOneWay() { return state.onOneWay; },
        get onLadder() { return state.onLadder; },
        get ground() { return state.ground; },
        get damage() { return state.damage; },
        dropThrough: () => {
            if (!state.onOneWay) return;
            const standing = centre.y + halfHeight;
            for (const [handle, ledge] of deps.ledges()) {
                if (Math.abs(ledge.top - standing) <= SKIN * 3 && centre.x + halfWidth > ledge.left && centre.x - halfWidth < ledge.right) {
                    dropping.add(handle);
                }
            }
            state.onGround = false;
            state.onOneWay = false;
        },
        setPosition: (x, y) => {
            centre.x = x + shift.x;
            centre.y = y + shift.y;
            rigid?.setTranslation(centre, true);
            collider?.setTranslation(centre);
            writeWorldPose2d(box, x, y, 0);
        },
        destroy: remove,
    };

    return { body, move, remove };
};

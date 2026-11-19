import { sceneOnly } from '../../game_systems/game_systems';
import { getActiveBox, getActiveGame } from '../../store';
import { resolveLayers } from '../../physics/layer_names';
import type { TPhysicsLayerOptions } from '../../physics/layer_names';
import { isShowingOnly } from './is_showing_only';
import { getPhysicsProviders, createCollisionShape2d, createCollisionShape3d, shapeOwnerOf } from '../../physics';
import type { TCollider2d, TCollider3d, TCollisionShape, TCollisionShape2d, TCollisionShape3d, TPhysicsSurface } from '../../physics';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { firstTimeIn } from '../../utils/first_time_in';
import type { TBox } from '../../box';

/**
 * What a flat collision shape is: its shape, and whatever of its surface is not its body's.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionShape2dOptions = {
    id?: string;
    name?: string;
    collider: TCollider2d;
} & Partial<Omit<TPhysicsSurface, 'layer' | 'collidesWith'>> & TPhysicsLayerOptions;

/**
 * The same for a collision shape in space, with an `offset` like a body's.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionShape3dOptions = {
    id?: string;
    name?: string;
    collider: TCollider3d;
    offset?: [number, number, number];
} & Partial<Omit<TPhysicsSurface, 'layer' | 'collidesWith'>> & TPhysicsLayerOptions;

/** The names the game gave its physics layers, for a shape that says its layers by name. */
const layerNames = (): readonly string[] => getActiveGame()?.get('config').physicsLayers ?? [];

/**
 * Writes the shape on the object, and hands it to what simulates, for the body it belongs to.
 * One way in for both dimensions, like a body's.
 */
const declare = <T extends TCollisionShape>(box: TBox, record: T, caller: string): T => {
    box.collisionShape = record;
    const owner = shapeOwnerOf(box, record._type === 'collision-shape-2d' ? '2d' : '3d');
    if (owner === null) {
        if (firstTimeIn(getActiveGame(), `physics: shape with no body: ${caller}`)) {
            console.warn(`[NacatamalOn] ${caller}: '${box.name}' has a collision shape and no body above it, so it collides as nothing. Give the object it belongs to a body (usePhysicsBody), above this one or on it.`);
        }
        return record;
    }
    // Shown, not played: written down and not simulated. Nothing installed is the body's to say.
    if (isShowingOnly()) return record;
    for (const provider of getPhysicsProviders()) provider.addShape?.(owner, box, record);
    return record;
};

/**
 * Gives the nearest body above this object one more flat shape, placed by this object: where it is,
 * how it is turned and how big it is, relative to the body.
 *
 * For a body one shape will not do: a cart is a box and two round wheels, a character a body and
 * a head, a ramp a shape turned apart from the object it is on. The body is said with
 * `usePhysicsBody2d` on the object above, with its own shape or with `collider: null` when its
 * shapes are all on objects under it; the whole moves as one.
 *
 * Its surface is the body's unless it says otherwise: only what it gives is its own, so a rubber
 * wheel says its bounce and nothing else.
 *
 * It is placed once, when it is made: moving this object afterwards does not move the shape.
 *
 * @example
 * ```ts
 * const Wheel = (x: number) => {
 *     useTransform({ x, y: 10 });
 *     useCollisionShape2d({ collider: { shape: 'circle', radius: 8 }, bounce: 0.6 });
 * };
 *
 * const Cart = () => {
 *     createSprite({ tint: getColor('#8b5a2b'), width: 48, height: 16, transform: { x: 100, y: 50 } });
 *     usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 48, height: 16 } });
 *     useSpawn(Wheel)(-16);
 *     useSpawn(Wheel)(16);
 * };
 * ```
 *
 * @param options - Its shape, and what of its surface is its own.
 * @returns The shape as the scene keeps it.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCollisionShape2d = (options: TCollisionShape2dOptions): TCollisionShape2d => {
    const box = getActiveBox();
    if (box === null) throw outsideSceneBody('useCollisionShape2d');
    sceneOnly('useCollisionShape2d');
    const { layer, collidesWith, ...rest } = options;
    const layers = layer === undefined && collidesWith === undefined ? {} : resolveLayers({ layer, collidesWith }, layerNames());
    return declare(box, createCollisionShape2d({ name: box.name, ...rest, ...layers }), 'useCollisionShape2d');
};

/**
 * Gives the nearest body above this object one more shape in space, placed by this object. The
 * sibling of {@link useCollisionShape2d}; see it for how a shape and its body go together.
 *
 * The shape is turned with its object, which a body's own shape cannot be: a capsule lying across a
 * ring, a box tilted on a ramp.
 *
 * @example
 * ```ts
 * const Bar = () => {
 *     // Lying across the ring: a capsule stands on Y, so it is turned a quarter onto X.
 *     useTransform({ rotation: Math.PI / 2 });
 *     useCollisionShape3d({ collider: { shape: 'capsule', radius: 0.2, height: 1.2 } });
 * };
 *
 * const Ring = () => {
 *     createMesh({ geometry: useTorusGeometry(), tint: getColor('#e0a030'), transform: { y: 2 } });
 *     usePhysicsBody3d({ body: 'dynamic', collider: null });
 *     useSpawn(Bar)();
 * };
 * ```
 *
 * @param options - Its shape, where it sits in its object, and what of its surface is its own.
 * @returns The shape as the scene keeps it.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCollisionShape3d = (options: TCollisionShape3dOptions): TCollisionShape3d => {
    const box = getActiveBox();
    if (box === null) throw outsideSceneBody('useCollisionShape3d');
    sceneOnly('useCollisionShape3d');
    const { layer, collidesWith, ...rest } = options;
    const layers = layer === undefined && collidesWith === undefined ? {} : resolveLayers({ layer, collidesWith }, layerNames());
    return declare(box, createCollisionShape3d({ name: box.name, ...rest, ...layers }), 'useCollisionShape3d');
};

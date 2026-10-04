/**
 * How a body is driven, and what it lets happen to it.
 *
 * `'static'` never moves and nothing can push it: walls, the ground, the level. `'dynamic'` is
 * driven by gravity, forces and contacts, and is what "a physics object" usually means.
 * `'kinematic'` is driven by you and pushes others without being pushed back: a moving platform, a
 * lift, a boss on rails.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBodyType = 'static' | 'dynamic' | 'kinematic';

/**
 * The shape a flat body collides with, **centred on where the object is**.
 *
 * Centred and not cornered, because that is where this engine puts a picture too: a sprite's
 * `anchor` is its middle unless somebody says otherwise, so a shape the same size as the art lines
 * up with it without anybody working out an offset. An object drawn from its corner (`anchor` at
 * zero, which is how a floor is usually written) is the case where the two differ, and there the
 * placement is the corner and the shape is still around it.
 *
 * **The set is small and closed on purpose.** It is what any 2D physics engine has in common, not a
 * copy of one library's list: the document has to outlive whatever is simulating it, and a shape no
 * backend can build would be a field that does nothing.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollider2d =
    | { shape: 'rect'; width: number; height: number }
    | { shape: 'circle'; radius: number }
    /**
     * Convex. A shape with a dent in it quietly becomes its outline; use several pieces instead.
     */
    | { shape: 'polygon'; vertices: Array<[number, number]> };

/**
 * The shape a body in three dimensions collides with, around the object's origin unless it carries
 * an `offset`.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollider3d =
    | { shape: 'box'; size: [number, number, number] }
    | { shape: 'sphere'; radius: number }
    /**
     * A cylinder with rounded ends, standing on **Y**. This is the character's shape: a box catches
     * on the joins between floor pieces and on the lip of a step, and this rides over both.
     *
     * `height` is the **whole** height including the round ends, the way a person measures a
     * character, so somebody 1.8 tall and 0.3 wide is `{ radius: 0.3, height: 1.8 }` and not a
     * 1.2 cylinder they have to work out. Backends say it as two centres; converting is the
     * adapter's job, which is the standing rule that this format says what physics **means** rather
     * than what one library's signature looks like.
     */
    | { shape: 'capsule'; radius: number; height: number }
    /**
     * The convex wrapping of a shape asset's points, named by the same key a model uses. The scene
     * keeps the key and never the points: they are already in the manifest, and writing them twice
     * is how the two come to disagree.
     */
    | { shape: 'hull'; geometry: string }
    /**
     * The shape's actual triangles, dents and all. This is level geometry: ground, a room, a track.
     * Static in practice, because a dented shape has no well-defined inside for a solver to push
     * out of.
     */
    | { shape: 'mesh'; geometry: string };

/**
 * What a collider is made of: how a contact settles, and whether it settles at all.
 *
 * **Every field is required, and that is the point.** This is the written-down truth of a scene, and
 * an absent value would mean "whatever the adapter does", which would make the meaning of a document
 * depend on who reads it. A scene that behaves differently under a different backend is exactly the
 * coupling this format exists to prevent.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsSurface = {
    /**
     * Bounciness: how much of the speed it arrived with it leaves with, `0` to `1`.
     *
     * It belongs to the **pair** and not to one body: an engine mixes the two colliders' values
     * (usually by averaging), so a ball asking for `0.8` landing on a floor left at `0` bounces at
     * `0.4`. Set both sides.
     */
    restitution: number;
    friction: number;
    /**
     * Weight comes from this and the shape's size, and is never set directly.
     */
    density: number;
    /**
     * Notices overlaps without settling them, so things pass straight through: a checkpoint, a
     * pickup, a place that hurts.
     */
    sensor: boolean;
    /**
     * Which layer this body **is on**, `0` to `15`.
     *
     * One layer, and the restraint is deliberate: "what is this thing" has one answer in every game
     * that has ever needed layers, and the moment something is on two, a table of what hits what
     * stops being readable by eye. What varies is what it collides **with**.
     */
    layer: number;
    /**
     * A mask of the layers this body collides with: `1 << n` per layer, so {@link ALL_LAYERS} is
     * everything and `(1 << 0) | (1 << 2)` is layers 0 and 2.
     *
     * **It is mutual, and that is the rule that surprises people.** Two bodies meet only if each
     * one's mask includes the other's layer, so a bullet that lists walls still passes through them
     * unless walls also list bullets. Both backends work that way, so the format says so instead of
     * papering over it: a one-sided rule would have to be faked on both sides and still would not
     * mean the same thing in each.
     */
    collidesWith: number;
};

/**
 * A flat collider on an object: what it is made of, and how it is driven.
 *
 * Where it is is **not** here. The object owns that, by the standing rule that a component carries
 * no placement of its own, which is also why moving the object moves its collider.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody2d = {
    _type: 'physics2d';
    id: string;
    name: string;
    body: TPhysicsBodyType;
    collider: TCollider2d;
} & TPhysicsSurface;

/**
 * A collider in three dimensions. See {@link TPhysicsBody2d} for why the placement is not here.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody3d = {
    _type: 'physics3d';
    id: string;
    name: string;
    body: TPhysicsBodyType;
    collider: TCollider3d;
    /**
     * Where the shape sits **inside** the object, before its scale.
     *
     * This does not contradict the rule above: the object still owns where the *object* is, and
     * this says where the *shape* sits within it, which is a different question.
     *
     * It exists because of models. An imported one almost always puts its origin where the thing
     * **stands**, at a character's feet, while a collider is centred on that origin, so fitting a
     * body to such a model buries half of it in the floor.
     */
    offset: [number, number, number];
} & TPhysicsSurface;

/**
 * Either kind of collider, told apart by `_type`.
 *
 * Two types and not one with a flag, because their shapes do not overlap (a circle is not a sphere)
 * and everything reading them would otherwise have to unwrap one discriminant inside another.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody = TPhysicsBody2d | TPhysicsBody3d;

/**
 * The flat simulation's settings for one scene.
 *
 * `gravity` is in **pixels per second squared with +y pointing DOWN**, because that is the way a
 * sprite's y axis grows and the simulation writes straight onto a placement. So earth-ish gravity is
 * about `900`, positive: the opposite sign from three dimensions. The disagreement is deliberate,
 * because turning 2D into metres would put a pixels-per-metre factor into every flat game and every
 * push, and buy a tidiness no author benefits from, since no scene mixes the two.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorld2d = {
    _type: 'physics-world-2d';
    /**
     * Its own id, like every other component. A world has no name (neither does a camera), and it
     * still has to be addressable: a tool selects and removes it by id.
     */
    id: string;
    gravity: { x: number; y: number };
};

/**
 * The simulation's settings in three dimensions. `gravity` is in **metres per second squared with
 * +y UP**, so earth is `{ x: 0, y: -9.81, z: 0 }`. See {@link TPhysicsWorld2d} for why the two
 * disagree on purpose.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorld3d = {
    _type: 'physics-world-3d';
    id: string;
    gravity: { x: number; y: number; z: number };
};

/**
 * Either simulation's settings. A scene has at most one, and it lives on the **scene's root**:
 * gravity is a property of the scene and not of anything in it (a scene seen from above has none, a
 * platformer does), and the root is an object like any other, so it needs no new home.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorld = TPhysicsWorld2d | TPhysicsWorld3d;

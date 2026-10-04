import type { TFog } from '../../fog/types/t_fog';
import type { TDrawable } from '../../gameobjects/types';
import type { TDataRecord } from '../../hooks/state';
import type { TScriptAttachment } from '../../scripts';
import type { TAudioListener, TMusicAttachment, TSoundAttachment } from '../../audio';
import type { TPhysicsBody, TPhysicsWorld } from '../../physics';
import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';
import type { TLight } from '../../light';
import type { TParticleCollider2d, TParticleCollider3d } from '../../gameobjects/particles/colliders/t_particle_collider';
import type { TLoadable } from '../../loaders';
import type { TCamera2d } from '../../camera';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TSpriteTexture } from '../../gameobjects/sprite_texture/types/t_sprite_texture';

/**
 * One box at runtime: the engine's single composition primitive, a node in the tree. A scene
 * root is a box too.
 *
 * Only what a box needs before it can hold anything: an identity, its place in the tree, and
 * what it registered while being built. Components (transform, drawables, camera...) arrive
 * with the features that read them.
 *
 * `parent`, `updateCallbacks` and `cleanups` are runtime-only and never serialized: `parent`
 * points back up the tree, so a naive `JSON.stringify` would throw, and the other two hold
 * functions.
 *
 * @category Boxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBox = {
    /**
     * Unique for the life of the game.
     */
    id: string;
    /**
     * What the box is called where it was placed. Not unique: two enemies can share it.
     */
    name: string;
    /**
     * `null` for a scene root. Kept so a box can be detached without searching the tree.
     */
    parent: TBox | null;
    children: TBox[];
    /**
     * Registered by `useUpdate`, called every frame with the delta and the scene's time, in seconds.
     */
    updateCallbacks: Array<(dt: number, time: number) => void>;
    /**
     * Run once, children first, when the box leaves the tree.
     */
    cleanups: Array<() => void>;
    /**
     * What this box draws: its own sprites, not other boxes. Read every frame to fill the frame context.
     */
    drawables: TDrawable[];
    /**
     * The behaviours attached to it, in the order they were attached, which is the order they ran
     * in. See `useScript`.
     *
     * An attachment is kept **whether or not the behaviour ran**: a saved scene outlives the code
     * it names, so a name nothing registered is reported and held rather than dropped, and saving
     * again does not quietly delete somebody's work.
     */
    scripts: TScriptAttachment[];
    /**
     * What the behaviours on this object published for each other, by key. Empty on almost every
     * object. Written by `provide`, read by `useApi`.
     *
     * **Runtime only, and never written to a file**: these are functions. It does not need saving
     * either, because the scripts are run again when the scene is opened and publish again as they
     * go.
     *
     * This is the seam that lets behaviours written apart drive one another. Two on one object
     * already share the object, which covers reading each other's *effects*, a placement or a
     * colour. What it does not cover is calling into one another, and this does.
     */
    provided: Map<string, unknown>;
    /**
     * The state its own body asked for with `useData`, in the order it asked.
     *
     * A port like the others, and the reason it is one rather than a closure variable: this is what
     * gets written down when the scene is saved, and read back when it is opened. State nobody can
     * see is state a level editor cannot show and a save file cannot keep.
     *
     * The order is the identity, which is what makes it positional in the document too.
     */
    data: TDataRecord<unknown>[];
    /**
     * The sounds attached to it: which clip, and how each was asked to play.
     *
     * A port like the others, and for the same reason: a sound is something an object **is** (a
     * torch crackles, a level has its music), so it has to be there to be shown in a list, edited
     * and written down. What is kept is how it was asked to play and never what is playing, so a
     * scene saved mid-tune comes back ready to start it rather than halfway through.
     */
    sounds: Array<TSoundAttachment | TMusicAttachment>;
    /**
     * The stores this object uses, by name.
     *
     * Names and nothing else, because **a store is not in the object and cannot be**: it outlives
     * every scene, and one living here would die with its scene and be two the moment a second
     * object named it. The link is what a behaviour follows to reach state it did not define, and
     * it is what lets the tree answer which objects touch a given piece of state.
     */
    stores: string[];
    /**
     * What this object is made of, physically, or `null` for one nothing can bump into.
     *
     * A component and not a child object, because it is **something the object is**, the same as
     * its picture and its sound. (An engine whose only primitive is the node has to make physics a
     * node with a shape hanging under it; here there are both, and the rule for choosing is in the
     * glossary.)
     */
    physics: TPhysicsBody | null;
    /**
     * The simulation's settings, on a scene's root and nowhere else.
     *
     * Gravity belongs to the scene rather than to anything in it: a scene seen from above has none
     * and a platformer does. The root is an object like any other, so it needs no new home, and
     * only the root's is read.
     */
    physicsWorld: TPhysicsWorld | null;
    /**
     * Only meaningful on a scene root: while `true` the tick skips this scene's updates and still
     * draws it. Lives on the root so it goes away with the scene and cannot be left behind.
     */
    paused: boolean;
    /**
     * Only meaningful on a scene root: while `true` this scene is waiting behind a transition.
     *
     * **Held is not paused, and the difference is the drawing.** A paused scene keeps being drawn,
     * because that is what a pause menu over a frozen level needs. A held one is not drawn at all,
     * because it is the scene coming in and the screen is still showing the one going out.
     *
     * It does not update and does not answer the pointer either, and that matters as much as the
     * drawing: a scene ticking away behind a cover arrives at its first visible frame already
     * several frames old, with its character having walked on its own.
     *
     * Set by `useScene().change` when it is given a transition, and cleared at the swap. Nothing
     * else sets it: a scene cannot hold itself.
     */
    held: boolean;
    /**
     * Only meaningful on a scene root: the seconds of game time this scene has run, the `time` that
     * `useUpdate` hands out. Advanced only when the scene's updates run, so a pause, a hold or a
     * `timeScale` stop it exactly as they stop `delta`. On the root so a scene that starts again
     * starts from zero. Runtime only.
     */
    time: number;
    /**
     * Only meaningful on a scene root: every asset the scene's body asked for, ready or not, in the
     * order asked. What `useLoader()` counts. Runtime only.
     */
    loads: TLoadable[];
    /**
     * Set by `destroy` and never cleared. The frame that marked it stops updating it at once, even
     * though it is only taken out of the tree at the end of that frame.
     */
    destroyed: boolean;
    /**
     * Born **after** its scene finished being built, rather than as part of building it.
     *
     * The distinction is authored content against things in flight, and the place it matters is
     * writing a scene down: a level built out of `useSpawn` calls in its own body is the level, and
     * a bullet fired three seconds later is not. Saving a game mid-play must write the first and
     * none of the second.
     *
     * Worked out from whether a body was running at the moment of the spawn, not from which call
     * made it. `useSpawn` is used for both jobs in the same file, so marking everything it makes
     * would throw away the level along with the bullets.
     */
    spawned: boolean;
    /**
     * Only meaningful on a scene root: the camera the scene's 2D is drawn through, or `null` to draw
     * it straight in screen pixels. On the root because a camera belongs to the scene, whichever
     * object inside it asked for one.
     */
    camera2d: TCamera2d | null;
    /**
     * Only meaningful on a scene root: the camera the scene's 3D is seen through, or `null` to draw
     * it flat on in the game's pixels. On the root for the same reason as the 2D one.
     */
    camera3d: TCamera3d | null;
    /**
     * Only meaningful on a view (a scene root, or a box drawn into a picture): the fog its models are
     * seen through, from `useFog`. Kept where the camera is, for the same reason.
     */
    fog: TFog | null;
    /**
     * Where this box is, which moves everything under it: its own drawables and every box beneath.
     * `null` means it is not anywhere in particular, which is what an empty box used only to group
     * things should cost: nothing.
     *
     * This is what makes a box a place and not just a list. A turret's barrel, its flash and its
     * shadow are put where the turret is, once, and turning the turret turns all three.
     *
     * It reaches drawables and the lights beneath it. A camera reads its own placement instead,
     * because a camera is what everything else is measured against.
     */
    transform: TTransform3d | null;
    /**
     * The light this box gives off, or `null`. One per box: a lamp is a thing in the world, and two
     * lamps are two things.
     *
     * Unlike a camera, a light **moves with the box it is in**, so a lantern carried by a character
     * goes where the character goes without anything keeping the two in step.
     */
    light: TLight | null;
    /**
     * What this box is to particles: something solid, or `null`. One per box, like its light, and
     * placed by the box the same way, so a step of a staircase is a box and its collider moves with it.
     */
    particleCollider: TParticleCollider2d | TParticleCollider3d | null;
    /**
     * The ears of the game when they are on this object, or `null`. One per box. Without any, the
     * game is heard from the camera.
     */
    audioListener: TAudioListener | null;
    /**
     * The picture this box and everything under it is drawn into instead of the screen, or `null`.
     *
     * A box with one is where a world ends: the walk that draws the screen stops at it, a camera
     * asked for under it is its own, and a lamp under it lights only the picture.
     */
    spriteTexture: TSpriteTexture | null;
    /**
     * Pins this box, and everything under it, to the screen: drawn as if the scene had no camera.
     * Inherited downwards, so marking a HUD once covers every piece of it however deep.
     */
    screenSpace: boolean;
    /**
     * Whether this box and everything under it is drawn. Inherited downwards, so turning off a
     * turret takes its barrel, its flash and its shadow with it.
     *
     * Two levels, and both are useful: this one answers "is this object here at all", the `visible`
     * on a drawable answers "is this one picture of it drawn".
     *
     * **Hiding is not disabling.** A hidden box still runs its `useUpdate`, still plays its sounds
     * and still loads what it asked for. Something that has to stop as well as disappear has to be
     * told to stop.
     */
    visible: boolean;
};

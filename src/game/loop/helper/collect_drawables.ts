import * as mat from '../../../math/mat4';
import { composeTransform2d } from '../../../render/shared/compose_transform_2d';
import { computeModelMatrix } from '../../../render/shared/compute_mvp_3d';
import { placeCollider2d, placeCollider3d } from '../../../gameobjects/particles/collide';
import type { TBox } from '../../../box';
import type { TPlacedCollider2d, TPlacedCollider3d, TSceneColliders } from '../../../gameobjects/particles/collide';
import type { TDrawable } from '../../../gameobjects/types';
import type { TTransform2d } from '../../../gameobjects/types/t_transform_2d';
import type { TCamera2d } from '../../../camera';
import { shapeRolesOf } from '../../../mask/create_mask';
import { maskLevelFor, masksNow, noteShape } from '../../../mask/mask_walk';
import type { TMask } from '../../../mask/types/t_mask';
import type { TMaskLevel, TMaskWalk } from '../../../mask/mask_walk';

/**
 * A placement to put children inside, or `null` for "nothing above has moved anything".
 *
 * Two shapes of the same answer, because the two halves of the engine ask different questions of
 * it: a sprite wants where and how turned, in the plane, and a model wants a matrix, because a turn
 * in three dimensions cannot be said with one angle. Both are worked out for a box that has a
 * placement, which is few boxes, rather than per drawable, which is many.
 */
type TWorld = { flat: TTransform2d; matrix: Float32Array } | null;

/**
 * One placement per level of the tree, kept between frames.
 *
 * The walk is depth first, so only one box per level is ever being looked at, and none of these
 * escapes the walk: what a drawable keeps is its own matrix, written into, never one of these.
 */
const levels: Array<{ flat: TTransform2d; matrix: Float32Array }> = [];

/**
 * Where a box's or a drawable's own placement is built before it is put inside its parent's.
 */
const localScratch = mat.create();

/**
 * The placement a box passes down: its own, put inside whatever its parent passed down.
 *
 * A fresh object per box that has one, which is as often as a box is a place rather than a list.
 * Boxes that only group things pass their parent's straight through and allocate nothing.
 */
const worldOfBox = (parent: TWorld, box: TBox, depth: number): TWorld => {
    if (box.transform === null) {
        return parent;
    }

    // The one kept for this level of the tree. Safe because the walk is depth first and never hands
    // one of these outward: by the time a sibling asks for this level again, everything under the
    // last one has already been placed.
    while (levels.length <= depth) {
        levels.push({ flat: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, matrix: mat.create() });
    }
    const here = levels[depth];

    if (parent === null) {
        computeModelMatrix(box.transform, here.matrix);
        // Copied rather than pointed at. Pointing at the box's own placement would put an object
        // the game owns where this walk writes, and the next box at this level would compose into
        // it: an author's transform silently overwritten by the frame that was reading it.
        here.flat.x = box.transform.x;
        here.flat.y = box.transform.y;
        here.flat.rotation = box.transform.rotation;
        here.flat.scaleX = box.transform.scaleX;
        here.flat.scaleY = box.transform.scaleY;
        return here;
    }

    computeModelMatrix(box.transform, localScratch);
    mat.multiply(parent.matrix, localScratch, here.matrix);
    here.flat = composeTransform2d(parent.flat, box.transform, here.flat);
    return here;
};

/**
 * Writes where a drawable ends up, or takes that answer away again when nothing moves it any more.
 *
 * The answer is kept on the drawable and rewritten in place, so a scene that never moves a box pays
 * one comparison per drawable and a scene that does pays no memory after its first frame.
 */
const placeDrawable = (drawable: TDrawable, world: TWorld): void => {
    // An emitter in depth, and a set of lines, are placed like a model: a turn in three dimensions
    // is only a matrix.
    if (drawable.type === 'mesh' || drawable.type === 'particles-3d' || drawable.type === 'lines') {
        if (world === null) {
            // Cleared rather than left behind, for the reason below.
            drawable.worldMatrix = undefined;
            return;
        }
        // Written into the one it already has, which is what the line above this function has
        // always claimed and what it now does: a scene that moves a box used to leave two matrices
        // behind per model per frame, and a collection pause reads as a stutter rather than as
        // slowness.
        const into = drawable.worldMatrix ?? mat.create();
        computeModelMatrix(drawable.transform, localScratch);
        mat.multiply(world.matrix, localScratch, into);
        drawable.worldMatrix = into;
        return;
    }

    if (world === null) {
        // Cleared rather than left behind: a box whose placement goes away, or a drawable handed to
        // another box, would otherwise keep being drawn where it used to be.
        if (drawable.worldTransform !== undefined) {
            drawable.worldTransform = undefined;
        }
        return;
    }
    const out = drawable.worldTransform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    drawable.worldTransform = composeTransform2d(world.flat, drawable.transform, out);
};

/**
 * Where each collider was placed last frame, written over rather than made again.
 */
/**
 * Moves a flat drawable by its parallax: by the part of the camera's travel it does not follow, so on
 * screen it goes by more slowly. Written into where it is drawn and touched, never into its placement.
 */
const applyParallax = (drawable: TDrawable, factor: { x: number; y: number }, camera: TCamera2d): void => {
    if (drawable.type === 'mesh' || drawable.type === 'particles-3d' || drawable.type === 'lines' || drawable.type === 'particles') {
        return;
    }
    const base = drawable.worldTransform ?? drawable.transform;
    const out = drawable.worldTransform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    // On whole pixels, as the layers of the old consoles scrolled: a layer moving at another pace from
    // the camera would otherwise sit between two pixels and shimmer.
    out.x = base.x + Math.round(camera.transform.x * (1 - factor.x));
    out.y = base.y + Math.round(camera.transform.y * (1 - factor.y));
    out.rotation = base.rotation;
    out.scaleX = base.scaleX;
    out.scaleY = base.scaleY;
    drawable.worldTransform = out;
};

/**
 * Where a flat drawable that has no frame of its own above it is drawn on whole pixels: kept per
 * drawable, so rounding allocates nothing frame after frame.
 */
const snappedPlaces = new WeakMap<object, TTransform2d>();

/**
 * Puts a flat drawable on whole pixels of the game where it is drawn: the game's `pixelSnap`. Where it
 * is stays as it was, fractions and all, so it moves as fast as it says; only the picture lands on the
 * grid, as the consoles drew it. With the camera on whole pixels too, something it follows stays on
 * the same pixel of the screen.
 */
const snapToPixels = (drawable: TDrawable): void => {
    if (drawable.type !== 'sprite' && drawable.type !== 'text' && drawable.type !== 'nine-slice' && drawable.type !== 'tilemap' && drawable.type !== 'polygon') {
        return;
    }
    const base = drawable.worldTransform ?? drawable.transform;
    let out = drawable.worldTransform;
    if (out === undefined) {
        out = snappedPlaces.get(drawable) ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
        snappedPlaces.set(drawable, out);
    }
    out.x = Math.round(base.x);
    out.y = Math.round(base.y);
    out.rotation = base.rotation;
    out.scaleX = base.scaleX;
    out.scaleY = base.scaleY;
    drawable.worldTransform = out;
};

const placedFlat = new WeakMap<object, TPlacedCollider2d>();
const placedDeep = new WeakMap<object, TPlacedCollider3d>();

/**
 * What a box with no placement anywhere above it is placed by: nothing moved, turned or stretched.
 */
const NOWHERE_FLAT = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const NOWHERE_DEEP = mat.create();

/**
 * Notes where this box's particle collider is this frame, from the placement the walk has just
 * worked out for the box. Here and not in a second walk, because this is the one place that already
 * knows it.
 */
const placeCollider = (box: TBox, world: TWorld, colliders: TSceneColliders): void => {
    const collider = box.particleCollider;
    if (collider === null) {
        return;
    }
    if (collider.type === 'particle-collider-2d') {
        const placed = placeCollider2d(collider, world?.flat ?? NOWHERE_FLAT, placedFlat.get(collider));
        placedFlat.set(collider, placed);
        colliders.flat.push(placed);
    } else {
        const placed = placeCollider3d(collider, world?.matrix ?? NOWHERE_DEEP, placedDeep.get(collider));
        placedDeep.set(collider, placed);
        colliders.deep.push(placed);
    }
};

/**
 * @param cameraIndex Filled alongside `out`, one entry per drawable: which camera draws it, `-1`
 * for screen pixels.
 * @param sceneCamera The index of the scene's camera, or `-1` if the scene has none.
 * @param onScreen Whether a box above this one asked for screen space. Inherited: once a HUD is
 * marked, nothing under it can end up back in the world.
 * @param parent Where everything above this box has put it, or `null` if nothing above it has a
 * placement of its own.
 * @param colliders Where to note each particle collider found on the way, or `null` to skip them.
 * @param pictures Where to note each box below this one that is drawn into a picture, or `null` to
 * skip them. The walk stops at such a box: what is under it belongs to the picture, not to this view.
 * @param screenCamera The index of the camera what is pinned to the screen is drawn through, or `-1`
 * for screen pixels, which is what a game always has (see `TRuntimeState.viewport.screen2d`).
 * @param masks Where to note each drawable's innermost mask and each mask's shape, or `null` when no
 * object anywhere is masked, which is most games: they pay nothing for masks.
 * @param level The innermost mask of the boxes above this one, or `null`.
 * @param shapeOf The masks a box above this one is the shape of, or `null`. What a shape draws is
 * noted as the shape, and drawn only when one of them says `showShape`.
 *
 * Hidden boxes and hidden drawables are left out here, so nothing further down the frame has to ask
 * again: what comes out is what is drawn. Each drawable is also placed as it is collected, since
 * this walk is the only place that still knows the tree.
 */
export const collectDrawables = (
    box: TBox,
    out: TDrawable[],
    cameraIndex: number[],
    sceneCamera: number,
    onScreen = false,
    parent: TWorld = null,
    depth = 0,
    colliders: TSceneColliders | null = null,
    pictures: TBox[] | null = null,
    screenCamera = -1,
    camera: TCamera2d | null = null,
    inherited: { x: number; y: number } | null = null,
    snap = false,
    masks: TMaskWalk | null = null,
    level: TMaskLevel | null = null,
    shapeOf: readonly TMask[] | null = null,
): void => {
    // Before the check for hidden, because a hidden screen is a screen switched off: its picture is
    // still drawn, with nothing in it. The top of the walk is the picture's own, and is not stopped.
    if (depth > 0 && box.spriteTexture !== null) {
        pictures?.push(box);
        return;
    }

    // A hidden box takes everything beneath it, which is the whole reason visibility is a thing a
    // box has: the walk simply stops here. Resolved on the way down rather than stamped on each
    // drawable because this is the only place that still knows the tree.
    if (!box.visible) {
        return;
    }

    const pinned = onScreen || box.screenSpace;
    const view = pinned ? screenCamera : sceneCamera;
    const world = worldOfBox(parent, box, depth);
    if (colliders !== null) {
        placeCollider(box, world, colliders);
    }
    // A mask on this box keeps everything below it, inside the masks above. Where the box is now is
    // what its rectangle is measured from.
    let here = level;
    let shapes = shapeOf;
    if (masks !== null) {
        if (masksNow(box.mask)) {
            here = maskLevelFor(box, box.mask, level, view, world?.flat ?? NOWHERE_FLAT);
        }
        const roles = shapeRolesOf(box);
        if (roles !== undefined) {
            shapes = shapes === null ? roles : [...shapes, ...roles];
        }
    }
    const shown = shapes === null || shapes.some((mask) => mask.showShape);
    // What is pinned to the screen does not see the camera, so it has no parallax either.
    const parallax = pinned ? null : box.parallax ?? inherited;
    for (const drawable of box.drawables) {
        placeDrawable(drawable, world);
        const factor = pinned ? null : (drawable as { parallax?: { x: number; y: number } }).parallax ?? parallax;
        if (factor !== null && camera !== null) {
            applyParallax(drawable, factor, camera);
        }
        if (snap) {
            snapToPixels(drawable);
        }
        // `undefined` is drawn: a drawable that never mentions it is the ordinary case, and the
        // ordinary case should not have to say anything.
        if (drawable.visible === false) {
            continue;
        }
        if (shapes !== null) {
            noteShape(masks!, shapes, drawable, view);
            if (!shown) {
                continue;
            }
        }
        out.push(drawable);
        cameraIndex.push(view);
        masks?.levels.push(here);
    }
    for (const child of box.children) {
        collectDrawables(child, out, cameraIndex, sceneCamera, pinned, world, depth + 1, colliders, pictures, screenCamera, camera, parallax, snap, masks, here, shapes);
    }
};

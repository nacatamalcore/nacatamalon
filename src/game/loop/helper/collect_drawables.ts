import * as mat from '../../../math/mat4';
import { composeTransform2d } from '../../../render/shared/compose_transform_2d';
import { computeModelMatrix } from '../../../render/shared/compute_mvp_3d';
import { placeCollider2d, placeCollider3d } from '../../../gameobjects/particles/collide';
import type { TBox } from '../../../box';
import type { TPlacedCollider2d, TPlacedCollider3d, TSceneColliders } from '../../../gameobjects/particles/collide';
import type { TDrawable } from '../../../gameobjects/types';
import type { TTransform2d } from '../../../gameobjects/types/t_transform_2d';
import type { TCamera2d } from '../../../camera';
import { cameraAsDrawn, onPixels, pixelsPerUnit } from '../../../camera/camera_as_drawn';
import type { TSight } from '../../../render/shared/sight_2d';
import { pivotPlace } from '../../../render/shared/pivot_place';
import { layoutOfText } from '../../../layout/measure_text';
import { spriteHeight, spriteWidth } from '../../../render/shared/sprite_size';
import { keepTextLayout, noteTextBlock } from '../../../gameobjects/text/expand_text';
import type { TSprite } from '../../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../../gameobjects/nine_slice/types/t_nine_slice';
import type { TPixelSnap } from '../../types/t_game_options';
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
 * Writes where a drawable ends up. A flat one has the answer taken away again when nothing moves it
 * any more; a model, an emitter in depth or a set of lines always has one, its own placement when
 * nothing above moves it.
 *
 * The answer is kept on the drawable and rewritten in place, so a scene that never moves a box pays
 * one comparison per drawable and a scene that does pays no memory after its first frame.
 */
const placeDrawable = (drawable: TDrawable, world: TWorld): void => {
    // An emitter in depth, and a set of lines, are placed like a model: a turn in three dimensions
    // is only a matrix.
    if (drawable.type === 'mesh' || drawable.type === 'particles-3d' || drawable.type === 'lines') {
        // Written into the one it already has, which is what the line above this function has
        // always claimed and what it now does: a scene that moves a box used to leave two matrices
        // behind per model per frame, and a collection pause reads as a stutter rather than as
        // slowness.
        const into = drawable.worldMatrix ?? mat.create();
        if (world === null) {
            // Its own placement, and written all the same: a game reads this to know where a model
            // is, and the renderer would work it out from the placement anyway. Nothing above it
            // moves it, so it is never left behind where it used to be.
            computeModelMatrix(drawable.transform, into);
        } else {
            computeModelMatrix(drawable.transform, localScratch);
            mat.multiply(world.matrix, localScratch, into);
        }
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
 * Where a flat drawable that has no frame of its own above it is drawn, moved by its parallax or put
 * on whole pixels: kept per drawable, so neither allocates anything frame after frame.
 */
const keptPlaces = new WeakMap<object, TTransform2d>();

const keptPlace = (drawable: TDrawable): TTransform2d => {
    let place = keptPlaces.get(drawable);
    if (place === undefined) {
        place = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
        keptPlaces.set(drawable, place);
    }
    return place;
};

/**
 * Moves a flat drawable by its parallax: by the part of the camera's travel it does not follow, so on
 * screen it goes by more slowly. Written into where it is drawn and touched, never into its placement.
 *
 * @param snap The game's `pixelSnap`, which decides where the camera is drawn from and the pixels
 * the layer's own travel is put on.
 */
const applyParallax = (drawable: TDrawable, factor: { x: number; y: number }, camera: TCamera2d, snap: TPixelSnap): void => {
    if (drawable.type === 'mesh' || drawable.type === 'particles-3d' || drawable.type === 'lines' || drawable.type === 'particles') {
        return;
    }
    const base = drawable.worldTransform ?? drawable.transform;
    // A layer loose in the scene has no place of its own drawn each frame: it is given the one kept for
    // it, rather than a new one every frame for the collector to pick up.
    const out = drawable.worldTransform ?? keptPlace(drawable);
    // On screen the layer is left behind by its share of the camera's travel, and that share is what
    // is put on pixels: once, so it only ever steps one way. Placed against the camera as it is
    // drawn: rounding the layer's offset and the camera each on its own left their difference
    // stepping back and forth, a cloud going a pixel on and one back as the two roundings took turns.
    // On the screen's pixels a far layer at a tenth of the camera moves a screen pixel at a time
    // rather than a whole pixel of the art, which at zoom 3 was a jump of three every forty frames.
    const seen = cameraAsDrawn(camera, snap)!;
    const perUnit = pixelsPerUnit(snap, camera);
    const shareX = -camera.transform.x * factor.x;
    const shareY = -camera.transform.y * factor.y;
    out.x = base.x + seen.transform.x + (perUnit === 0 ? shareX : onPixels(shareX, perUnit));
    out.y = base.y + seen.transform.y + (perUnit === 0 ? shareY : onPixels(shareY, perUnit));
    out.rotation = base.rotation;
    out.scaleX = base.scaleX;
    out.scaleY = base.scaleY;
    drawable.worldTransform = out;
};


const MIDDLE = { x: 0.5, y: 0.5 };
const TOP_LEFT = { x: 0, y: 0 };

/** Where the pivot puts a picture, written over picture by picture. */
const pivotScratch: TTransform2d = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/** How far the corner is from the place, written over picture by picture: a frame allocates nothing. */
const offset = { x: 0, y: 0 };

/**
 * How far its top-left corner is drawn from where it is placed, into `offset`, for a picture held by
 * something other than that corner: a sprite or a panel by its middle, a text by the anchor it was
 * given. `false` when it is held by the corner, which is already on pixels with the place.
 */
const cornerOffset = (drawable: TSprite | TText | TNineSlice, base: TTransform2d): boolean => {
    const anchor = drawable.anchor ?? (drawable.type === 'text' ? TOP_LEFT : MIDDLE);
    const held = drawable.pivot ?? anchor;
    if (anchor.x === 0 && anchor.y === 0 && held.x === 0 && held.y === 0) {
        return false;
    }
    let width: number;
    let height: number;
    if (drawable.type === 'sprite') {
        width = spriteWidth(drawable);
        height = spriteHeight(drawable);
    } else if (drawable.type === 'nine-slice') {
        width = drawable.width;
        height = drawable.height;
    } else {
        const layout = layoutOfText(drawable);
        // Drawing it this frame takes this layout rather than working it out again. Not one of a
        // font still on its way: that is measured with the letters the engine carries, and drawn
        // with none.
        if (drawable.font.type === 'font' || drawable.font.meta !== null) {
            keepTextLayout(drawable, layout);
        }
        width = layout.width;
        height = layout.height;
    }
    if (held === anchor) {
        offset.x = anchor.x * width * base.scaleX;
        offset.y = anchor.y * height * base.scaleY;
        return true;
    }
    // Drawn from where its pivot puts it, by the point it is held by.
    const place = pivotPlace(base, drawable, anchor, width, height, pivotScratch);
    offset.x = base.x - (place.x - held.x * width * place.scaleX);
    offset.y = base.y - (place.y - held.y * height * place.scaleY);
    return true;
};

/**
 * Whether a flat drawable puts anything inside what a camera shows (`sightOf`): its picture where it
 * is drawn, held by its anchor, turned about its pivot and grown, as the renderer and the pointer
 * place it. What is not a sprite, a text or a panel is always kept: a map, a shape, particles and
 * everything in depth are judged elsewhere, or not at all.
 *
 * A text is measured as it is laid out this frame, the layout its drawing takes, and kept within its
 * own height of the camera: a letter can reach a little past the block it is laid out in, the soft
 * edge of a distance-field one most of all.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const inSight = (drawable: TDrawable, sight: TSight): boolean => {
    if (drawable.type !== 'sprite' && drawable.type !== 'text' && drawable.type !== 'nine-slice') {
        return true;
    }
    let width: number;
    let height: number;
    let pad = 0;
    if (drawable.type === 'sprite') {
        width = spriteWidth(drawable);
        height = spriteHeight(drawable);
    } else if (drawable.type === 'nine-slice') {
        width = drawable.width;
        height = drawable.height;
    } else {
        const layout = layoutOfText(drawable);
        if (drawable.font.type === 'font' || drawable.font.meta !== null) {
            keepTextLayout(drawable, layout);
        }
        // Noted here as well as when it is drawn: one left out is never drawn, and its hitbox and
        // the pointer still read how big it is.
        noteTextBlock(drawable, layout);
        width = layout.width;
        height = layout.height;
        pad = height;
    }
    const base = drawable.worldTransform ?? drawable.transform;
    const anchor = drawable.anchor ?? (drawable.type === 'text' ? TOP_LEFT : MIDDLE);
    const held = drawable.pivot ?? anchor;
    const place = pivotPlace(base, drawable, anchor, width, height, pivotScratch);
    // The picture spans `(0 to 1 - held) * size * scale` from its place, turned with it: its middle,
    // and how far it reaches from there along the world's two axes.
    const sx = width * place.scaleX;
    const sy = height * place.scaleY;
    const c = place.rotation === 0 ? 1 : Math.cos(place.rotation);
    const s = place.rotation === 0 ? 0 : Math.sin(place.rotation);
    const mx = (0.5 - held.x) * sx;
    const my = (0.5 - held.y) * sy;
    const cx = place.x + mx * c - my * s;
    const cy = place.y + mx * s + my * c;
    const hx = (Math.abs(sx * c) + Math.abs(sy * s)) / 2 + pad;
    const hy = (Math.abs(sx * s) + Math.abs(sy * c)) / 2 + pad;
    return cx + hx >= sight.minX && cx - hx <= sight.maxX && cy + hy >= sight.minY && cy - hy <= sight.maxY;
};

/**
 * How far back a corner goes when it falls exactly between two pixels of the grid of
 * `pixelsPerUnit`: to the one before. Left to the graphics card, that tie went either way, so the
 * same sprite came out a column apart in WebGPU and in WebGL2, or with a column twice and its last
 * one gone; the one before is what WebGPU draws when it gets it right. Anywhere else the corner is
 * left where it was: a sprite growing by a fraction would have its far edge step back a pixel now
 * and then if its corner were pulled to the nearest one.
 */
const backFromTie = (corner: number, perUnit: number): number => {
    const across = corner * perUnit;
    return Math.abs(across - Math.floor(across) - 0.5) < 1e-4 ? 0.5 / perUnit : 0;
};

const TURN = Math.PI * 2;

/**
 * Not turned: at 0, or a whole turn round, where a spin that has gone round once stops.
 */
const unturned = (rotation: number): boolean => {
    if (rotation === 0) {
        return true;
    }
    const left = Math.abs(rotation % TURN);
    return left < 1e-9 || TURN - left < 1e-9;
};

/**
 * Puts a flat drawable on pixels where it is drawn: the game's `pixelSnap`, through `pixelsPerUnit`.
 * Where it is stays as it was, fractions and all, so it moves as fast as it says; only the picture
 * lands on the grid. With the camera on the same pixels, something it follows stays on the same
 * pixel of the screen.
 *
 * An edge that the place leaves exactly between two pixels goes back to the one before: a sprite 5
 * wide held by its middle on a whole pixel has its edges on halves, and is drawn half a pixel back.
 * Turned, its edges are on no grid, and only its place is rounded.
 */
const snapToPixels = (drawable: TDrawable, perUnit: number): void => {
    if (drawable.type !== 'sprite' && drawable.type !== 'text' && drawable.type !== 'nine-slice' && drawable.type !== 'tilemap' && drawable.type !== 'polygon') {
        return;
    }
    const base = drawable.worldTransform ?? drawable.transform;
    const out = drawable.worldTransform ?? keptPlace(drawable);
    const byCorner = (drawable.type === 'sprite' || drawable.type === 'text' || drawable.type === 'nine-slice')
        && unturned(base.rotation) && cornerOffset(drawable, base);
    const x = onPixels(base.x, perUnit);
    const y = onPixels(base.y, perUnit);
    out.x = byCorner ? x - backFromTie(x - offset.x, perUnit) : x;
    out.y = byCorner ? y - backFromTie(y - offset.y, perUnit) : y;
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
    snap: TPixelSnap = 'off',
    masks: TMaskWalk | null = null,
    level: TMaskLevel | null = null,
    shapeOf: readonly TMask[] | null = null,
    sights: { readonly scene: TSight; readonly pinned: TSight } | null = null,
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
            here = maskLevelFor(masks, box, box.mask, level, view, world?.flat ?? NOWHERE_FLAT);
        }
        const roles = shapeRolesOf(box);
        if (roles !== undefined) {
            shapes = shapes === null ? roles : [...shapes, ...roles];
        }
    }
    const shown = shapes === null || shapes.some((mask) => mask.showShape);
    const sight = sights === null ? null : pinned ? sights.pinned : sights.scene;
    // What is pinned to the screen does not see the camera, so it has no parallax either.
    const parallax = pinned ? null : box.parallax ?? inherited;
    // What is pinned to the screen is drawn at zoom 1, where a pixel of the screen is one of the game.
    const perUnit = pixelsPerUnit(snap, pinned ? null : camera);
    for (const drawable of box.drawables) {
        placeDrawable(drawable, world);
        const factor = pinned ? null : (drawable as { parallax?: { x: number; y: number } }).parallax ?? parallax;
        if (factor !== null && camera !== null) {
            applyParallax(drawable, factor, camera, snap);
        }
        if (perUnit > 0) {
            snapToPixels(drawable, perUnit);
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
        // Wholly outside what its camera shows: nothing after this sorts it, lays it out, counts it or
        // writes it for the card. After the shape is noted, since a mask's shape off the screen still
        // cuts what is on it.
        if (sight !== null && !inSight(drawable, sight)) {
            continue;
        }
        out.push(drawable);
        cameraIndex.push(view);
        masks?.levels.push(here);
    }
    for (const child of box.children) {
        collectDrawables(child, out, cameraIndex, sceneCamera, pinned, world, depth + 1, colliders, pictures, screenCamera, camera, parallax, snap, masks, here, shapes, sights);
    }
};

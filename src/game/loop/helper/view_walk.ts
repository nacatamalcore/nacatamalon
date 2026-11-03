import { noteStandIn, standingInFor } from '../../../box/drawable_owner';
import { MAX_CHILD_DEPTH } from '../../../loaders/particles/load_particles';
import type { TBox } from '../../../box';
import type { TDrawable } from '../../../gameobjects/types';
import type { TViewFilter } from '../../../gameobjects/sprite_texture/types';
import type { TTexture } from '../../../loaders';
import type { TParticlesFile } from '../../../loaders/particles/types/t_particles_file';

/**
 * What a walk of the world for a view (`createSpriteTexture({ sees: 'world' })`) carries: whose stand-ins
 * it fills, which picture it must not show, and what it leaves out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TViewWalk = {
    /**
     * This view's own stand-in for each drawing, kept between frames: see `standInFor`.
     */
    standIns: WeakMap<object, TDrawable>;
    /**
     * The view's picture. Whatever shows it is left out, since a picture cannot be read while it is
     * being drawn into.
     */
    own: TTexture;
    hide: TViewFilter | null;
    only: TViewFilter | null;
};

/**
 * The view being walked, or `null` for every other walk (the screen, a picture's own world, a
 * capture). Set only around one walk, by `walkingView`.
 */
let walking: TViewWalk | null = null;

/**
 * The view whose walk is under way, or `null`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const viewWalk = (): TViewWalk | null => walking;

/**
 * Runs `walk` as the walk of a view, and puts things back after, whatever happens in it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const walkingView = <T>(view: TViewWalk, walk: () => T): T => {
    walking = view;
    try {
        return walk();
    } finally {
        walking = null;
    }
};

/**
 * The picture whose own part is being gathered, or `null`: what is made inside a picture's component
 * is drawn into it, and what of that shows the picture itself (as its sheet, or as a map of its
 * material) is left out, as a view leaves it out of the world it walks. A card cannot read a picture
 * in the pass that draws into it: WebGPU throws the whole pass away, and WebGL2 reads what it is
 * halfway through writing.
 */
let drawingInto: TTexture | null = null;

/**
 * The picture whose own part is being gathered, or `null`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pictureBeingDrawn = (): TTexture | null => drawingInto;

/**
 * Runs `gather` as the gathering of what is drawn into `picture`, and puts things back after,
 * whatever happens in it. A picture inside another is gathered on its own, so the one before is
 * what comes back.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawingPicture = <T>(picture: TTexture, gather: () => T): T => {
    const before = drawingInto;
    drawingInto = picture;
    try {
        return gather();
    } finally {
        drawingInto = before;
    }
};

/**
 * The drawings whose place on the picture depends on the camera looking at them: put on its pixels,
 * moved by parallax, and, for a text or a panel, laid out into pieces that hold that place. What is
 * in depth and what emits is placed the same through any camera.
 */
const PLACED_BY_CAMERA: ReadonlySet<string> = new Set(['sprite', 'text', 'nine-slice', 'tilemap', 'polygon']);

/**
 * The drawing a stand-in stands in for, or the drawing itself.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const recordOf = <T extends object>(drawable: T): T => (standingInFor(drawable) as T | undefined) ?? drawable;

/**
 * What a view draws for `record`: the drawing itself when its place does not depend on the camera,
 * otherwise this view's own copy of it.
 *
 * A drawing keeps where it is drawn on itself (`worldTransform`), and every pass of a frame draws the
 * same drawings once the frame is filled in. A view looking through another camera would write its
 * own place over the screen's, and the screen would be drawn from the view. So a view draws a copy,
 * refreshed from the drawing every frame and kept for the next one: the game's drawing is never
 * written to, and nothing is made frame after frame. Its place is its own, kept between frames like
 * the drawing's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const standInFor = (view: TViewWalk, record: TDrawable): TDrawable => {
    if (!PLACED_BY_CAMERA.has(record.type)) {
        return record;
    }
    let standIn = view.standIns.get(record);
    if (standIn === undefined) {
        standIn = {} as TDrawable;
        view.standIns.set(record, standIn);
        noteStandIn(standIn, record);
    }
    const place = (standIn as { worldTransform?: unknown }).worldTransform;
    // What the drawing no longer has (a field a motion preview put back as it was, absent), the copy
    // must not keep either.
    for (const key in standIn) {
        if (key !== 'worldTransform' && !(key in record)) {
            delete (standIn as Record<string, unknown>)[key];
        }
    }
    Object.assign(standIn, record);
    (standIn as { worldTransform?: unknown }).worldTransform = place;
    return standIn;
};

/**
 * Whether a filter names `record`, by itself, its kind or a tag of its own, or `box` and the boxes
 * above it, by themselves or by a tag.
 */
const names = (filter: TViewFilter, record: TDrawable, box: TBox): boolean => {
    if (filter.kinds?.includes(record.type) === true || filter.objects?.includes(record) === true) {
        return true;
    }
    // A sprite, a text or a panel carries tags of its own (`useTag(...).add(sprite)`).
    const own = (record as { tags?: string[] }).tags;
    if (filter.tags !== undefined && own !== undefined && own.some((tag) => filter.tags!.includes(tag))) {
        return true;
    }
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        if (filter.objects?.includes(at) === true) {
            return true;
        }
        if (filter.tags !== undefined && at.tags.some((tag) => filter.tags!.includes(tag))) {
            return true;
        }
    }
    return false;
};

/**
 * Whether a view takes `record` in, found on `box`: not left out by its `hide`, and, when it has an
 * `only`, named by it. `hide` wins wherever the two meet.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const viewKeeps = (view: TViewWalk, record: TDrawable, box: TBox): boolean => {
    if (view.hide !== null && names(view.hide, record, box)) {
        return false;
    }
    return view.only === null || names(view.only, record, box);
};

/**
 * Whether an effect's particles wear `texture`: its sheet's picture, or its own, or that of an effect
 * its file says they set off. Asked of the file and not of the children a running emitter has: one
 * that has not run yet has none, and would set them off on the very frame it is drawn.
 *
 * No deeper than particles can reach (`MAX_CHILD_DEPTH`), the same limit the simulation has, so this
 * ends even if files ever lead back to one another.
 */
const wears = (file: TParticlesFile, texture: TTexture, depth = 0): boolean =>
    (file.atlas?.texture ?? file.texture) === texture
    || (depth < MAX_CHILD_DEPTH && file.children.some((child) => child !== null && wears(child, texture, depth + 1)));

/**
 * An effect's particles as the frame lays them out: their picture, and the effects they set off.
 */
type TDrawnParticles = { texture: unknown; children?: readonly TDrawnParticles[] };

/**
 * Whether particles laid out to be drawn, or the ones they set off, wear `texture`.
 */
const drawnParticlesShow = (drawn: TDrawnParticles, texture: TTexture): boolean =>
    drawn.texture === texture || (drawn.children ?? []).some((child) => drawnParticlesShow(child, texture));

/**
 * Whether one of a material's maps is `texture`.
 */
const mapsShow = (maps: Readonly<Record<string, { texture: unknown }>> | undefined, texture: TTexture): boolean => {
    for (const name in maps ?? {}) {
        if (maps![name]!.texture === texture) {
            return true;
        }
    }
    return false;
};

/**
 * Whether a drawing shows `texture`: as its picture, a model's glow, occlusion or map, a map of the
 * material over a sprite, a text, a panel or a map's layer, or what an effect's particles, or the
 * ones they set off, wear.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const showsPicture = (drawable: TDrawable, texture: TTexture): boolean => {
    switch (drawable.type) {
        case 'sprite':
        case 'nine-slice':
        case 'tilemap':
            return drawable.texture === texture || mapsShow(drawable.material?.maps, texture);
        case 'polygon':
            return drawable.texture === texture;
        // Its letters' sheet is a font's, never a picture drawn into; its material's maps may be.
        case 'text':
            return mapsShow(drawable.material?.maps, texture);
        case 'mesh': {
            const material = drawable.material;
            if (material.texture === texture || material.emissiveTexture === texture || material.occlusion?.texture === texture) {
                return true;
            }
            return mapsShow(material.maps, texture);
        }
        case 'particles':
        case 'particles-3d':
            // An emitter, or what it is drawn as once the frame has laid it out: a picture of a world
            // in 3D is handed the world's models that way, and those carry their picture themselves.
            if (!('file' in drawable)) {
                return drawnParticlesShow(drawable as unknown as TDrawnParticles, texture);
            }
            return wears(drawable.file, texture);
        default:
            return false;
    }
};

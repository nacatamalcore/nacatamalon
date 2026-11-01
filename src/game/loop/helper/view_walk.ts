import { noteStandIn, standingInFor } from '../../../box/drawable_owner';
import { particleStateOf } from '../../../gameobjects/particles/particle_state';
import type { TBox } from '../../../box';
import type { TDrawable } from '../../../gameobjects/types';
import type { TViewFilter } from '../../../gameobjects/sprite_texture/types';
import type { TTexture } from '../../../loaders';
import type { TParticlesFile } from '../../../loaders/particles/types/t_particles_file';
import type { TChildParticles } from '../../../gameobjects/particles/types/t_particle_pool';

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
 * Whether an effect's particles wear `texture`: its sheet's picture, or its own.
 */
const wears = (file: TParticlesFile, texture: TTexture): boolean => (file.atlas?.texture ?? file.texture) === texture;

/**
 * Whether any effect an emitter's particles set off, or one those set off in turn, wears `texture`.
 */
const childrenShow = (children: readonly TChildParticles[], texture: TTexture): boolean =>
    children.some((child) => wears(child.file, texture) || childrenShow(child.state?.children ?? [], texture));

/**
 * Whether a drawing shows `texture`: as its picture, a model's glow, occlusion or map, or what an
 * effect's particles, or the ones they set off, wear.
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
        case 'polygon':
            return drawable.texture === texture;
        case 'mesh': {
            const material = drawable.material;
            if (material.texture === texture || material.emissiveTexture === texture || material.occlusion?.texture === texture) {
                return true;
            }
            for (const name in material.maps ?? {}) {
                if (material.maps![name]!.texture === texture) {
                    return true;
                }
            }
            return false;
        }
        case 'particles':
        case 'particles-3d':
            return wears(drawable.file, texture) || childrenShow(particleStateOf(drawable)?.children ?? [], texture);
        default:
            return false;
    }
};

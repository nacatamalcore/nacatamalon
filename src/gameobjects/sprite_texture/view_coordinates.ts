import { pictureOwner } from './create_sprite_texture';
import { ownerOfDrawable } from '../../box/drawable_owner';
import { rootOf } from '../../box/root_of';
import { cameraAsDrawn } from '../../camera/camera_as_drawn';
import { screenToRay } from '../../camera/screen_to_ray';
import { quadFractionAnywhere } from '../../input/pick_targets';
import { applyView2d, unapplyView2d } from '../../render/shared/apply_view_2d';
import { pivotPlace } from '../../render/shared/pivot_place';
import { spriteRepeat } from '../../render/shared/sprite_repeat';
import { spriteHeight, spriteWidth } from '../../render/shared/sprite_size';
import { spriteUvWindow } from '../../render/shared/sprite_uv';
import { worldOf } from '../../render/shared/world_of';
import type { TBox } from '../../box';
import type { TCamera2d } from '../../camera';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TRay } from '../../camera/screen_to_ray';
import type { TPointerInfo } from '../../input/types/t_pointer';
import type { TPixelSnap } from '../../game/types/t_game_options';
import type { TSprite } from '../sprite/types/t_sprite';
import type { TDrawSprite } from '../../render/interface';

/**
 * A point given to the view's coordinates: one in the place of the sprite showing the view (the world
 * of its scene, or the game's screen pixels when the sprite is pinned to the screen), or what the
 * pointer said, from which the right one of those is taken.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TViewPointInput = { x: number; y: number } | TPointerInfo;

/**
 * Where a point on the sprite showing a view lands in the world the view sees.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TViewToWorld = {
    /**
     * The point of the world the view sees, in its 2D world.
     */
    x: number;
    y: number;
    /**
     * Whether the point is on the part of the picture the sprite shows. Outside, `x` and `y` still say
     * where it would be, as if the picture went on. A mask over the sprite is not counted: it is
     * drawing, not a shape. For a round minimap, measure from `picture` to its middle.
     */
    inside: boolean;
    /**
     * The same point in the picture's pixels, from its top-left corner.
     */
    picture: { x: number; y: number };
};

/**
 * Where a point of the world a view sees lands on the sprite showing it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWorldToView = {
    /**
     * Where it lands, in the sprite's place: the world of its scene, or the screen's pixels for a
     * sprite pinned to the screen. Off the sprite too.
     */
    x: number;
    y: number;
    /**
     * Whether it is on the part of the picture the sprite shows.
     */
    inside: boolean;
    /**
     * The point of the sprite's edge in the direction of the point, seen from the sprite's middle: the
     * point itself when it is inside. Where an arrow at the edge of a minimap goes.
     */
    edge: { x: number; y: number };
};

/**
 * The ray of the view's 3D camera through a point on the sprite showing it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TViewRay = TRay & {
    /**
     * Whether the point is on the part of the picture the sprite shows.
     */
    inside: boolean;
};

const CENTRE = { x: 0.5, y: 0.5 };

/** Where a picture with a pivot is measured from, written over call by call. */
const pivoted = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * What the coordinates need of a sprite showing a picture: the picture's object, and how the sprite
 * is placed and laid over the picture.
 */
const viewOf = (sprite: TSprite, who: string) => {
    const box = sprite.texture === null ? null : pictureOwner(sprite.texture);
    if (box === null || box.spriteTexture === null) {
        throw new Error(`[NacatamalOn] ${who}: this sprite does not show a picture made with createSpriteTexture. Give it the sprite that shows the view.`);
    }
    const owner = ownerOfDrawable(sprite);
    const snap: TPixelSnap = owner?.store.get('config').pixelSnap ?? 'off';
    const width = spriteWidth(sprite as TDrawSprite);
    const height = spriteHeight(sprite as TDrawSprite);
    const anchor = sprite.anchor ?? CENTRE;
    const place = { ...pivotPlace(worldOf(sprite), sprite, anchor, width, height, pivoted) };
    return { box, owner, snap, width, height, held: sprite.pivot ?? anchor, place };
};

/**
 * Whether `box`, or one above it, is pinned to the screen.
 */
const pinned = (box: TBox | undefined): boolean => {
    for (let at: TBox | null = box ?? null; at !== null; at = at.parent) {
        if (at.screenSpace) {
            return true;
        }
    }
    return false;
};

/**
 * The point in the sprite's place: as given, or from the pointer, its screen pixels for a sprite
 * pinned to the screen and the world through the sprite's own scene's camera otherwise.
 */
const pointIn = (point: TViewPointInput, owner: { box: TBox } | undefined, snap: TPixelSnap): { x: number; y: number } => {
    if (!('screenX' in point)) {
        return point;
    }
    const screen = { x: point.screenX, y: point.screenY };
    if (owner === undefined || pinned(owner.box)) {
        return screen;
    }
    return unapplyView2d(cameraAsDrawn(rootOf(owner.box).camera2d, snap), screen);
};

/**
 * The view's 2D camera as it is drawn: its own, or for a view of the world the scene's when it asked
 * for none.
 */
const flatCameraOf = (box: TBox, snap: TPixelSnap): TCamera2d | null => {
    const camera = box.camera2d ?? (box.spriteTexture?.sees === 'world' ? rootOf(box).camera2d : null);
    return cameraAsDrawn(camera, snap);
};

/**
 * Where across the picture's texture, 0 to 1, a point across and down the sprite falls: through the
 * sprite's frame of it, mirrored, and wrapped round for a sprite that repeats it, as the shader reads it.
 */
const textureAt = (sprite: TSprite, u: number, v: number): { x: number; y: number } => {
    const window = spriteUvWindow(sprite as TDrawSprite);
    const repeat = spriteRepeat(sprite as TDrawSprite);
    let x = (u * repeat.tilesX + repeat.shiftX) * window.scaleX + window.offsetX;
    let y = (v * repeat.tilesY + repeat.shiftY) * window.scaleY + window.offsetY;
    if (sprite.tile === true) {
        const lowX = Math.min(window.offsetX, window.offsetX + window.scaleX);
        const lowY = Math.min(window.offsetY, window.offsetY + window.scaleY);
        const sizeX = Math.abs(window.scaleX);
        const sizeY = Math.abs(window.scaleY);
        x = lowX + (((x - lowX) % sizeX) + sizeX) % sizeX;
        y = lowY + (((y - lowY) % sizeY) + sizeY) % sizeY;
    }
    return { x, y };
};

/**
 * The way back: where across and down the sprite a point of the texture is, in the first time a
 * repeating sprite lays it.
 */
const spriteAt = (sprite: TSprite, x: number, y: number): { u: number; v: number } => {
    const window = spriteUvWindow(sprite as TDrawSprite);
    const repeat = spriteRepeat(sprite as TDrawSprite);
    return {
        u: ((x - window.offsetX) / window.scaleX - repeat.shiftX) / repeat.tilesX,
        v: ((y - window.offsetY) / window.scaleY - repeat.shiftY) / repeat.tilesY,
    };
};

/**
 * Where a point across and down a quad is, in the place the quad is in: `quadFractionAnywhere` run
 * backwards.
 */
const quadPoint = (place: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }, width: number, height: number, held: { x: number; y: number }, u: number, v: number): { x: number; y: number } => {
    const localX = (u - held.x) * width * place.scaleX;
    const localY = (v - held.y) * height * place.scaleY;
    const c = Math.cos(place.rotation);
    const s = Math.sin(place.rotation);
    return { x: place.x + localX * c - localY * s, y: place.y + localX * s + localY * c };
};

const within = (u: number, v: number): boolean => u >= 0 && u <= 1 && v >= 0 && v <= 1;

/**
 * Where a point on the picture a view is shown on lands in the picture's pixels, and whether it is on it.
 */
const pictureAt = (sprite: TSprite, point: TViewPointInput, who: string) => {
    const view = viewOf(sprite, who);
    const at = pointIn(point, view.owner, view.snap);
    const fraction = quadFractionAnywhere(view.place, view.width, view.height, view.held, at.x, at.y) ?? { u: -1, v: -1 };
    const texture = textureAt(sprite, fraction.u, fraction.v);
    const picture = view.box.spriteTexture!.texture;
    return {
        view,
        inside: within(fraction.u, fraction.v),
        picture: { x: texture.x * picture.width, y: texture.y * picture.height },
    };
};

/**
 * Turns a point on the sprite that shows a view into the point of the world the view sees there:
 * clicking on a minimap to go where was clicked, aiming through a scope.
 *
 * The view is a picture from `createSpriteTexture({ sees: 'world' })` and this is the sprite showing
 * it, wherever it is and however it is placed: grown, turned, mirrored, held by any point, under
 * anything that moves it, showing a frame of the picture or repeating it. The point is in the
 * sprite's place, the world of its scene or the screen's pixels for a sprite pinned to the screen;
 * the pointer's `info` can be handed over as it is, and the right one is taken from it.
 *
 * What comes back is in the view's 2D world. A view's 3D camera sees through a point along a whole
 * line rather than at one place: `viewToRay` gives that line. On a picture that sees only a world of
 * its own (`'inside'`), the point is in that world.
 *
 * @param sprite The sprite showing the view.
 * @param point The point on it, or the pointer's `info`.
 * @returns The point of the view's world, whether it is on the picture, and where on the picture.
 *
 * @example
 * ```ts
 * declare const shown: TSprite;
 * declare const player: TSprite;
 * usePointer().onDown((info) => {
 *     const at = viewToWorld(shown, info);
 *     if (at.inside) {
 *         player.transform.x = at.x;
 *         player.transform.y = at.y;
 *     }
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const viewToWorld = (sprite: TSprite, point: TViewPointInput): TViewToWorld => {
    const { view, inside, picture } = pictureAt(sprite, point, 'viewToWorld');
    const world = unapplyView2d(flatCameraOf(view.box, view.snap), picture);
    return { x: world.x, y: world.y, inside, picture };
};

/**
 * Turns a point of the world a view sees into where it lands on the sprite showing the view: a
 * marker over the minimap, or an arrow at its edge for what is off it.
 *
 * Never empty-handed: a point the view does not take in still lands somewhere past the sprite, and
 * `edge` is where the sprite's edge is in that direction, seen from its middle.
 *
 * @param sprite The sprite showing the view.
 * @param point A point of the view's 2D world.
 * @returns Where it lands, in the sprite's place, whether that is on the picture it shows, and the
 * edge in its direction.
 *
 * @example
 * ```ts
 * declare const shown: TSprite;
 * declare const enemy: TSprite;
 * declare const arrow: TSprite;
 * useUpdate(() => {
 *     const at = worldToView(shown, enemy.transform);
 *     arrow.visible = !at.inside;
 *     arrow.transform.x = at.edge.x;
 *     arrow.transform.y = at.edge.y;
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldToView = (sprite: TSprite, point: { x: number; y: number }): TWorldToView => {
    const view = viewOf(sprite, 'worldToView');
    const picture = view.box.spriteTexture!.texture;
    const pixel = applyView2d(flatCameraOf(view.box, view.snap), point);
    const { u, v } = spriteAt(sprite, pixel.x / picture.width, pixel.y / picture.height);
    const at = quadPoint(view.place, view.width, view.height, view.held, u, v);
    const inside = within(u, v);
    if (inside) {
        return { x: at.x, y: at.y, inside, edge: { x: at.x, y: at.y } };
    }
    // From the middle towards the point, as far as the nearer of the edges it crosses.
    const du = u - 0.5;
    const dv = v - 0.5;
    const reach = Math.min(du === 0 ? Infinity : 0.5 / Math.abs(du), dv === 0 ? Infinity : 0.5 / Math.abs(dv));
    const edge = quadPoint(view.place, view.width, view.height, view.held, 0.5 + du * reach, 0.5 + dv * reach);
    return { x: at.x, y: at.y, inside, edge };
};

/**
 * The ray of a view's 3D camera through a point on the sprite showing the view: what a click on it
 * picks among the models it sees. Test it against what can be picked, or against the floor's plane,
 * as with `screenToRay`, which this is for a view.
 *
 * A view sees through its own 3D camera, or the scene's when it asked for none; one that follows the
 * 2D camera (`follow2d`) follows the view's.
 *
 * @param sprite The sprite showing the view.
 * @param point The point on it, or the pointer's `info`.
 * @returns The ray, starting on the camera's near plane, and whether the point is on the picture.
 *
 * @example
 * ```ts
 * declare const shown: TSprite;
 * usePointer().onDown((info) => {
 *     const ray = viewToRay(shown, info);
 *     if (ray.inside && ray.direction.y < 0) {
 *         const t = -ray.origin.y / ray.direction.y;
 *         const floor = { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
 *     }
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const viewToRay = (sprite: TSprite, point: TViewPointInput): TViewRay => {
    const { view, inside, picture } = pictureAt(sprite, point, 'viewToRay');
    const box = view.box;
    const camera3d: TCamera3d | null = box.camera3d ?? (box.spriteTexture!.sees === 'inside' ? null : rootOf(box).camera3d);
    const texture = box.spriteTexture!.texture;
    let seen: TCamera3d | null = camera3d;
    if (camera3d !== null && camera3d.follow2d === true && camera3d.projection === 'orthographic') {
        const flat = flatCameraOf(box, view.snap);
        seen = { ...camera3d, flat: { x: flat?.transform.x ?? 0, y: flat?.transform.y ?? 0, rotation: flat?.transform.rotation ?? 0, zoom: flat?.zoom || 1 } } as TCamera3d;
    }
    const ray = screenToRay(seen, texture.width, texture.height, picture.x, picture.y);
    return { ...ray, inside };
};

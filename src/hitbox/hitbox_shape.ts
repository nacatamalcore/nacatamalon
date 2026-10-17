import { placementInside, worldPlacementOf } from '../box/world_placement_of';
import { ownerOfDrawable } from '../box/drawable_owner';
import { spriteSize } from '../render/shared/sprite_size';
import { textBlockSize } from '../gameobjects/text/expand_text';
import { pivotPlace } from '../render/shared/pivot_place';
import type { TBox } from '../box/types/t_box';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { THitbox } from './types/t_hitbox';

/**
 * A rectangle in the world, turned: its centre, half its size along each of its own sides, and how
 * far it is turned. The one form everything that can touch is put in before two are compared.
 *
 * @internal
 */
export type TTurnedRect = { cx: number; cy: number; hx: number; hy: number; rotation: number };

/**
 * What a hitbox measures against when it has no size of its own: what the object draws.
 *
 * @internal
 */
export type TPicture = TSprite | TText | TNineSlice;

const CENTRE = { x: 0.5, y: 0.5 };
const TOP_LEFT = { x: 0, y: 0 };

/**
 * The size and anchor of a picture, the way the renderer reads them: a sprite and a panel from
 * their centre, a text from its top-left corner.
 */
const measure = (picture: TPicture): { width: number; height: number; anchor: { x: number; y: number } } => {
    if (picture.type === 'sprite') {
        return { ...spriteSize(picture), anchor: picture.anchor ?? CENTRE };
    }
    if (picture.type === 'text') {
        return { ...textBlockSize(picture), anchor: picture.anchor ?? TOP_LEFT };
    }
    return { width: picture.width, height: picture.height, anchor: picture.anchor ?? CENTRE };
};

/**
 * The first thing an object draws that has a size: a sprite, a text or a panel. The same picture
 * that says where the object is when it has no placement of its own.
 *
 * @internal
 */
export const pictureOf = (box: TBox): TPicture | null => {
    const first = box.drawables[0];
    return first !== undefined && (first.type === 'sprite' || first.type === 'text' || first.type === 'nine-slice') ? first : null;
};

/**
 * A rectangle measured in a placement's own pixels, put in the world through that placement.
 */
const turned = (place: TTransform2d, localX: number, localY: number, width: number, height: number): TTurnedRect => {
    const x = localX * place.scaleX;
    const y = localY * place.scaleY;
    const cos = Math.cos(place.rotation);
    const sin = Math.sin(place.rotation);
    return {
        cx: place.x + x * cos - y * sin,
        cy: place.y + x * sin + y * cos,
        hx: Math.abs(width * place.scaleX) / 2,
        hy: Math.abs(height * place.scaleY) / 2,
        rotation: place.rotation,
    };
};

/**
 * Where a picture is in the world, as the renderer draws it, with an offset and a size of its own
 * when a hitbox gives them.
 *
 * @internal
 */
export const pictureRect = (picture: TPicture, owner: TBox | null, offsetX = 0, offsetY = 0, width?: number, height?: number): TTurnedRect => {
    const size = measure(picture);
    // Turned about its pivot when it has one, as it is drawn: held by the pivot then.
    const place = pivotPlace(placementInside(owner, picture.transform), picture, size.anchor, size.width, size.height, {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    });
    const held = picture.pivot ?? size.anchor;
    // The anchor says which point of the picture its placement is at; its centre is this far away.
    const centreX = (0.5 - held.x) * size.width + offsetX;
    const centreY = (0.5 - held.y) * size.height + offsetY;
    return turned(place, centreX, centreY, width ?? size.width, height ?? size.height);
};

/**
 * Where a hitbox is in the world, this moment: around the object's picture, moved and resized as it
 * says, turned and grown with the object. An object that draws nothing measures from its own
 * placement, with no size but what the hitbox gives.
 *
 * @internal
 */
export const hitboxRect = (box: TBox, hitbox: THitbox): TTurnedRect => {
    const picture = pictureOf(box);
    if (picture !== null) {
        return pictureRect(picture, box, hitbox.x, hitbox.y, hitbox.width, hitbox.height);
    }
    return turned(worldPlacementOf(box), hitbox.x, hitbox.y, hitbox.width ?? 0, hitbox.height ?? 0);
};

/**
 * A picture on its own, wherever its object put it.
 *
 * @internal
 */
export const drawnRect = (picture: TPicture): TTurnedRect => pictureRect(picture, ownerOfDrawable(picture)?.box ?? null);

/**
 * Whether two turned rectangles share any area. Edges that only meet do not count, so two tiles side
 * by side, or a character standing exactly on a floor, are not touching.
 *
 * Two rectangles are apart exactly when some side of one of them separates them: along that side's
 * direction, their shadows do not cover each other. Four directions to try, two from each.
 *
 * @internal
 */
export const rectsOverlap = (a: TTurnedRect, b: TTurnedRect): boolean => {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const axes = [a.rotation, a.rotation + Math.PI / 2, b.rotation, b.rotation + Math.PI / 2];
    const ac = Math.cos(a.rotation);
    const as = Math.sin(a.rotation);
    const bc = Math.cos(b.rotation);
    const bs = Math.sin(b.rotation);
    for (const angle of axes) {
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        // Half of each shadow along this direction, and how far apart their middles are.
        const reachA = a.hx * Math.abs(ac * ux + as * uy) + a.hy * Math.abs(-as * ux + ac * uy);
        const reachB = b.hx * Math.abs(bc * ux + bs * uy) + b.hy * Math.abs(-bs * ux + bc * uy);
        if (Math.abs(dx * ux + dy * uy) >= reachA + reachB - 1e-9) {
            return false;
        }
    }
    return true;
};

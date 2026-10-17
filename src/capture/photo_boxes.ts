import { rootOf } from '../box/root_of';
import { applyView2d } from '../render/shared/apply_view_2d';
import { pictureRect } from '../hitbox/hitbox_shape';
import { rectsOf } from '../hitbox/overlaps';
import { ownerOfDrawable } from '../box/drawable_owner';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { TBox } from '../box/types/t_box';
import type { TPicture, TTurnedRect } from '../hitbox/hitbox_shape';
import type { TPixelRegion } from '../pixels';
import type { TPhotoBox } from './types/t_photo';

type TPoint = { x: number; y: number };

/** Whether a box is pinned to the screen, by itself or by a box above it: drawn in the screen's pixels. */
const pinned = (box: TBox): boolean => {
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        if (at.screenSpace) {
            return true;
        }
    }
    return false;
};

/**
 * A rectangle of a box's world as four corners on the screen, in the game's pixels: through its scene's
 * 2D camera, or as it is when the box is pinned to the screen.
 */
const onScreen = (box: TBox, rect: TTurnedRect): TPoint[] => {
    const cos = Math.cos(rect.rotation);
    const sin = Math.sin(rect.rotation);
    const camera = pinned(box) ? null : rootOf(box).camera2d;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const x = u! * rect.hx;
        const y = v! * rect.hy;
        return applyView2d(camera, { x: rect.cx + x * cos - y * sin, y: rect.cy + x * sin + y * cos });
    });
};

/**
 * The part of the screen a box covers, or a sprite, a text or a panel, in whole pixels: around
 * everything it is measured by, turned as it is drawn. `null` for one that has nothing to measure.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const boxRegion = (target: TBox | TSprite | TText | TNineSlice): TPixelRegion | null => {
    const box = 'children' in target ? target : ownerOfDrawable(target)?.box;
    if (box === undefined) {
        return null;
    }
    const corners = rectsOf(target).flatMap((rect) => onScreen(box, rect));
    if (corners.length === 0) {
        return null;
    }
    const left = Math.floor(Math.min(...corners.map((p) => p.x)));
    const top = Math.floor(Math.min(...corners.map((p) => p.y)));
    const right = Math.ceil(Math.max(...corners.map((p) => p.x)));
    const bottom = Math.ceil(Math.max(...corners.map((p) => p.y)));
    return { x: left, y: top, width: right - left, height: bottom - top };
};

/** A polygon cut down to what of it is inside a rectangle, one side of the rectangle at a time. */
const clip = (polygon: TPoint[], region: TPixelRegion): TPoint[] => {
    // How far inside each side a point is: negative outside it.
    const sides: Array<(p: TPoint) => number> = [
        (p) => p.x - region.x,
        (p) => region.x + region.width - p.x,
        (p) => p.y - region.y,
        (p) => region.y + region.height - p.y,
    ];
    let out = polygon;
    for (const inside of sides) {
        const next: TPoint[] = [];
        for (let i = 0; i < out.length; i++) {
            const a = out[i]!;
            const b = out[(i + 1) % out.length]!;
            const da = inside(a);
            const db = inside(b);
            if (da >= 0) {
                next.push(a);
            }
            if ((da >= 0) !== (db >= 0)) {
                const t = da / (da - db);
                next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            }
        }
        out = next;
        if (out.length === 0) {
            break;
        }
    }
    return out;
};

/** A polygon's area and the middle of it. */
const measure = (polygon: TPoint[]): { area: number; x: number; y: number } => {
    let twice = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const cross = a.x * b.y - b.x * a.y;
        twice += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }
    const area = Math.abs(twice) / 2;
    return twice === 0 ? { area: 0, x: polygon[0]?.x ?? 0, y: polygon[0]?.y ?? 0 } : { area, x: cx / (3 * twice), y: cy / (3 * twice) };
};

/** How much of a set of rectangles of `box` is inside `region`, and the middle of that part, on the screen. */
const inRegion = (box: TBox, rects: TTurnedRect[], region: TPixelRegion): { seen: number; x: number; y: number } | null => {
    let whole = 0;
    let inside = 0;
    let x = 0;
    let y = 0;
    for (const rect of rects) {
        const corners = onScreen(box, rect);
        whole += measure(corners).area;
        const part = measure(clip(corners, region));
        inside += part.area;
        x += part.x * part.area;
        y += part.y * part.area;
    }
    return inside > 0 && whole > 0 ? { seen: Math.min(1, inside / whole), x: x / inside, y: y / inside } : null;
};

/**
 * What came out in a photo of `region`, made `width` × `height`: every sprite, text and panel shown
 * and not left out (a box with hitboxes once, by them), with how much of it is inside and where, most
 * seen first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const boxesIn = (
    scenes: readonly TBox[],
    region: TPixelRegion,
    width: number,
    height: number,
    drawn: (box: TBox, picture: TPicture) => boolean,
): TPhotoBox[] => {
    const found: TPhotoBox[] = [];
    const scaleX = region.width > 0 ? width / region.width : 1;
    const scaleY = region.height > 0 ? height / region.height : 1;
    const add = (box: TBox, picture: TPicture, rects: TTurnedRect[]): void => {
        const part = inRegion(box, rects, region);
        if (part !== null) {
            found.push({ box, picture, name: box.name, seen: part.seen, x: (part.x - region.x) * scaleX, y: (part.y - region.y) * scaleY });
        }
    };
    const visit = (box: TBox): void => {
        if (!box.visible) {
            return;
        }
        const pictures = box.drawables.filter((d): d is TPicture => (d.type === 'sprite' || d.type === 'text' || d.type === 'nine-slice') && d.visible !== false);
        const enabled = box.hitboxes.filter((hitbox) => hitbox.enabled);
        if (box.hitboxes.length > 0) {
            // What it is to be hit is what it is to be photographed: once, by its hitboxes.
            const picture = pictures[0];
            if (picture !== undefined && enabled.length > 0 && drawn(box, picture)) {
                add(box, picture, rectsOf(box));
            }
        } else {
            for (const picture of pictures) {
                if (drawn(box, picture)) {
                    add(box, picture, [pictureRect(picture, box)]);
                }
            }
        }
        box.children.forEach(visit);
    };
    scenes.forEach(visit);
    return found.sort((a, b) => b.seen - a.seen);
};

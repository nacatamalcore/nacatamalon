import { atlasFrame } from '../atlas/atlas_frame';
import { placementInside } from '../box/world_placement_of';
import { ownerOfDrawable } from '../box/drawable_owner';
import { pivotPlace } from '../render/shared/pivot_place';
import { spriteSize } from '../render/shared/sprite_size';
import type { TSpriteAtlas } from '../atlas/types/t_sprite_atlas';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';

const MIDDLE = { x: 0.5, y: 0.5 };

/**
 * What has been said already, by sheet or by sprite: a game asks every frame.
 */
const said = new WeakMap<object, Set<string>>();

const sayOnce = (about: object, name: string, what: string): void => {
    const names = said.get(about) ?? new Set<string>();
    said.set(about, names);
    if (!names.has(name)) {
        names.add(name);
        console.warn(`[NacatamalOn] pointOf: ${what}`);
    }
};

const anyFrameHas = (points: TSpriteAtlas['points'], name: string): boolean => {
    for (const frame in points) {
        if (Object.hasOwn(points[frame as unknown as number]!, name)) {
            return true;
        }
    }
    return false;
};

/**
 * Where a named point of the frame a sprite is showing is in the world: the hand a sword hangs from,
 * the feet dust rises at, the muzzle a shot leaves. Its sheet says where each one is in each frame,
 * so what follows it stays right when the art changes, with no table of offsets to keep in step.
 *
 * Everything that moves the picture counts: its anchor and pivot, `flipX` and `flipY`, its size, its
 * scale and its turn, and every object above it. The camera does not, as in `localToWorld`, and so
 * neither does `parallax`: this is where it is placed, not where it is seen. In `useScreenSpace` the
 * answer is in screen pixels, as its placement is. With `tile` the frame is taken as stretched over
 * the whole sprite, not as each copy.
 *
 * A point is a place and not a pixel, measured as `anchor` is: `{ x: 14, y: 10 }` is the top-left
 * corner of that pixel, and flipped it lands where that corner lands, so write `14.5` for its middle.
 *
 * Ask it where it is used, each frame: the answer is for the frame showing now.
 *
 * @param sprite - A sprite from a sheet with points: an `.atlas` with `points`, or `createSpriteAtlas({
 * points })`.
 * @param name - The point's name.
 * @returns Where it is, or `null` when the frame showing now has no such point, or the sheet has not
 * arrived. A name no frame of the sheet has is said once, as it is most likely a typo.
 *
 * @example
 * ```ts
 * declare const hero: TSprite;
 * declare const sword: TSprite;
 *
 * useUpdate(() => {
 *     const hand = pointOf(hero, 'hand');
 *     sword.visible = hand !== null;
 *     if (hand !== null) {
 *         sword.transform.x = hand.x;
 *         sword.transform.y = hand.y;
 *     }
 * });
 * ```
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pointOf = (sprite: TSprite, name: string): { x: number; y: number } | null => {
    const atlas = sprite.atlas;
    if (atlas === undefined) {
        sayOnce(sprite, name, `asked for '${name}' of a sprite with no sheet. Make it with createSprite({ atlas }).`);
        return null;
    }
    // A sheet still on its way has no frames yet, and knows no names: nothing to say about it.
    if (!(atlas.frames > 0) || !(atlas.texture.width > 0) || !(atlas.texture.height > 0)) {
        return null;
    }

    const index = sprite.frame ?? 0;
    const named = atlas.points?.[index];
    if (named === undefined || !Object.hasOwn(named, name)) {
        // The ordinary case for a frame with no hand in it, and asked every frame: it costs a look.
        if (!anyFrameHas(atlas.points, name)) {
            const known = new Set(Object.values(atlas.points ?? {}).flatMap((points) => Object.keys(points)));
            sayOnce(atlas, name, known.size > 0
                ? `no frame of this sprite's sheet has a point called '${name}'. It has: ${[...known].join(', ')}.`
                : `this sprite's sheet has no points, so it has no '${name}'. Give them in its .atlas, or in createSpriteAtlas({ points }).`);
        }
        return null;
    }

    const point = named[name]!;
    const frame = atlasFrame(atlas, index);
    const u = point.x / (frame.uvScale.x * atlas.texture.width);
    const v = point.y / (frame.uvScale.y * atlas.texture.height);
    // Flipped, the picture turns over about its own middle, and its rectangle stays where it was.
    const across = sprite.flipX === true ? 1 - u : u;
    const down = sprite.flipY === true ? 1 - v : v;

    const { width, height } = spriteSize(sprite);
    const anchor = sprite.anchor ?? MIDDLE;
    const place = pivotPlace(placementInside(ownerOfDrawable(sprite)?.box ?? null, sprite.transform), sprite, anchor, width, height, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const about = sprite.pivot ?? anchor;
    const x = (across - about.x) * width * place.scaleX;
    const y = (down - about.y) * height * place.scaleY;
    const cos = Math.cos(place.rotation);
    const sin = Math.sin(place.rotation);
    return { x: place.x + x * cos - y * sin, y: place.y + x * sin + y * cos };
};

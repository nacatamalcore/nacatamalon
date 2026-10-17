import { captureScreen } from '../game/capture';
import { cutAndScale, photoSize } from './photo_pixels';
import { boxRegion, boxesIn } from './photo_boxes';
import type { TBox } from '../box/types/t_box';
import type { TDrawable } from '../gameobjects/types';
import type { TPixelRegion } from '../pixels';
import type { TRuntimeStore } from '../store';
import type { TPhoto, TPhotoBoxRef, TPhotoOptions } from './types/t_photo';

const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

/** Every box of the running scenes called `name`. */
const named = (scenes: readonly TBox[], name: string): TBox[] => {
    const found: TBox[] = [];
    const visit = (box: TBox): void => {
        if (box.name === name) {
            found.push(box);
        }
        box.children.forEach(visit);
    };
    scenes.forEach(visit);
    return found;
};

type TNamed = TBox | TDrawable;

/** The boxes and drawables a list of them and of names stands for, or `null` for none given. */
const boxesOf = (scenes: readonly TBox[], refs: readonly TPhotoBoxRef[] | undefined): ReadonlySet<TNamed> | null =>
    refs === undefined ? null : new Set<TNamed>(refs.flatMap((ref): TNamed[] => (typeof ref === 'string' ? named(scenes, ref) : [ref as TNamed])));

/** Whether a picture, its box, or a box above it is in a set. */
const under = (box: TBox, picture: TDrawable, set: ReadonlySet<TNamed>): boolean => {
    if (set.has(picture)) {
        return true;
    }
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        if (set.has(at)) {
            return true;
        }
    }
    return false;
};

const isRect = (region: TPhotoOptions['region']): region is TPixelRegion =>
    typeof region === 'object' && region !== null && 'width' in region && !('children' in region);

/** The part of the screen asked for, in the game's pixels. */
const regionOf = (scenes: readonly TBox[], region: TPhotoOptions['region'], screen: { width: number; height: number }): TPixelRegion => {
    if (region === undefined) {
        return { x: 0, y: 0, width: screen.width, height: screen.height };
    }
    if (isRect(region)) {
        return { x: Math.floor(region.x), y: Math.floor(region.y), width: Math.max(1, Math.round(region.width)), height: Math.max(1, Math.round(region.height)) };
    }
    const target = typeof region === 'string' ? named(scenes, region)[0] : region;
    if (target === undefined) {
        throw new Error(`[NacatamalOn] capture: there is no box called '${region as string}' in the running scenes for region.`);
    }
    const covered = boxRegion(target);
    if (covered === null || covered.width <= 0 || covered.height <= 0) {
        throw new Error('[NacatamalOn] capture: the region has nothing to measure: give its box a picture or a hitbox (useHitbox).');
    }
    return covered;
};

/** The photo being taken in each game, so the next waits for it rather than wanting the same frame. */
const queues = new WeakMap<TRuntimeStore, Promise<unknown>>();

const shoot = async (store: TRuntimeStore, options: TPhotoOptions): Promise<TPhoto> => {
    const scenes = store.get('world').scenes.filter((scene) => !scene.held);
    const hide = boxesOf(scenes, options.hide);
    const only = boxesOf(scenes, options.only);
    // The game's own view, whatever a tool is looking through: each scene's camera, every kind.
    const shot = await captureScreen(store, {
        camera3d: null,
        camera2d: null,
        layers: null,
        background: options.background ?? (only !== null ? TRANSPARENT : store.get('config').background),
    }, { hide, only, effects: options.effects ?? true });
    // Measured once the frame is drawn, so the region is where things are in the picture.
    const region = regionOf(scenes, options.region, shot);
    const size = photoSize(region, options.width, options.height);
    const pixels = cutAndScale(shot, region, size.width, size.height);
    const drawn = (box: TBox, picture: TDrawable): boolean => (hide === null || !under(box, picture, hide)) && (only === null || under(box, picture, only));
    return { ...pixels, boxes: boxesIn(scenes, region, pixels.width, pixels.height, drawn) };
};

/**
 * Takes a photo of a running game: draws it once more, as the player sees it, into a picture of its
 * own, and cuts, scales and measures it as `options` say. One at a time per game: another asked for
 * meanwhile waits its turn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const takePhoto = (store: TRuntimeStore, options: TPhotoOptions = {}): Promise<TPhoto> => {
    const before = queues.get(store) ?? Promise.resolve();
    const taken = before.then(() => shoot(store, options), () => shoot(store, options));
    queues.set(store, taken.catch(() => undefined));
    return taken;
};

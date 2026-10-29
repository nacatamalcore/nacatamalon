import { getActiveBox } from '../../store';
import { createMask, releaseMask } from '../../mask/create_mask';
import type { TMask, TMaskOptions } from '../../mask/types/t_mask';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Makes a mask: what keeps objects, and everything under them, to a rectangle or to the shape of
 * another object, so nothing of them is drawn, or touched by the pointer, outside it. It masks
 * nothing until it is `add`ed to something, and can be added to as many objects as want it: a map
 * and its enemies, and not the HUD.
 *
 * - `rect` keeps to a rectangle in the space of each object it is added to. Square to the screen it
 *   costs nothing at all.
 * - `by` keeps to the shape of another object: everything that object and the ones under it draw,
 *   sprites by their pictures, shapes, texts, added together. That object is not drawn itself
 *   unless `showShape`, and it moves, turns, grows and is tweened like any other.
 * - `channel: 'luminance'` reads a black and white cut-out: white shows, black cuts.
 * - `invert` draws only outside the shape. `soft` lets the shape through as much as it is there, a
 *   soft edge or a fade, and is the only kind that costs a picture of its own; the others cut hard,
 *   in or out at half way, which is what pixel art wants.
 *
 * An object has one mask. One mask inside another keeps to both: put each on its own object, one
 * inside the other. `zIndex` sorts what is masked as it always did. A mask goes away with the object
 * it was asked for in, and everything it masked is drawn whole again.
 *
 * @param options What it keeps to (`rect` or `by`) and how.
 * @returns The mask, to `add` to objects, `remove` from them, and change at any moment: `enabled`,
 * `invert`, `soft`, `by`, `rect`.
 *
 * @example
 * ```ts
 * const Flashlight = () => {
 *     useTransform({ x: 100, y: 80 });
 *     createSprite({ texture: 'cone' });
 * };
 *
 * const Ground = () => {
 *     createSprite({ texture: 'cave' });
 * };
 *
 * const Bats = () => {
 *     createSprite({ texture: 'bat', transform: { x: 200, y: 60 } });
 * };
 *
 * export const Cave: TSceneFn = () => {
 *     const light = useSpawn(Flashlight)();
 *     const mask = useMask({ by: light, soft: true });
 *     mask.add(useSpawn(Ground)());
 *     mask.add(useSpawn(Bats)());
 *     useTween()({ from: 40, to: 300, duration: 2, yoyo: true, repeat: -1, onUpdate: (x) => { light.transform!.x = x; } });
 *     return createScene();
 * };
 *
 * const Inventory = () => {
 *     useMask({ rect: { x: 0, y: 0, width: 200, height: 120 } }).add(useSelf());
 *     createSprite({ texture: 'items' });
 * };
 * ```
 *
 * @category Masks
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useMask = (options: TMaskOptions = {}): TMask => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useMask');
    }
    const mask = createMask(options);
    box.cleanups.push(() => releaseMask(mask));
    return mask;
};

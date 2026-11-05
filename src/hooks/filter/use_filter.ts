import { getActiveBox, getActiveGame } from '../../store';
import { createFilter, releaseFilter } from '../../filter/create_filter';
import { makePostEffect } from '../../post/make_post_effect';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import type { TFilter, TFilterOptions } from '../../filter/types/t_filter';

/**
 * Makes a filter: effects run over what an object, and everything under it, draws, before it is laid
 * on the screen. A contour around a character made of pieces, one contour and not one per piece; a
 * glow around a coin; a shadow under a panel; a television whose screen is a `crt()`. It filters
 * nothing until it is `add`ed to something, and can be added to as many objects as want it, each
 * filtered on its own.
 *
 * - `effects` are the engine's own spread in (`outline()`, `glow()`, `dropShadow()`, and every
 *   screen-wide one: `blur()`, `crt()`, `paletteMatch()`…), one written in place, or a file, in
 *   order, each reading what the one before it gave, as `usePostProcess` takes them.
 * - They work on what the object draws, with room around it for what they draw beyond it. `rect`
 *   gives them a part of the screen instead, in the object's space: the television's screen, which
 *   a `crt()` then curves as a whole.
 * - An effect keeps what is see-through see-through, unless drawing around it is what it is for.
 *
 * Each object filtered costs a picture the size of the screen and the effects run over its part:
 * for many enemies with the same contour, hang them from one object and filter that. An object has
 * one filter; one inside another runs on its own part first. A mask on the same object keeps the
 * filtered picture to it, glow and all. `zIndex` sorts what is filtered as it always did, and the
 * pointer touches it as it is, not as it looks. A filter goes away with the object it was asked for
 * in, and everything it filtered is drawn as it is again.
 *
 * Its radii and widths are pixels of the screen, so they keep their size when the camera zooms. A
 * model inside one keeps its depth: the rest of the scene hides it and is hidden by it pixel by pixel,
 * and what an effect draws round it (a glow's halo) takes the depth of the nearest part of it, so the
 * halo of a part that is hidden is hidden too. The halo is laid over the solid models drawn right
 * after it as well; one drawn later still, past a sprite or a see-through model, is drawn over it.
 * An effect that moves pixels (a wave) is still tested at the depth of where they were. `crt()` and `lcd()` fill the part they are given, as
 * a screen does: give them a `rect`. An effect that reads its last frame (`motionBlur`, `phosphor`)
 * reads the one it is handed instead, since an object's part of the screen moves and changes size.
 *
 * @param options The effects, and what part of the screen they work on.
 * @returns The filter, to `add` to objects, `remove` from them, and change at any moment: `enabled`,
 * `rect`, `padding`, and the `uniforms` of each of its `effects`.
 *
 * @example
 * ```ts
 * const Hero = () => {
 *     createSprite({ texture: 'body' });
 *     createSprite({ texture: 'sword', transform: { x: 10, y: -4 } });
 * };
 *
 * export const Level: TSceneFn = () => {
 *     const hero = useSpawn(Hero)();
 *     useFilter({ effects: [outline({ color: '#ffffff' }), dropShadow({ offset: { x: 2, y: 3 } })] }).add(hero);
 *
 *     const coin = useSpawn(() => { createSprite({ texture: 'coin' }); })();
 *     const shine = useFilter({ effects: [glow({ color: '#ffd23f' })] });
 *     shine.add(coin);
 *     let time = 0;
 *     useUpdate((delta) => {
 *         time += delta;
 *         shine.effects[0]!.uniforms.intensity = 1.5 + Math.sin(time * 4) * 0.5;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useFilter = (options: TFilterOptions): TFilter => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useFilter');
    }
    if (!Array.isArray(options.effects) || options.effects.length === 0) {
        throw new Error('[NacatamalOn] useFilter: it needs at least one effect. Give it `effects: [outline()]`, or any of the engine\'s own.');
    }
    const made = options.effects.map((asked) => makePostEffect(store, asked, 'filter', 'useFilter'));
    const filter = createFilter(made.map(({ effect }) => effect), options);
    box.cleanups.push(() => {
        releaseFilter(filter);
        for (const { unbind } of made) {
            unbind();
        }
    });
    return filter;
};

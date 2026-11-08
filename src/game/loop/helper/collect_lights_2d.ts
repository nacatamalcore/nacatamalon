import type { TBox } from '../../../box';
import type { TLight, TLight2d, TAmbientLight2d } from '../../../light';
import type { TLighting2d } from '../../../render/shared/lighting_2d';
import type { TSight } from '../../../render/shared/sight_2d';
import { MAX_LIGHTS_2D } from '../../../render/shared/lighting_2d';
import { mayHaveLights2d } from '../../../light/count_lights_2d';
import { gatherLights } from './collect_lights';
import { firstTimeIn } from '../../../utils/first_time_in';
import { gameOfBox } from '../../../box/box_game';

/**
 * The worlds that have had a 2D light. One stays lit until its scene ends, even with every lamp
 * hidden or gone: a cave whose only light was the player's lantern stays dark when the player dies,
 * rather than turning to broad daylight. Weak, so a world that ends takes its mark with it.
 */
const litWorlds = new WeakSet<TBox>();

/** A lit world with nothing lighting it: black where nothing lit shines. */
const dark = (): TLighting2d => ({ lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } });

/**
 * Whether a lamp gives any light inside what a view shows: it is on, and its circle reaches the
 * rectangle. A lamp that is off, or out of sight, takes none of the eight.
 */
const reaches = (lamp: TLight2d, sight: TSight | null): boolean => {
    const radius = lamp.radius;
    // Endless is not a reach the card is handed (`fillLighting2d` writes it as nothing), so it lights
    // nothing and takes no place.
    if (!(radius > 0 && radius < Infinity) || !(lamp.intensity > 0 && lamp.intensity < Infinity)) return false;
    if (sight === null) return true;
    const dx = Math.max(sight.minX - lamp.transform.x, 0, lamp.transform.x - sight.maxX);
    const dy = Math.max(sight.minY - lamp.transform.y, 0, lamp.transform.y - sight.maxY);
    return dx * dx + dy * dy < radius * radius;
};

/**
 * The eight of `lamps` that shine most on the middle of what the view shows, kept in the order of
 * the tree. Each is measured by how far the middle is from it, out of how far it reaches: a torch
 * right there comes first, a big lamp that covers the view (a moon) comes before the torches at the
 * edges, and a huge lamp that barely reaches comes last. Only asked for when more than eight reach.
 */
const nearest = (lamps: TLight2d[], sight: TSight): TLight2d[] => {
    const midX = (sight.minX + sight.maxX) / 2;
    const midY = (sight.minY + sight.maxY) / 2;
    const away = lamps.map((lamp, i) => ({ i, d: Math.hypot(lamp.transform.x - midX, lamp.transform.y - midY) / lamp.radius }));
    away.sort((a, b) => a.d - b.d || a.i - b.i);
    const kept = away.slice(0, MAX_LIGHTS_2D).sort((a, b) => a.i - b.i);
    return kept.map(({ i }) => lamps[i]!);
};

/**
 * The 2D lights of one world, `root` and what is under it, or `undefined` when it is not lit. What
 * is hidden, the HUD and the worlds of pictures inside it are not part of it.
 *
 * A game that never made a 2D light is not walked at all: it is asked every frame of every scene.
 * `staysLit` is `false` for a view of another world, which goes back to that world's lights when its
 * own are gone.
 *
 * `sight` is what the view shows of the world. Of the lamps that are on and reach it, the eight
 * that shine most on its middle light it (`nearest`), so a long level can have a torch every few
 * steps. A lamp anywhere in the world still makes it lit, even one far away. `null`, a view of no
 * size yet, takes the first eight that are on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const collectLighting2d = (root: TBox, staysLit = true, sight: TSight | null = null): TLighting2d | undefined => {
    const once = staysLit && litWorlds.has(root);
    if (!mayHaveLights2d(root)) return once ? dark() : undefined;
    const found: TLight[] = [];
    gatherLights(root, found, null, true, true);
    let any = false;
    let lamps: TLight2d[] = [];
    let base: TAmbientLight2d | undefined;
    let ambients = 0;
    for (const light of found) {
        if (light.type === 'point-2d') {
            any = true;
            if (reaches(light, sight)) lamps.push(light);
        } else if (light.type === 'ambient-2d') {
            base = light;
            ambients++;
        }
    }
    if (!any && base === undefined) {
        // Lit before: dark now, with no lamp and no ambient light.
        return once ? dark() : undefined;
    }
    if (staysLit) litWorlds.add(root);

    const game = gameOfBox(root);
    if (lamps.length > MAX_LIGHTS_2D && firstTimeIn(game, 'lights2d: budget')) {
        const which = sight === null ? 'first in the tree' : 'nearest its middle';
        console.warn(`[NacatamalOn] useLight2d: ${lamps.length} lamps reach what a view shows, and it lights with the ${MAX_LIGHTS_2D} ${which}. Spread them out, or make one lamp do for several.`);
    }
    if (ambients > 1 && firstTimeIn(game, 'lights2d: ambient')) {
        console.warn(`[NacatamalOn] useAmbientLight2d: a scene has ${ambients} ambient lights, and the last one is the one used. Keep one.`);
    }
    const intensity = base !== undefined && Number.isFinite(base.intensity) ? Math.max(0, base.intensity) : 0;
    if (lamps.length > MAX_LIGHTS_2D) lamps = sight === null ? lamps.slice(0, MAX_LIGHTS_2D) : nearest(lamps, sight);
    return {
        lights: lamps,
        ambient: { r: (base?.color.r ?? 0) * intensity, g: (base?.color.g ?? 0) * intensity, b: (base?.color.b ?? 0) * intensity, a: 1 },
    };
};

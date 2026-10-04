import type { TVec2 } from './index';

/**
 * How far apart two points are. With transforms, `vec2Distance(player.transform, coin.transform) < 12`
 * is a pickup check.
 *
 * @param a One point.
 * @param b The other.
 * @returns The distance between them.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dist = (a: TVec2, b: TVec2): number =>
    Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);

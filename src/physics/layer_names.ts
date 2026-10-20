import { PHYSICS_LAYERS } from './layers';
import type { TPhysicsSurface } from './types/t_physics';

/**
 * A collision layer, by its number (`0` to `15`) or by the name the game gave it in
 * `physicsLayers` (`'enemy'`).
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsLayer = number | string;

/**
 * How a body says what layer it is on and what it collides with: by number, as the format keeps
 * them, or by the names the game gave its layers (`physicsLayers` in `createGame` or the project).
 * `collidesWith` is a mask (`1 << n`) or a list of layers: `['world', 'enemy']`.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsLayerOptions = {
    layer?: TPhysicsLayer;
    collidesWith?: number | readonly TPhysicsLayer[];
};

/**
 * The layers a game named, cleaned: names that are names, each once, sixteen at most, in order: the
 * first is layer 0.
 *
 * @internal
 */
export const cleanLayerNames = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    const names: string[] = [];
    for (const name of raw) {
        if (typeof name === 'string' && name.trim() !== '' && !names.includes(name.trim())) names.push(name.trim());
        if (names.length === PHYSICS_LAYERS) break;
    }
    return names;
};

const warned = new Set<string>();

/**
 * The number of one layer: a number as it is, a name by its place in `names`. A name the game did
 * not give is said once, and taken as layer 0.
 */
const layerNumber = (layer: TPhysicsLayer, names: readonly string[]): number => {
    if (typeof layer === 'number') return layer;
    const at = names.indexOf(layer);
    if (at >= 0) return at;
    if (!warned.has(layer)) {
        warned.add(layer);
        const known = names.length > 0 ? `It names: ${names.join(', ')}.` : 'It names none: give them with physicsLayers in createGame or the project.';
        console.warn(`[NacatamalOn] physics: the game has no layer called '${layer}', so layer 0 is used. ${known}`);
    }
    return 0;
};

/**
 * A body's layers as the format keeps them, numbers and a mask, from what was asked for, names and
 * lists included.
 *
 * @internal
 */
export const resolveLayers = (options: TPhysicsLayerOptions, names: readonly string[]): Partial<Pick<TPhysicsSurface, 'layer' | 'collidesWith'>> => ({
    ...(options.layer !== undefined ? { layer: layerNumber(options.layer, names) } : {}),
    ...(options.collidesWith !== undefined
        ? {
            collidesWith: typeof options.collidesWith === 'number'
                ? options.collidesWith
                : options.collidesWith.reduce<number>((mask, layer) => mask | (1 << layerNumber(layer, names)), 0),
        }
        : {}),
});

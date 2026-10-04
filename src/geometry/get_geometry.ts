import { getActiveGame } from '../store/active_game';
import type { TGeometry } from './types/t_geometry';

/**
 * Resolves the name a shape is kept under, the same string a model's `geometry` field holds, to the
 * shape itself, or `null` when nothing has been loaded under it.
 *
 * A model looks this up on its own, which was enough while a model was the only thing that could
 * name a shape. **A collider names one too** (`{ shape: 'hull', geometry: 'crate' }`), and that
 * happens outside the engine, in whichever package does the simulating, so the lookup has to be
 * reachable rather than re-derived against the running game's insides by every one of them.
 *
 * It answers while a scene is being built, which is when a collider is made, and that is the whole
 * of what it is for: there is no running game to ask outside of that, and the answer is `null`.
 * @param key - The name the shape is kept under.
 * @returns The shape, or `null` when nothing is loaded under that name.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getGeometry = (key: string): TGeometry | null =>
    getActiveGame()?.get('assets').geometries.get(key) ?? null;

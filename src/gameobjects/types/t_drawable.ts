import type { TSprite } from '../sprite/types/t_sprite';
import type { TText } from '../text/types/t_text';
import type { TTilemapLayer } from '../tilemap/types/t_tilemap';
import type { TMesh } from '../mesh/types/t_mesh';
import type { TParticles } from '../particles/types/t_particles';
import type { TParticles3d } from '../particles/types/t_particles_3d';
import type { TLines } from '../lines/types/t_lines';
import type { TNineSlice } from '../nine_slice/types/t_nine_slice';

/**
 * Anything drawn in a scene: a sprite, a text, a nine-slice, a map layer, a model, particles or lines. It grows by adding members (`TSprite | TText | TTilemap`), and every
 * member carries a `type`, so a `switch` on it knows which one it holds.
 *
 * A union and not a shared base type: a base would need a cast to reach any field of its own,
 * and could never tell a backend that it forgot a kind.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawable = TSprite | TText | TNineSlice | TTilemapLayer | TMesh | TParticles | TParticles3d | TLines;

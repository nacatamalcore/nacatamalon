import type { TDrawSprite } from './t_draw_sprite';
import type { TDrawTilemapLayer } from './t_draw_tilemap_layer';
import type { TDrawMesh } from './t_draw_mesh';
import type { TDrawParticles } from './t_draw_particles';
import type { TDrawParticles3d } from './t_draw_particles_3d';
import type { TDrawLines } from './t_draw_lines';

/**
 * Anything a backend can be asked to draw. It grows by adding members
 * (`TDrawSprite | TDrawText`), and every member carries a `type`.
 *
 * A backend switches on `type` and ends with a `never` check, so adding a member stops every
 * backend that does not handle it from compiling, instead of drawing nothing in silence.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawItem = TDrawSprite | TDrawTilemapLayer | TDrawMesh | TDrawParticles | TDrawParticles3d | TDrawLines;

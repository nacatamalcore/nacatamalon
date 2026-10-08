/**
 * Where everything a WebGL2 program reads is bound: uniform blocks and texture units. In a file of
 * their own because both a pipeline and the materials drawn through it need the same numbers, and
 * keeping them in the pipeline made each import the other.
 */

/**
 * Where the frame uniforms are bound: the `Uniforms` block of every program reads binding 0.
 *
 * @internal
 */
export const FRAME_UNIFORMS_BINDING = 0;

/**
 * Where the two blocks are bound. Numbered from 1 because binding 0 is the frame's own, which the
 * 2D programs read: one number means one thing across this backend.
 *
 * @internal
 */
export const MESH_UNIFORMS_BINDING = 1;
export const MESH_LIGHTS_BINDING = 2;

/**
 * Which slot each picture a model reads goes in. The surface shares slot 0 with the 2D, because
 * nothing else is bound while a model draws; the bones get one of their own.
 *
 * @internal
 */
export const MESH_TEXTURE_UNIT = 0;
export const MESH_JOINTS_UNIT = 1;

/**
 * Where the shadow map is bound while a model draws.
 *
 * Its own unit and never shared, because it is read as a comparison rather than as a picture: a
 * `sampler2DShadow` and a `sampler2D` pointing at the same unit is the one mix this card refuses
 * outright, and it refuses it at draw time rather than at compile time.
 */
export const MESH_SHADOW_UNIT = 2;

/**
 * The units a material's extra maps are read from, one per slot, after the three a model already
 * uses (its picture, its bones and the shadow map). Every one is set on the program by name: a
 * sampler left unset reads unit 0, beside the picture, and this card throws the draw away when a
 * comparing sampler and an ordinary one end up sharing a unit.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_MAP_UNITS: readonly number[] = [3, 4, 5, 6];

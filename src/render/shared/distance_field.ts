/**
 * How many pixels of a distance-field image the field spans, from fully outside to fully inside, split
 * evenly either side of the edge.
 *
 * One number for both ends of the trip: the font loader draws its letters with it, and both backends'
 * shaders are written with it, so the shader can never read a field as steeper or flatter than it is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DISTANCE_FIELD_RANGE = 4;

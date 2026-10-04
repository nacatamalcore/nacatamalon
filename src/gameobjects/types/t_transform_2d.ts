/**
 * Where a game object is, how it is turned and how big it is drawn.
 *
 * Every field is required and written out, `rotation: 0, scaleX: 1, scaleY: 1` included. Spelled
 * out rather than filled in from a default, so a transform read from a file, one built by hand and
 * one the editor wrote are the same five numbers, and moving one never depends on which of the
 * three it came from.
 *
 * That is the object once made. Making one takes only the fields that differ from the defaults
 * (`createSprite({ transform: { x: 40, y: 112 } })`), and the rest are filled in there.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransform2d = {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
};
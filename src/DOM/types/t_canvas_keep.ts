/**
 * Which sides of the resolution stay pinned. **Writes the drawing buffer, not CSS**: anything
 * but `'both'` makes the game see more or less world instead of leaving bars.
 *
 * - `'both'`: the buffer is always `width × height`. Every player sees exactly the same
 *   frame, and space the scale cannot fill stays as letterbox or pillarbox bars. The default,
 *   and the only value where a level designer can be sure what is off-screen.
 * - `'height'`: the height is pinned and the width follows the container, so a wide screen sees
 *   more world to the sides. What a side-scroller usually wants.
 * - `'width'`: the width is pinned and the height follows, so a tall screen sees more above and
 *   below. The vertical-shooter version of the same idea.
 * - `'none'`: nothing pinned. With no fixed side there is no reference to compute a scale
 *   from, so it stays at 1× and the buffer becomes the container's size in CSS pixels.
 *   Desktop-app behaviour, not game behaviour.
 *
 * Pairs with {@link TCanvasScaling}, which is the other axis and decides how big it is drawn.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCanvasKeep = 'both' | 'height' | 'width' | 'none';

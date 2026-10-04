import type { TKeyName } from './t_key_name';

/**
 * What a game asks the keyboard, once per frame, from inside an update.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TKeyboard = {
    /**
     * Whether the key is being held right now. For anything that continues: walking, steering.
     */
    isDown(key: TKeyName): boolean;
    /**
     * Whether the key went down **during this frame**: true for exactly one frame per press,
     * however long it is then held. For anything that happens once: firing, jumping, confirming.
     *
     * Holding a key makes the browser repeat `keydown` several times a second, and those repeats
     * are not presses. That is the difference between one shot and a stream of them.
     */
    justPressed(key: TKeyName): boolean;
    /**
     * Whether the key came up during this frame: the mirror of `justPressed`.
     */
    justReleased(key: TKeyName): boolean;
};

/**
 * The keyboard as the engine holds it: the handle a game reads, plus the two calls only the loop
 * and `createGame` are allowed to make.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TKeyboardSource = TKeyboard & {
    /**
     * Told about a key the moment the browser reports it, rather than at the frame boundary. Only
     * for what needs the event itself: waiting for the player to press a key to bind it, where a
     * quick tap between two frames still has to count. Returns the function that stops.
     */
    onKey(listener: (key: string) => void): () => void;
    /**
     * Closes the input frame: what was pressed or released stops being "just".
     *
     * Called by the loop after every update has run, and that call is what defines a frame for
     * input. A press has to be visible to **every** object asking this frame and to none of them
     * the next, and only whoever owns the loop can draw that line: the DOM has no idea what a
     * frame is.
     */
    endFrame(): void;
    /**
     * Detaches the listeners. Called when the game is destroyed.
     */
    destroy(): void;
};

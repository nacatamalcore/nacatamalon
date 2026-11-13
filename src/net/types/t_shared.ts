import type { TActionsHandle } from '../../input';

/**
 * What a player's actions do to an object of their own in one step: the same code on the server,
 * with the actions that came over the line, and in the player's page, with the player's own, ahead
 * of the server so the player feels no wait.
 *
 * It only moves the object, from where it is, by `input` and `dt`: when the server corrects the
 * player's page, the page goes back to where the server had it and runs this again for the steps
 * the server had not seen yet, several in one frame. So nothing else belongs here (no spawning, no
 * sound, no score): what comes of a shot is the server's, in an update, from `useNet().actions`.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSharedMove = (input: TActionsHandle, dt: number) => void;

/**
 * How an object is shared with every game in the room.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSharedOptions<F extends Record<string, unknown> = Record<string, unknown>> = {
    /**
     * The name both sides know it by, for an object every game builds itself: one of the scene's,
     * or of its document (`self.id` there). Not needed, and not used, for one a spawner of
     * `useNetSpawn` makes: the server names those.
     */
    key?: string;
    /**
     * What travels besides its placement, with the values it starts with: the server changes them
     * (`shared.fields.hp -= 1`) and every player's game has the new ones a moment later. Plain data
     * only: numbers, strings, booleans, arrays and objects of them.
     */
    fields?: F;
    /** The player it belongs to: the one whose actions `move` takes, and for whom `mine` is true. */
    owner?: string | null;
    /** What its owner's actions do to it each step. See {@link TSharedMove}. */
    move?: TSharedMove;
    /**
     * Whether a player's game shows it gliding between what the server said, a moment behind
     * (`true`, the default), or jumps to each as it arrives, with no wait (`false`).
     */
    smooth?: boolean;
};

/**
 * An object shared with every game in the room, as its own code sees it.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShared<F extends Record<string, unknown> = Record<string, unknown>> = {
    /** What the room calls it: its key, or the name the server gave one a spawner made. */
    readonly id: string;
    /** The player it belongs to, or `null`. */
    readonly owner: string | null;
    /** Whether it belongs to the player of this page. Always `false` on the server. */
    readonly mine: boolean;
    /** What travels besides its placement: the server writes them, the players' games read them. */
    readonly fields: F;
};

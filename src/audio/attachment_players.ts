/**
 * How to play each sound a box carries, by what it carries: `box.sounds` holds what a sound is (for a
 * saved scene and an editor to read), and its handle stays with whoever made it. Something that only
 * has the box (a motion's `sound` event) plays it through here. Weak, so a sound that goes takes its
 * entry with it.
 */
const players = new WeakMap<object, () => void>();

/**
 * Says how one of a box's sounds is played. Called by the hook that made it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setAttachmentPlayer = (attachment: object, play: () => void): void => {
    players.set(attachment, play);
};

/**
 * Plays one of a box's sounds from what the box carries, and says whether it could: `false` for one
 * no hook made.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const playAttachment = (attachment: object): boolean => {
    const play = players.get(attachment);
    if (play === undefined) return false;
    play();
    return true;
};

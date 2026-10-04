/**
 * Where the game is heard from, put on an object: its ears.
 *
 * Without one the ears are in the camera, which is right for most games. A game seen from behind
 * its character wants them on the character instead, or a bird on the left of the character is
 * heard on whichever side of the camera it happens to be.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAudioListener = {
    readonly type: 'audio-listener';
    id: string;
    /**
     * Off, the ears go back to the next in line, and in the end to the camera.
     */
    enabled: boolean;
};

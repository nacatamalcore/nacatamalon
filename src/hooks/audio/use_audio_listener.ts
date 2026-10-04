import { createRecord } from '../../gameobjects/create_record';
import { getActiveBox, getActiveGame } from '../../store';
import { getAudioManager } from '../../audio';
import type { TAudioListener } from '../../audio';

/**
 * Puts the game's ears on this object: every sound placed in the world is heard from where it is,
 * and in a 3D scene, facing the way it faces.
 *
 * Without it the game is heard from the camera, which is right until the camera is not where the
 * player is. A game seen from behind its character wants the ears on the character: a bird to the
 * character's left is then heard on the left, wherever the camera has swung round to.
 *
 * One per object. With several switched on the first one is used, and that is said once; switch one
 * off with `enabled` to hand over to the next, and in the end back to the camera.
 *
 * @param options Whether it starts on. Default on.
 * @returns The ears, to switch off and on with `enabled`.
 *
 * @example
 * ```ts
 * const Player = () => {
 *     useTransform({ x: 0, y: 0.5, z: 0 });
 *     createMesh({ geometry: useCubeGeometry() });
 *     useAudioListener();
 * };
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useAudioListener = (options: { enabled?: boolean } = {}): TAudioListener => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useAudioListener: call it inside a scene body, or inside something created with useSpawn.');
    }
    if (box.audioListener !== null) {
        console.warn('[NacatamalOn] useAudioListener: this object already has ears, so the ones it had are replaced.');
    }

    const listener = createRecord('audio-listener', { enabled: options.enabled ?? true }) as TAudioListener;
    box.audioListener = listener;

    const audio = getAudioManager(store);
    if (!audio.listeners.includes(box)) {
        audio.listeners.push(box);
        box.cleanups.push(() => {
            audio.listeners = audio.listeners.filter((other) => other !== box);
        });
    }
    return listener;
};

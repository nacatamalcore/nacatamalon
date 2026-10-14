import type { TBox } from '../box';
import type { TSoundHandle } from './types/t_sound';
import type { TMusicHandle } from './types/t_music';
import type { TSongHandle } from './types/t_song_player';

/**
 * The handle of each sound a box carries, by what it carries: `box.sounds` holds what a sound is
 * (for a saved scene and an editor to read), and its handle stays with whoever made it. Something
 * that only has the box (a motion's `sound` event, a behaviour playing a sound laid out in the scene)
 * reaches it through here. Weak, so a sound that goes takes its entry with it.
 */
const handles = new WeakMap<object, TSoundHandle | TMusicHandle | TSongHandle>();

/**
 * Says what plays one of a box's sounds. Called by the hook that made it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setAttachmentHandle = (attachment: object, handle: TSoundHandle | TMusicHandle | TSongHandle): void => {
    handles.set(attachment, handle);
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
    const handle = handles.get(attachment);
    if (handle === undefined) return false;
    handle.play();
    return true;
};

/** A file's name without its folder or its extension: `crowd` for `/sfx/crowd.wav`. */
const baseName = (src: string): string => src.slice(src.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');

/** Whether a file is the one a name means: its key, its address, or its name alone. */
const named = (file: { key: string; src: string }, name: string): boolean =>
    file.key === name || file.src === name || (file.src !== '' && baseName(file.src) === name);

/**
 * The handle of a sound a box carries, found by its name: the component's id, or its file (`crowd`,
 * `/sfx/crowd.wav`, or the key it was loaded under). For music, any of its layers' files; for a song,
 * the `.song`. `null` when the box carries none by that name.
 *
 * What lets a behaviour play a sound laid out in the scene, where a person can choose its file, its
 * volume and whether it loops, instead of naming the file in code:
 *
 * ```ts
 * registerScript('title-screen', ({ self }) => {
 *     useUpdate(() => {
 *         if (pressed) soundOf<TSongHandle>(self, 'title_theme')?.stop();
 *     });
 * });
 * ```
 *
 * The scene builds a box's components in order, so a sound written after the behaviour is not there
 * yet while the behaviour starts: ask for it when it is played.
 *
 * @param box The box that carries the sound.
 * @param name The component's id, or the file it plays.
 * @returns The handle that `useSound`, `useMusic` or `useSong` gave back, or `null`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const soundOf = <THandle extends TSoundHandle | TMusicHandle | TSongHandle = TSoundHandle>(box: TBox, name: string): THandle | null => {
    const byId = box.sounds.find((attached) => attached.id === name);
    const attached = byId ?? box.sounds.find((sound) => {
        switch (sound.type) {
            case 'sound': return named(sound.clip, name);
            case 'music': return sound.layers.some((layer) => named(layer.clip, name));
            case 'song': return named(sound.file, name);
        }
    });
    return attached === undefined ? null : (handles.get(attached) as THandle | undefined) ?? null;
};

import { getActiveBox, getActiveGame } from '../../store';
import { getVersion } from '../../store/record_version';
import { rootOf } from '../../box';
import { nanoId } from '../../utils';
import { whenLoaded } from '../../loaders';
import { motionFileOf } from '../../loaders/motion';
import { playAttachment } from '../../audio/attachment_players';
import { fade, iris, pixelate, wipe } from '../../transition';
import { applyMotionTracks, bindMotionTracks } from '../../motion/motion_tracks';
import { findMotionBox } from '../../motion/motion_targets';
import { useScene } from '../scene/use_scene';
import { isShowingOnly } from '../physics/is_showing_only';
import type { TMotionFile } from '../../loaders/motion';
import type { TTransition } from '../../transition';
import type { TBoundTracks } from '../../motion/motion_tracks';
import type { TMotionDoc, TMotionEvent, TMotionTransition } from '../../motion/types/t_motion_doc';
import type { TMotionAttachment, TMotionHandle, TMotionOptions } from '../../motion/types/t_motion';

/**
 * More loops than this in one frame is a frame far longer than the motion, and the rest is skipped:
 * what it would do is play the same events over and over within one frame.
 */
const MAX_LOOPS_PER_FRAME = 8;

const transitionOf = (transition: TMotionTransition | undefined): TTransition | undefined => {
    if (transition === undefined) return undefined;
    switch (transition.type) {
        case 'fade': return fade(transition.duration);
        case 'wipe': return wipe(transition.duration);
        case 'iris': return iris(transition.duration);
        case 'pixelate': return pixelate(transition.duration);
    }
};

/**
 * Plays a motion on the scene this is called in: a `.motion` file of values moved over time by keys
 * (a camera sweeping the field, a title coming in), made in an editor's motion panel.
 *
 * It moves on the scene's own clock, a frame at a time, so it stops when the scene is paused and
 * goes slower or faster with it. Each track finds its box by id, and by name when no box has that
 * id; a track whose box or field is not there is warned about once and moves nothing. On the way, it
 * plays the sounds, changes the scene and calls the marks it is played past.
 *
 * A scene document plays one with a `motion` component; this is the same thing from code, for a
 * behaviour that decides when.
 *
 * @param motion A motion from `useLoadMotion`, or a `TMotionDoc` written in code.
 * @param options Whether it starts by itself, loops, and how fast.
 * @returns Its controls.
 *
 * @example
 * ```ts
 * export const Intro: TSceneFn = () => {
 *     const intro = useMotion(useLoadMotion({ src: '/motions/intro.motion' }), { autoplay: true });
 *     intro.on('titleShown', () => console.log('the title is up'));
 *     intro.onEnd(() => console.log('over'));
 *     return createScene();
 * };
 * ```
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useMotion = (motion: TMotionFile | TMotionDoc, options: TMotionOptions = {}): TMotionHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useMotion: call it inside a scene body.');
    }
    const scene = useScene();
    // A scene being shown rather than played (an editor laying it out) keeps everything where it
    // was put: it is saved as it was asked to play, and does not start.
    const showingOnly = isShowingOnly();
    const id = options.id ?? nanoId();
    const file = 'type' in motion && motion.type === 'motion-file' ? motion : motionFileOf(motion as TMotionDoc, `motion:${id}`);

    const attachment: TMotionAttachment = {
        type: 'motion',
        id,
        file,
        autoplay: options.autoplay ?? false,
        loop: options.loop ?? null,
        speed: options.speed ?? 1,
    };
    box.motions.push(attachment);

    let time = 0;
    /**
     * The moment its events have been played up to: just before `0` when nothing has been, so the
     * events at the very start happen too.
     */
    let eventsUpTo = -1;
    let playing = false;
    /**
     * A seek waiting for the next frame to put the fields where it said.
     */
    let sought = false;
    let bound: TBoundTracks | null = null;
    let boundFrom = -1;
    const warned = new Set<string>();
    const marks = new Map<string, Set<() => void>>();
    const ends = new Set<() => void>();

    const label = file.src !== '' ? file.src : 'a motion written in code';
    const warnOnce = (message: string): void => {
        if (warned.has(message)) return;
        warned.add(message);
        console.warn(`[NacatamalOn] useMotion: '${label}', ${message}.`);
    };

    /**
     * The tracks found on the scene, again whenever the file has changed.
     */
    const tracks = (): TBoundTracks | null => {
        if (file.doc === null) return null;
        if (bound === null || boundFrom !== getVersion(file)) {
            bound = bindMotionTracks([rootOf(box)], file.doc, store.get('post').effects);
            boundFrom = getVersion(file);
            for (const problem of bound.problems) warnOnce(`${problem}, so it moves nothing`);
        }
        return bound;
    };

    const happen = (event: TMotionEvent): void => {
        switch (event.kind) {
            case 'mark':
                for (const listener of [...(marks.get(event.name) ?? [])]) listener();
                break;
            case 'scene': {
                const transition = transitionOf(event.transition);
                scene.change(event.scene, transition !== undefined ? { transition } : undefined);
                break;
            }
            case 'sound': {
                const holder = findMotionBox([rootOf(box)], event.box, event.name);
                const sound = holder?.sounds.find((attached) => attached.id === event.component);
                if (sound === undefined || !playAttachment(sound)) {
                    warnOnce(`the sound at ${event.t} s (box ${event.name ?? event.box}, component ${event.component}) is not on the scene, so it is not heard`);
                }
                break;
            }
        }
    };

    /**
     * Every event after `from` up to and including `to`, in order.
     */
    const happenBetween = (doc: TMotionDoc, from: number, to: number): void => {
        for (const event of doc.events) {
            if (event.t > from && event.t <= to && !box.destroyed) happen(event);
        }
    };

    const advance = (seconds: number): void => {
        const found = tracks();
        if (found === null) return;
        const { doc } = found;
        const loops = attachment.loop ?? doc.loop ?? false;
        let to = time + seconds;
        let ended = false;
        for (let wraps = 0; to >= doc.duration; wraps += 1) {
            happenBetween(doc, eventsUpTo, doc.duration);
            if (!loops) {
                to = doc.duration;
                ended = true;
                break;
            }
            to -= doc.duration;
            eventsUpTo = -1;
            if (wraps >= MAX_LOOPS_PER_FRAME) {
                to %= doc.duration;
                break;
            }
        }
        time = to;
        applyMotionTracks(found, time);
        if (ended) {
            playing = false;
            eventsUpTo = doc.duration;
            for (const listener of [...ends]) listener();
            return;
        }
        happenBetween(doc, eventsUpTo, time);
        eventsUpTo = time;
    };

    box.updateCallbacks.push((dt) => {
        if (sought) {
            // Where `play` or `seek` put it, with no time gone by: the fields at that moment, and
            // when playing, what happens right there (the events at the start).
            sought = false;
            const found = tracks();
            if (found === null) return;
            applyMotionTracks(found, time);
            if (playing) {
                happenBetween(found.doc, eventsUpTo, time);
                eventsUpTo = time;
            }
            return;
        }
        if (playing) {
            advance(dt * attachment.speed);
        }
    });

    const handle: TMotionHandle = {
        play: () => {
            time = 0;
            eventsUpTo = -1;
            playing = true;
            sought = true;
        },
        pause: () => {
            playing = false;
        },
        resume: () => {
            if (file.doc !== null && time < file.doc.duration) playing = true;
        },
        stop: () => {
            playing = false;
            time = 0;
            eventsUpTo = -1;
        },
        seek: (seconds) => {
            time = Math.min(Math.max(0, seconds), file.doc?.duration ?? seconds);
            eventsUpTo = time;
            sought = true;
        },
        on: (mark, listener) => {
            let listeners = marks.get(mark);
            if (listeners === undefined) {
                listeners = new Set();
                marks.set(mark, listeners);
            }
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        onEnd: (listener) => {
            ends.add(listener);
            return () => { ends.delete(listener); };
        },
        get time() {
            return time;
        },
        get duration() {
            return file.doc?.duration ?? 0;
        },
        get playing() {
            return playing;
        },
    };

    void whenLoaded(file).then(() => {
        if (!box.destroyed && file.status === 'ready' && attachment.autoplay && !showingOnly) {
            handle.play();
        }
    });

    return handle;
};

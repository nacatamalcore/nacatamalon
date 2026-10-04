import { blendPoses, sampleClip } from '../../math/skinning';
import { copyPose, restingJoint } from '../../animation';
import { useUpdate } from '../loop/use_update';
import type { TGltfModel } from '../../loaders';
import type { TJointPose } from '../../animation';
import type { TSkeletalAnimation, TSkeletalAnimationOptions } from './types/t_skeletal_animation';

/**
 * Somewhere to put a sampled pose, one set per skeleton, made once and written over after that.
 */
const roomFor = (model: TGltfModel): TJointPose[][] =>
    model.skeletons.map((skeleton) => skeleton.pose.map(() => restingJoint()));

/**
 * Makes a loaded model move: plays the movements it came with, and eases between them.
 *
 * A rigged model is a skin stretched over bones. A movement turns the bones, and the skin follows,
 * which is why one model can walk, run and fall over without three copies of it existing.
 *
 * **It can be asked for a movement before the file has arrived**, which is the ordinary case: the
 * model comes back still loading, so `play` is remembered and honoured the moment it shows up.
 *
 * `fade` is what makes it look like a character rather than a demo. Asked to change movement over
 * half a second, it turns the bones from where one has them to where the other does; cutting
 * straight across snaps a leg from behind to in front in a single frame.
 *
 * @param model The loaded model, from `useLoadGltf`.
 * @param options Which movement to start on, and how it plays.
 * @returns The handle: what it is doing, and how to change it.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useCamera3d({ projection: 'perspective', z: 200 });
 *     useLight({ intensity: 1 });
 *
 *     const fox = useLoadGltf({ src: '/models/fox.glb' });
 *     createModel({ model: fox });
 *     const moves = useSkeletalAnimation(fox, { play: 'Walk', fade: 0.25 });
 *
 *     const keys = useKeyboard();
 *     useUpdate(() => {
 *         if (keys.justPressed('Space')) moves.play('Run');
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSkeletalAnimation = (model: TGltfModel, options: TSkeletalAnimationOptions = {}): TSkeletalAnimation => {
    let clipName: string | null = null;
    let playing = false;
    let loop = options.loop ?? true;
    let speed = options.speed ?? 1;
    let time = 0;
    const defaultFade = options.fade ?? 0;

    // A movement asked for before the file arrived. Kept and honoured the frame it shows up, the
    // same way the sprite animator waits for its sheet.
    let pending: string | null = options.play ?? null;
    // Told when a movement that does not go round reaches its end.
    const listeners: Array<(clip: string) => void> = [];
    // Told when a movement passes one of the moments marked on it.
    const eventListeners: Array<(event: string, clip: string) => void> = [];
    /**
     * Whether the movement playing has had its own beginning counted as passed. Left false when one
     * starts, so a mark at `0` is passed inside the frame loop rather than while the scene is being
     * built: a listener taken on right after this hook would otherwise miss it.
     */
    let reached = false;

    /**
     * Tells whoever is listening about every moment marked between two points of a movement.
     *
     * Half open at the start and closed at the end, so a moment is passed exactly once however the
     * frames fall on it. The one exception is the beginning of a lap, which is closed at both ends:
     * a mark at `0` belongs to the time through that is starting.
     */
    const markBetween = (name: string, from: number, to: number, fromStart: boolean): void => {
        const marks = options.events?.[name];
        if (marks === undefined || marks.length === 0 || eventListeners.length === 0) {
            return;
        }
        // Copied first: a listener is allowed to start another movement, and that must not change
        // the list being walked.
        const told = [...eventListeners];
        for (const mark of marks) {
            const passed = fromStart ? mark.at >= from && mark.at <= to : mark.at > from && mark.at <= to;
            if (passed) {
                for (const listener of told) {
                    listener(mark.name, name);
                }
            }
        }
    };

    // Somewhere to sample into while easing from one movement to another. Made the first time it
    // is needed and written over after that, so easing asks for no memory per frame.
    let from: TJointPose[][] | null = null;
    let to: TJointPose[][] | null = null;
    // The live poses, gathered once rather than per frame: the sampler wants one list per skeleton
    // and building that list every frame would be asking for memory sixty times a second.
    let live: TJointPose[][] | null = null;
    /**
     * The movement being eased away from. It carries how it was playing (`loop`, `speed`, whether it
     * had already finished) rather than reading the animator's, because by the time it is eased out
     * those belong to the movement coming in: a one-shot that finished and is followed by a loop
     * would otherwise go round again and ease in from its first frame.
     */
    let fade: {
        name: string; time: number; elapsed: number; duration: number;
        loop: boolean; speed: number; ended: boolean;
    } | null = null;

    const known = (): string[] => Object.keys(model.clips);

    /**
     * Puts the bones back the way the model was made.
     */
    const rest = (): void => {
        for (const skeleton of model.skeletons) {
            skeleton.pose = copyPose(skeleton.bindPose);
            // The gathered list points at the poses that were just replaced.
            live = null;
            // The pose changed outside a frame, so whatever was worked out is stale.
            skeleton.posedOn = -1;
        }
    };

    const start = (name: string, fadeSeconds: number): void => {
        const clip = model.clips[name];
        if (clip === undefined) {
            // An empty table has not arrived yet; one with other names in it is a typo, and that
            // is worth saying out loud.
            if (known().length > 0) {
                console.warn(`[NacatamalOn] useSkeletalAnimation: no movement called '${name}'. It knows: ${known().join(', ')}.`);
                return;
            }
            pending = name;
            return;
        }

        pending = null;

        // Easing only means something when there is something to ease from.
        if (fadeSeconds > 0 && clipName !== null && clipName !== name && model.clips[clipName] !== undefined) {
            from = from ?? roomFor(model);
            to = to ?? roomFor(model);
            fade = { name: clipName, time, elapsed: 0, duration: fadeSeconds, loop, speed, ended: !playing };
        } else {
            fade = null;
        }

        clipName = name;
        time = 0;
        reached = false;
        playing = true;
    };

    /**
     * Moves a clip's own time on, and says whether a clip that does not go round has finished.
     *
     * How it plays is passed in rather than read: the movement being eased out keeps its own.
     */
    const advance = (
        at: number, delta: number, duration: number, loops: boolean, rate: number,
    ): { time: number; ended: boolean } => {
        let next = at + delta * rate;
        if (loops) {
            return { time: duration > 0 ? ((next % duration) + duration) % duration : 0, ended: false };
        }
        if (next >= duration) {
            return { time: duration, ended: true };
        }
        if (next < 0) {
            next = 0;
        }
        return { time: next, ended: false };
    };

    useUpdate((delta) => {
        if (pending !== null) {
            // Cheap while it lasts, and it lasts until the file lands.
            if (model.clips[pending] !== undefined) {
                start(pending, 0);
            }
            return;
        }

        // The file may have arrived with movements nobody named. The first one is a better guess
        // than standing still, and it is what a model with a single movement always wants.
        if (clipName === null && known().length > 0) {
            start(known()[0], 0);
        }

        const clip = clipName === null ? undefined : model.clips[clipName];
        if (!playing || clip === undefined || model.skeletons.length === 0) {
            return;
        }

        const was = time;
        const stepped = advance(time, delta, clip.duration, loop, speed);
        time = stepped.time;

        if (fade !== null && from !== null && to !== null) {
            const outgoing = model.clips[fade.name];
            fade.elapsed += delta;
            const weight = fade.duration > 0 ? Math.min(fade.elapsed / fade.duration, 1) : 1;

            if (outgoing !== undefined) {
                // One that had finished stays on its last frame: it is only being eased away from.
                if (!fade.ended) {
                    const next = advance(fade.time, delta, outgoing.duration, fade.loop, fade.speed);
                    fade.time = next.time;
                    fade.ended = next.ended;
                }
                sampleClip(outgoing, fade.time, from);
                sampleClip(clip, time, to);
                // Mixed as bones, before anything is worked out for the card: a change of movement
                // has to look like joints turning, not like a body melting from one shape to another.
                for (let s = 0; s < model.skeletons.length; s++) {
                    blendPoses(from[s], to[s], weight, model.skeletons[s].pose);
                }
            }
            if (weight >= 1) {
                fade = null;
            }
        } else {
            if (live === null || live.length !== model.skeletons.length) {
                live = model.skeletons.map((skeleton) => skeleton.pose);
            }
            sampleClip(clip, time, live);
        }

        for (const skeleton of model.skeletons) {
            skeleton.posedOn = -1;
        }

        // Told after the bones have been worked out, not before, so a listener that starts another
        // movement changes the next frame rather than half of this one.
        if (delta * speed > 0) {
            const name = clipName as string;
            if (!reached) {
                reached = true;
                markBetween(name, 0, time, true);
            } else if (time < was) {
                // It went round this frame: the tail of the lap that ended, then the head of the
                // one that started.
                markBetween(name, was, clip.duration, false);
                markBetween(name, 0, time, true);
            } else {
                markBetween(name, was, time, false);
            }
        }

        if (stepped.ended) {
            playing = false;
            const ended = clipName as string;
            // Copied first: a listener is allowed to start the next movement, and that must not
            // change the list being walked.
            for (const listener of [...listeners]) {
                listener(ended);
            }
        }
    });

    return {
        play: (clip?: string, withFade?: { fade?: number }) => {
            if (clip === undefined) {
                playing = true;
                return;
            }
            start(clip, withFade?.fade ?? defaultFade);
        },
        pause: () => { playing = false; },
        stop: () => {
            playing = false;
            time = 0;
            reached = false;
            fade = null;
            rest();
        },
        setSpeed: (value: number) => { speed = value; },
        setLoop: (value: boolean) => { loop = value; },
        onEvent: (listener: (event: string, clip: string) => void) => {
            eventListeners.push(listener);
            return () => {
                const at = eventListeners.indexOf(listener);
                if (at >= 0) {
                    eventListeners.splice(at, 1);
                }
            };
        },
        onEnd: (listener: (clip: string) => void) => {
            listeners.push(listener);
            return () => {
                const at = listeners.indexOf(listener);
                if (at >= 0) {
                    listeners.splice(at, 1);
                }
            };
        },
        get playing() { return playing; },
        get clip() { return clipName; },
        get time() { return time; },
    };
};

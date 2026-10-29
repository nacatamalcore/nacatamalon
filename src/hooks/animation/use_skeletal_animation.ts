import { blendPoses, sampleClip } from '../../math/skinning';
import { copyPose, restingJoint } from '../../animation';
import { useUpdate } from '../loop/use_update';
import type { TModel } from '../../gameobjects/model';
import type { TJointPose } from '../../animation';
import type { TSkeletalAnimation, TSkeletalAnimationOptions } from './types/t_skeletal_animation';

/**
 * Somewhere to put a sampled pose, one set per skeleton, made once and written over after that.
 */
const roomFor = (model: TModel): TJointPose[][] =>
    model.skeletons.map((skeleton) => skeleton.pose.map(() => restingJoint()));

/**
 * Makes a placed model move: plays the movements its file came with, and eases between them.
 *
 * A rigged model is a skin stretched over bones. A movement turns the bones, and the skin follows,
 * which is why one model can walk, run and fall over without three copies of it existing.
 *
 * **It moves the model `createModel` gave back, and only that one.** Every model placed from a file
 * has bones of its own, so five enemies of one file can walk, jump and stand still each on their
 * own, each with an animator of its own.
 *
 * **It can be asked for a movement before the file has arrived**, which is the ordinary case: the
 * model comes back still loading, so `play` is remembered and honoured the moment it shows up.
 *
 * `fade` is what makes it look like a character rather than a demo. Asked to change movement over
 * half a second, it turns the bones from where one has them to where the other does; cutting
 * straight across snaps a leg from behind to in front in a single frame.
 *
 * @param model The placed model, from `createModel`.
 * @param options Which movement to start on, and how it plays.
 * @returns The handle: what it is doing, and how to change it.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 200 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     const file = useLoadGltf({ src: '/models/fox.glb' });
 *     const fox = createModel({ model: file });
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
export const useSkeletalAnimation = (model: TModel, options: TSkeletalAnimationOptions = {}): TSkeletalAnimation => {
    // The movements are the file's, read each time because they arrive with it; the bones they
    // turn are this model's own.
    const file = model.model;
    let clipName: string | null = null;
    let playing = false;
    let loop = options.loop ?? true;
    let speed = options.speed ?? 1;
    let time = 0;
    /**
     * How many more times the movement goes after this one, as a tween counts its repeats:
     * `Infinity` for one that goes round for ever, `0` for the last time through.
     */
    let repeatsLeft = Infinity;
    /**
     * How many times it has started again since it was played.
     */
    let repeats = 0;
    let yoyo = options.yoyo ?? false;
    /**
     * `1` going from the start of the movement to its end, `-1` coming back, which a `yoyo` does
     * every other time.
     */
    let direction = 1;
    const defaultFade = options.fade ?? 0;

    // A movement asked for before the file arrived. Kept and honoured the frame it shows up, the
    // same way the sprite animator waits for its sheet.
    let pending: string | null = options.play ?? null;
    // Told when a movement that does not go round reaches its end.
    const listeners: Array<(clip: string) => void> = [];
    // Told each time a movement starts again.
    const repeatListeners: Array<(clip: string, repeats: number) => void> = [];
    // Told when a movement passes one of the moments marked on it.
    const eventListeners: Array<(event: string, clip: string) => void> = [];
    /**
     * Whether the movement playing has had its own beginning counted as passed. Left false when one
     * starts, so a mark at `0` is passed inside the frame loop rather than while the scene is being
     * built: a listener taken on right after this hook would otherwise miss it.
     */
    let reached = false;
    /**
     * How many movements have been started. What a frame passed is told about the movement that
     * passed it: a listener that starts another, the same one again included, leaves the rest of
     * that frame's news unsaid rather than handed to the movement it just started.
     */
    let run = 0;

    /**
     * Tells whoever is listening about every moment marked between two points of a movement.
     *
     * Half open at the start and closed at the end, so a moment is passed exactly once however the
     * frames fall on it. The one exception is the beginning of a lap, which is closed at both ends:
     * a mark at `0` belongs to the time through that is starting.
     */
    const markBetween = (name: string, from: number, to: number, fromStart: boolean): void => {
        const marks = options.clips?.[name]?.events;
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

    const known = (): string[] => Object.keys(file.clips);
    const warnedNext = new Set<string>();

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
        const clip = file.clips[name];
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
        if (fadeSeconds > 0 && clipName !== null && clipName !== name && file.clips[clipName] !== undefined) {
            // Made again if the bones arrived after the room was made for none.
            from = from !== null && from.length === model.skeletons.length ? from : roomFor(model);
            to = to !== null && to.length === model.skeletons.length ? to : roomFor(model);
            fade = { name: clipName, time, elapsed: 0, duration: fadeSeconds, loop: repeatsLeft > 0, speed: speed * direction, ended: !playing };
        } else {
            fade = null;
        }

        run += 1;
        clipName = name;
        time = 0;
        reached = false;
        playing = true;
        // The movement's own first, then the animator's. A negative repeat means for ever, as it does
        // for a tween; with none, `loop` says yes or no.
        const own = options.clips?.[name];
        const repeat = own?.repeat
            ?? (own?.loop !== undefined ? (own.loop ? -1 : 0) : options.repeat ?? (loop ? -1 : 0));
        repeatsLeft = repeat < 0 ? Infinity : repeat;
        repeats = 0;
        yoyo = own?.yoyo ?? options.yoyo ?? false;
        direction = 1;
    };

    /**
     * The stretches of the movement passed forwards this frame, three numbers each (from, to, and 1
     * when `from` is the start of a time through), told as marks once the bones are worked out.
     * Written over every frame, so passing them asks for no memory.
     */
    const passed: number[] = [];
    let passedCount = 0;

    const pass = (from: number, to: number, fromStart: boolean): void => {
        passed[passedCount * 3] = from;
        passed[passedCount * 3 + 1] = to;
        passed[passedCount * 3 + 2] = fromStart ? 1 : 0;
        passedCount++;
        reached = true;
    };

    /**
     * Moves the movement playing on by `delta`, going round, coming back or stopping as it was asked
     * to, and notes what it passed going forwards. Says how many times it started again, and whether
     * it has finished.
     */
    const step = (delta: number, duration: number): { wentRound: number; ended: boolean } => {
        passedCount = 0;
        let wentRound = 0;
        if (duration <= 0) {
            return { wentRound, ended: repeatsLeft <= 0 };
        }
        let rate = speed * direction;
        let at = time;
        let next = time + delta * rate;
        // The first stretch of a time through counts its own beginning: a mark at `0` belongs to it.
        let fromStart = !reached;
        for (;;) {
            if (rate > 0 && next >= duration) {
                pass(at, duration, fromStart);
                if (repeatsLeft <= 0) {
                    time = duration;
                    return { wentRound, ended: true };
                }
                repeatsLeft -= 1;
                repeats += 1;
                wentRound += 1;
                if (yoyo) {
                    // Turned back at the end: the way past it is the way back from it.
                    next = 2 * duration - next;
                    direction = -direction;
                    rate = -rate;
                    at = duration;
                    fromStart = false;
                } else {
                    next -= duration;
                    at = 0;
                    fromStart = true;
                }
                continue;
            }
            if (rate < 0 && next <= 0) {
                if (repeatsLeft <= 0) {
                    time = 0;
                    return { wentRound, ended: true };
                }
                repeatsLeft -= 1;
                repeats += 1;
                wentRound += 1;
                if (yoyo) {
                    next = -next;
                    direction = -direction;
                    rate = -rate;
                    at = 0;
                    fromStart = true;
                } else {
                    next += duration;
                    at = duration;
                    fromStart = false;
                }
                continue;
            }
            // Backwards passes no marks, as it always has: it is the movement undone.
            if (rate > 0) {
                pass(at, next, fromStart);
            }
            time = next;
            return { wentRound, ended: false };
        }
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
            if (file.clips[pending] !== undefined) {
                start(pending, 0);
            }
            return;
        }

        // The file may have arrived with movements nobody named. The first one is a better guess
        // than standing still, and it is what a model with a single movement always wants.
        if (clipName === null && known().length > 0) {
            start(known()[0], 0);
        }

        const clip = clipName === null ? undefined : file.clips[clipName];
        if (!playing || clip === undefined || model.skeletons.length === 0) {
            return;
        }

        const stepped = step(delta, clip.duration);

        if (fade !== null && from !== null && to !== null) {
            const outgoing = file.clips[fade.name];
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
        // movement changes the next frame rather than half of this one. A frame that went round
        // passed the tail of the time that ended, then the head of the one that started.
        const name = clipName as string;
        const moved = run;
        for (let p = 0; p < passedCount && run === moved; p++) {
            markBetween(name, passed[p * 3]!, passed[p * 3 + 1]!, passed[p * 3 + 2] === 1);
        }
        if (stepped.wentRound > 0) {
            // Each time round on its own, so a count kept by a listener is never one short.
            for (let n = repeats - stepped.wentRound + 1; n <= repeats && run === moved; n++) {
                for (const listener of [...repeatListeners]) {
                    listener(name, n);
                }
            }
        }

        // Not when a listener has started another movement: the end was this one's, and stopping
        // here would stop the one that has only just begun.
        if (stepped.ended && run === moved) {
            playing = false;
            const ended = clipName as string;
            // Copied first: a listener is allowed to start the next movement, and that must not
            // change the list being walked.
            for (const listener of [...listeners]) {
                listener(ended);
            }
            // What the movement says comes after it, unless a listener has already started
            // something else: what a script asks for on the spot wins over what was said in general.
            const next = options.clips?.[ended]?.next;
            if (next !== undefined && !playing && run === moved) {
                if (file.clips[next] !== undefined) {
                    start(next, defaultFade);
                } else if (!warnedNext.has(next)) {
                    // Said once per missing name, not every time it ends. It rests where it ended.
                    warnedNext.add(next);
                    console.warn(`[NacatamalOn] useSkeletalAnimation: no movement called '${next}' to play after '${ended}'. It knows: ${known().join(', ')}.`);
                }
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
        setLoop: (value: boolean) => {
            loop = value;
            repeatsLeft = value ? Infinity : 0;
        },
        onEvent: (listener: (event: string, clip: string) => void) => {
            eventListeners.push(listener);
            return () => {
                const at = eventListeners.indexOf(listener);
                if (at >= 0) {
                    eventListeners.splice(at, 1);
                }
            };
        },
        onRepeat: (listener: (clip: string, repeats: number) => void) => {
            repeatListeners.push(listener);
            return () => {
                const at = repeatListeners.indexOf(listener);
                if (at >= 0) {
                    repeatListeners.splice(at, 1);
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

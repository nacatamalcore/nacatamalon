import { blendPoses, sampleClip } from '../../math/skinning';
import { copyJointInto, restingJoint } from '../../animation';
import { addBoneLayer, holdBelowIn, readyBoneLayer } from './bone_layer';
import { useUpdate } from '../loop/use_update';
import { useCleanup } from '../scene/use_cleanup';
import type { TBoneLayer } from './bone_layer';
import type { TModel } from '../../gameobjects/model';
import type { TSkeletalClip, TJointPose } from '../../animation';
import type { TSkeletalAnimation, TSkeletalAnimationOptions } from './types/t_skeletal_animation';

/**
 * Somewhere to put a sampled pose, one set per skeleton, made once and written over after that.
 */
const roomFor = (model: TModel): TJointPose[][] =>
    model.skeletons.map((skeleton) => skeleton.pose.map(() => restingJoint()));

/**
 * Writes how the bones stand now into a room. A movement only writes the bones it turns, so the rest
 * of them have to start somewhere: where they are, or easing would take them all to nothing.
 */
const holdPoseIn = (model: TModel, room: TJointPose[][]): void => {
    model.skeletons.forEach((skeleton, s) => {
        skeleton.pose.forEach((joint, j) => {
            copyJointInto(joint, room[s][j]);
        });
    });
};

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
 * **`only` plays a movement on part of the body**, the rest carrying on with what it was doing: a
 * second animator on the same model, its bones named, shows over the first. The last one made goes
 * on top. With nothing playing it leaves those bones to the one below, and a movement that ends
 * hands them back, eased by its `fade`.
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
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 20 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     const hero = createModel({ model: useLoadGltf({ src: '/models/hero.glb' }) });
 *     useSkeletalAnimation(hero, { play: 'run' });
 *     const top = useSkeletalAnimation(hero, { only: ['spine'], fade: 0.2, clips: { greet: { loop: false } } });
 *
 *     const keys = useKeyboard();
 *     useUpdate(() => {
 *         if (keys.justPressed('Space')) top.play('greet');
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
    const only = options.only;
    /**
     * Whether it is handing its bones back to what is below, or has. Only with `only`.
     */
    let letGo = true;
    /**
     * How long `reach` takes to go all the way, in seconds.
     */
    let reachFade = defaultFade;

    // A movement asked for before the file arrived. Kept and honoured the frame it shows up, the
    // same way the sprite animator waits for its sheet.
    let pending: string | null = options.play ?? null;
    /**
     * How long the movement that was kept was asked to take easing in.
     */
    let pendingFade = defaultFade;
    /**
     * Whether it was stopped before anything had played. It stays stopped when the file lands, rather
     * than taking the first movement the file has.
     */
    let stoppedBefore = false;
    /**
     * The movement that was waiting when it was stopped before anything had played, for a `play` with
     * no name to go back to.
     */
    let stoppedPending: string | null = null;
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
     * How many movements have been started or stopped. What a frame passed is told about the movement
     * that passed it: a listener that starts another, the same one again included, or stops it, leaves
     * the rest of that frame's news unsaid rather than handed to the movement it just started.
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
        const moved = run;
        for (const mark of marks) {
            const passed = fromStart ? mark.at >= from && mark.at <= to : mark.at > from && mark.at <= to;
            if (passed) {
                // Everyone listening hears the mark that was passed; it is the next ones that belong
                // to a movement no longer playing.
                for (const listener of told) {
                    listener(mark.name, name);
                }
                if (run !== moved) {
                    return;
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
        name: string; time: number; elapsed: number; weight: number; duration: number;
        loop: boolean; speed: number; ended: boolean;
    } | null = null;

    const known = (): string[] => Object.keys(file.clips);
    /**
     * Whether the file is here to be asked, which an empty table of movements does not say: it may
     * still be on its way, or have arrived with none.
     */
    const arrived = (): boolean => file.status === 'ready' || known().length > 0;
    const warnedNext = new Set<string>();

    /**
     * Puts the bones back the way the model was made.
     */
    const rest = (): void => {
        for (const skeleton of model.skeletons) {
            // Written over rather than replaced: another animator on this model may hold these.
            skeleton.pose.forEach((joint, j) => { copyJointInto(skeleton.bindPose[j], joint); });
            // The pose changed outside a frame, so whatever was worked out is stale.
            skeleton.posedOn = -1;
        }
    };

    const start = (name: string, fadeSeconds: number): void => {
        const clip = file.clips[name];
        if (clip === undefined) {
            // A file still on its way is waited for; one that is here without that name is a typo,
            // and that is worth saying out loud.
            if (arrived()) {
                const has = known().length > 0 ? `It knows: ${known().join(', ')}` : 'The file has none';
                console.warn(`[NacatamalOn] useSkeletalAnimation: no movement called '${name}'. ${has}.`);
                return;
            }
            pending = name;
            pendingFade = fadeSeconds;
            stoppedBefore = false;
            return;
        }

        pending = null;

        // Easing only means something when there is something to ease from. A part of the body
        // showing nothing eases in from what is below instead, by its `reach`; one on its way out
        // that is asked for the same movement again eases from where that was.
        const showing = layer !== null && layer.reach > 0;
        const eases = layer === null ? clipName !== name : showing && (clipName !== name || letGo);
        if (fadeSeconds > 0 && clipName !== null && eases && file.clips[clipName] !== undefined) {
            // Made again if the bones arrived after the room was made for none.
            from = from !== null && from.length === model.skeletons.length ? from : roomFor(model);
            to = to !== null && to.length === model.skeletons.length ? to : roomFor(model);
            holdPoseIn(model, from);
            holdPoseIn(model, to);
            fade = { name: clipName, time, elapsed: 0, weight: 0, duration: fadeSeconds, loop: repeatsLeft > 0, speed: speed * direction, ended: !playing };
        } else {
            fade = null;
        }

        letGo = false;
        stoppedBefore = false;
        reachFade = fadeSeconds;
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

    /**
     * Moves on the movement being eased away from, and how far the easing has gone.
     */
    const moveFade = (delta: number): void => {
        if (fade === null) {
            return;
        }
        fade.elapsed += delta;
        fade.weight = fade.duration > 0 ? Math.min(fade.elapsed / fade.duration, 1) : 1;
        const outgoing = file.clips[fade.name];
        // One that had finished stays on its last frame: it is only being eased away from.
        if (outgoing !== undefined && !fade.ended) {
            const next = advance(fade.time, delta, outgoing.duration, fade.loop, fade.speed);
            fade.time = next.time;
            fade.ended = next.ended;
        }
    };

    /**
     * Writes how the movement playing has the bones into `poses`, mixed with the one before it if it
     * is still being eased away from.
     */
    const samplePlaying = (clip: TSkeletalClip, poses: TJointPose[][]): void => {
        if (fade !== null && from !== null && to !== null) {
            const outgoing = file.clips[fade.name];
            if (outgoing !== undefined) {
                sampleClip(outgoing, fade.time, from);
                sampleClip(clip, time, to);
                // Mixed as bones, before anything is worked out for the card: a change of movement
                // has to look like joints turning, not like a body melting from one shape to another.
                for (let s = 0; s < model.skeletons.length; s++) {
                    blendPoses(from[s], to[s], fade.weight, poses[s]);
                }
            }
            if (fade.weight >= 1) {
                fade = null;
            }
        } else {
            sampleClip(clip, time, poses);
        }
    };

    /**
     * What an animator with `only` shows over the rest of the body. Only then is its movement read,
     * when what is below is known, however the boxes that hold the animators are arranged.
     */
    const layer = only === undefined ? null : {
        only,
        reach: 0,
        bones: null,
        shown: [],
        sample: (s: number, below: TJointPose[]): void => {
            const clip = clipName === null ? undefined : file.clips[clipName];
            if (clip === undefined || layer === null) {
                return;
            }
            holdBelowIn(layer, s, below, layer.shown);
            if (fade !== null && from !== null && to !== null) {
                holdBelowIn(layer, s, below, from);
                holdBelowIn(layer, s, below, to);
            }
            samplePlaying(clip, layer.shown);
        },
    } as TBoneLayer;
    if (layer !== null) {
        useCleanup(addBoneLayer(model, layer));
    }

    /**
     * Moves how far a part of the body shows, towards all of it or towards handing its bones back.
     */
    const moveReach = (delta: number): void => {
        if (layer === null) {
            return;
        }
        const pace = reachFade > 0 ? delta / reachFade : 1;
        layer.reach = letGo ? Math.max(layer.reach - pace, 0) : Math.min(layer.reach + pace, 1);
        // All handed back: it starts over the next time it is played.
        if (letGo && layer.reach === 0) {
            fade = null;
            time = 0;
            reached = false;
        }
    };

    useUpdate((delta) => {
        if (pending !== null) {
            // Cheap while it lasts, and it lasts until the file lands.
            if (file.clips[pending] !== undefined) {
                start(pending, pendingFade);
            } else if (arrived()) {
                // The file is here and that name is not in it, which `start` says out loud. Waiting
                // any longer would be waiting for ever.
                const missing = pending;
                pending = null;
                start(missing, pendingFade);
            }
            return;
        }

        // The file may have arrived with movements nobody named. The first one is a better guess
        // than standing still, and it is what a model with a single movement always wants.
        if (clipName === null && only === undefined && !stoppedBefore && known().length > 0) {
            start(known()[0], 0);
        }

        const clip = clipName === null ? undefined : file.clips[clipName];
        if (clip === undefined || model.skeletons.length === 0) {
            return;
        }
        if (layer !== null) {
            readyBoneLayer(model, layer);
            moveReach(delta);
        }
        if (!playing) {
            // A part of the body on its way out is still moving, though its movement is not.
            if (layer !== null) {
                for (const skeleton of model.skeletons) {
                    skeleton.posedOn = -1;
                }
            }
            return;
        }

        const stepped = step(delta, clip.duration);

        moveFade(delta);
        if (layer === null) {
            if (live === null || live.length !== model.skeletons.length) {
                live = model.skeletons.map((skeleton) => skeleton.pose);
            }
            samplePlaying(clip, live);
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
            // A part of the body with nothing left to play hands its bones back, unless a listener
            // or what comes next starts something.
            if (layer !== null) {
                letGo = true;
                reachFade = defaultFade;
            }
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
                // Stopped before anything played: back to waiting for what it was waiting for.
                if (stoppedBefore) {
                    stoppedBefore = false;
                    pending = stoppedPending;
                    stoppedPending = null;
                    playing = layer === null;
                    return;
                }
                // A part of the body that was stopped or has ended has nothing to carry on with, and
                // goes again as it would when named.
                if (layer !== null && letGo) {
                    if (clipName !== null) {
                        start(clipName, defaultFade);
                    }
                    return;
                }
                playing = true;
                return;
            }
            start(clip, withFade?.fade ?? defaultFade);
        },
        pause: () => { playing = false; },
        stop: () => {
            playing = false;
            reached = false;
            stoppedBefore = clipName === null;
            if (stoppedBefore) {
                stoppedPending = pending ?? stoppedPending;
            }
            pending = null;
            // What a frame was going to say next is not said: not even what comes after this one.
            run += 1;
            // A part of the body hands its bones back, eased, and has no rest of its own to go to.
            if (layer !== null) {
                letGo = true;
                reachFade = defaultFade;
                return;
            }
            time = 0;
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

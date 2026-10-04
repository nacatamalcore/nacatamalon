import { setSpriteFrame } from '../../atlas';
import { rememberSpriteAnimation } from './get_sprite_animation';
import type { TClipEvent } from '../../animation';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import { useUpdate } from '../loop';
import type { TSpriteAnimation, TSpriteAnimationOptions } from './types/t_sprite_animation';

/**
 * The pace of a clip that does not say, in frames per second.
 */
const DEFAULT_FPS = 12;

/**
 * Shared by every clip that marks no moments, so the ordinary case asks for no memory.
 */
const NO_EVENTS: readonly TClipEvent[] = [];

/**
 * Plays a sprite's pictures in order, so it walks, attacks or spins.
 *
 * A sheet already holds every picture and a sprite already shows one of them: animating is
 * deciding which one, and when. That is all this does, once per frame, so the renderer never
 * learns that animation exists.
 *
 * The sprite has to come from a sheet (`createSprite({ atlas })`), since that is where the frames
 * are. Call it while the scene is being built, like every hook, and keep what it returns to change
 * clips later.
 *
 * @param sprite The sprite to animate.
 * @param options The runs it knows, which one to start with, and how fast.
 *
 * @example
 * ```ts
 * declare const walk: TSpriteAtlas;
 * declare let hurt: boolean;
 *
 * const enemy = createSprite({ atlas: walk, frame: 0, transform: { x: 80, y: 120 } });
 *
 * const anim = useSpriteAnimation(enemy, {
 *     clips: {
 *         walk: { frames: [0, 1, 2, 3, 4, 5], fps: 12 },
 *         hit: { frames: [6, 7], fps: 20, loop: false },
 *     },
 *     play: 'walk',
 * });
 *
 * useUpdate(() => {
 *     if (hurt) anim.play('hit');
 * });
 * ```
 *
 * @returns Its controls: `play`, `stop`, `setSpeed`, what is `playing` and on which `frame`.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSpriteAnimation = (sprite: TSprite, options: TSpriteAnimationOptions): TSpriteAnimation => {
    let clipName: string | null = null;
    let frames: readonly number[] = [];
    let step = 0;
    let index = 0;
    let loop = true;
    let playing = false;
    let elapsed = 0;
    let speed = options.speed ?? 1;
    // A clip asked for before it exists. Clips can come from a file (`useLoadAtlas`), so the
    // table a scene hands over may still be empty when the scene is built: the request is kept
    // and honoured the moment the clip shows up.
    let pending: string | null = null;
    /**
     * The moments marked on the clip playing now.
     */
    let events: readonly TClipEvent[] = NO_EVENTS;
    /**
     * Whether the picture the run is on has been counted as reached. Starting a clip leaves this
     * false so the first picture is reached inside the frame loop and not while the scene is still
     * being built: a listener taken on right after this hook would otherwise miss a mark at `0`.
     */
    let reached = false;
    const endListeners: Array<(clip: string) => void> = [];
    const eventListeners: Array<(event: string, clip: string) => void> = [];

    /**
     * Tells whoever is listening about every moment marked on the picture just reached.
     */
    const mark = (at: number): void => {
        if (events.length === 0 || eventListeners.length === 0) {
            return;
        }
        const clip = clipName as string;
        // Copied first: a listener is allowed to start another run, and that must not change the
        // list being walked.
        const told = [...eventListeners];
        for (const event of events) {
            if (event.at === at) {
                for (const listener of told) {
                    listener(event.name, clip);
                }
            }
        }
    };

    const show = (): void => {
        const frame = frames[index];
        if (frame !== undefined) {
            setSpriteFrame(sprite, frame);
        }
    };

    const play = (name: string): void => {
        const clip = options.clips[name];
        if (clip === undefined) {
            // An empty table has not arrived yet; one with other names in it is a typo, and that
            // is worth saying out loud.
            if (Object.keys(options.clips).length > 0) {
                console.warn(`[NacatamalOn] useSpriteAnimation: no clip called '${name}'. It knows: ${Object.keys(options.clips).join(', ')}.`);
                return;
            }
            pending = name;
            return;
        }

        pending = null;

        clipName = name;
        frames = clip.frames;
        // Seconds per frame, worked out once per clip rather than every frame.
        step = 1 / (clip.fps ?? DEFAULT_FPS);
        loop = clip.loop ?? true;
        events = clip.events ?? NO_EVENTS;
        index = 0;
        elapsed = 0;
        reached = false;
        playing = frames.length > 0;
        show();
    };

    // Said once per missing name, not every time the run ends, which would be once a second for
    // ever. Not fatal: the run rests on its last picture, so a renamed run degrades instead of
    // breaking the scene.
    const warnedNext = new Set<string>();
    const playNext = (next: string | undefined): void => {
        if (next === undefined) {
            return;
        }
        if (options.clips[next] === undefined) {
            if (!warnedNext.has(next)) {
                warnedNext.add(next);
                console.warn(`[NacatamalOn] useSpriteAnimation: no clip called '${next}' to play after '${clipName}'.`);
            }
            return;
        }
        play(next);
    };

    useUpdate((delta) => {
        if (pending !== null) {
            // Cheap while it lasts, and it lasts until the sheet lands.
            if (options.clips[pending] !== undefined) {
                play(pending);
            }
            return;
        }

        if (!playing || frames.length === 0) {
            return;
        }

        if (!reached) {
            reached = true;
            mark(index);
        }

        elapsed += delta * speed;
        let finished = false;

        // A `while`, not an `if`: a long frame or a fast clip can cross several pictures at once,
        // and skipping them is better than falling behind for ever.
        while (elapsed >= step) {
            elapsed -= step;
            index++;

            if (index >= frames.length) {
                if (!loop) {
                    // Rests on the last picture rather than snapping back to the first: a death
                    // animation that returns to standing is not what anybody meant.
                    index = frames.length - 1;
                    playing = false;
                    finished = true;
                    break;
                }
                index = 0;
            }
            // Every picture the run lands on is a picture it reached, the ones a long frame skipped
            // over included: a blow that stops landing when the machine stutters is worse than one
            // that lands late.
            mark(index);
        }

        show();

        if (finished) {
            const ended = clipName as string;
            // Shown before telling anybody, and the list copied, because a listener is very likely
            // to start the next run from in here.
            for (const listener of [...endListeners]) {
                listener(ended);
            }
            // The file's own follow-up, unless a listener has already started something else: what
            // a script asks for on the spot wins over what the sheet says in general.
            if (!playing && clipName === ended) {
                playNext(options.clips[ended]?.next);
            }
        }
    });

    if (options.play !== undefined) {
        play(options.play);
    }

    const animation: TSpriteAnimation = {
        play,
        stop: () => { playing = false; },
        setSpeed: (value: number) => { speed = value; },
        get playing() { return playing; },
        get clip() { return clipName; },
        get frame() { return frames[index] ?? 0; },
        onEnd: (listener: (clip: string) => void) => {
            endListeners.push(listener);
            return () => {
                const at = endListeners.indexOf(listener);
                if (at >= 0) {
                    endListeners.splice(at, 1);
                }
            };
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
    };
    rememberSpriteAnimation(sprite, animation);
    return animation;
};

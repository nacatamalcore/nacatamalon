import type { TRuntimeStore } from '../store';
import { BROWSER_PAUSE } from '../game/bootstrap/watch_visibility';
import type { TAudioClock, TAudioManager, TVoice } from './types/t_audio';

/**
 * The channel a sound belongs to when it does not say.
 */
export const DEFAULT_CHANNEL = 'sfx';

/**
 * How far a placed sound carries at full volume, in pixels, when nobody says.
 */
export const DEFAULT_REF_DISTANCE = 100;

/**
 * Past this many pixels a placed sound is not heard, when nobody says.
 */
export const DEFAULT_MAX_DISTANCE = 2000;

/**
 * The same two, for a scene seen through a perspective camera, which measures in units.
 */
export const DEFAULT_REF_DISTANCE_3D = 1;
export const DEFAULT_MAX_DISTANCE_3D = 20;

/**
 * The channels every game starts with, so a menu can move them before anything has played.
 */
const BUILT_IN_CHANNELS = [DEFAULT_CHANNEL, 'music'];

/**
 * Opens one game's sound: the browser's audio engine, the master volume everything ends in, and the
 * two channels a game is expected to have.
 *
 * Browsers start the audio engine **stopped** and only let it run after the person has touched the
 * page: without that, any site could make noise the moment it opened. Rather than ask the game to
 * handle it, this listens once for the first click, touch or key anywhere on the page, starts the
 * engine and forgets the listeners. So the first thing the player does is what turns the sound on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createAudioManager = (): TAudioManager => {
    const context = new AudioContext();
    const master = context.createGain();
    master.connect(context.destination);

    const channels = new Map<string, GainNode>();
    const duckGains = new Map<string, GainNode>();
    const voices = new Set<TVoice>();

    const channelGain = (name: string): GainNode => {
        let gain = channels.get(name);
        if (gain === undefined) {
            gain = context.createGain();
            gain.connect(master);
            channels.set(name, gain);
        }
        return gain;
    };

    // Put in the first time a sound holds the channel down, between the channel and the master, so
    // a game that never ducks carries no extra node.
    const duckGain = (name: string): GainNode => {
        let duck = duckGains.get(name);
        if (duck === undefined) {
            const channel = channelGain(name);
            duck = context.createGain();
            duck.connect(master);
            channel.disconnect();
            channel.connect(duck);
            duckGains.set(name, duck);
        }
        return duck;
    };
    for (const name of BUILT_IN_CHANNELS) {
        channelGain(name);
    }

    let clock: TAudioClock = 'audio';
    // The frames' clock, moved on by `advance` while it is the one counted by.
    let frameTime = 0;
    // Whether the person has touched the page, so the audio engine may run.
    let unlocked = false;
    // Whether the page cannot be seen and the game asked for its sound to stop meanwhile.
    let hidden = false;
    const resyncs = new Set<() => () => void>();

    // The audio engine runs when the person has touched the page, the clock is its own (not the
    // frames', where it is held still) and the page can be seen: asked in one place, so coming back
    // to the page never sets running what an editor holds still, nor the other way round.
    const settle = (): void => {
        if (unlocked && clock === 'audio' && !hidden) {
            void context.resume();
        } else if (clock === 'frames' || hidden) {
            void context.suspend();
        }
    };

    const unlock = (): void => {
        unlocked = true;
        settle();
        removeUnlock();
    };
    // Guarded because a test has no page: everything else about sound can be checked without one.
    const listening = typeof window !== 'undefined';
    const removeUnlock = (): void => {
        if (!listening) {
            return;
        }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
    };
    if (listening) {
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
        window.addEventListener('touchstart', unlock);
    }

    return {
        context,
        master,
        channels,
        duckGains,
        duckTargets: new Map(),
        voices,
        tickers: new Set(),
        offset: 0,
        // Under the frames' clock nothing reaches a speaker, so nothing is late.
        heardDelay() {
            if (clock === 'frames') {
                return 0;
            }
            return Math.max(0, (context.outputLatency || 0) + (context.baseLatency || 0) + this.offset);
        },
        listeners: [],
        warnedListeners: false,
        warnedZones: new WeakSet(),
        now: () => (clock === 'frames' ? frameTime : context.currentTime),
        get clock() {
            return clock;
        },
        setClock: (next) => {
            if (next === clock) {
                return;
            }
            if (next === 'frames') {
                frameTime = context.currentTime;
                clock = 'frames';
                settle();
                return;
            }
            // Where every tune is, read on the frames' clock before it stops counting.
            const after = [...resyncs].map((resync) => resync());
            clock = 'audio';
            settle();
            for (const put of after) {
                put();
            }
        },
        setHidden: (next) => {
            if (next === hidden) {
                return;
            }
            hidden = next;
            settle();
        },
        advance: (dt) => {
            if (clock === 'frames') {
                frameTime += dt;
            }
        },
        resyncs,
        log: null,
        channelGain,
        duckGain,
        destroy: () => {
            removeUnlock();
            for (const voice of voices) {
                // `stop` throws on a node that never started, and a teardown must never stop halfway.
                try { voice.node.stop(); } catch { /* never started */ }
                voice.node.disconnect();
            }
            voices.clear();
            void context.close();
        },
    };
};

/**
 * The game's sound, opened the first time anything asks for it. This lazy step is the whole reason a
 * game that never plays a sound never opens an audio engine, which browsers count and phones charge
 * battery for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getAudioManager = (store: TRuntimeStore): TAudioManager => {
    const current = store.get('audio').manager;
    if (current !== null) {
        return current;
    }
    const manager = createAudioManager();
    manager.setClock(store.get('audio').clock);
    // Opened while the browser holds the game for a hidden page: held still with it.
    if (store.get('loop').pausedBy.includes(BROWSER_PAUSE)) {
        manager.setHidden(true);
    }
    store.setState('audio', { manager });
    return manager;
};

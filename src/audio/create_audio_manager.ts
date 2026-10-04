import type { TRuntimeStore } from '../store';
import type { TAudioManager, TVoice } from './types/t_audio';

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
    for (const name of BUILT_IN_CHANNELS) {
        channelGain(name);
    }

    const unlock = (): void => {
        void context.resume();
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
        voices,
        listeners: [],
        warnedListeners: false,
        warnedZones: new WeakSet(),
        channelGain,
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
    store.setState('audio', { manager });
    return manager;
};

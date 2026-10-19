/**
 * A WebAudio with nothing behind it, for a game with no browser: every node connects, every knob
 * moves and every sound starts and ends, and nothing is heard. Only what the engine asks of WebAudio
 * is here; its sounds run their course by the game's own clock, so a sound waited on still ends.
 */

type TParam = {
    value: number;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    cancelScheduledValues(time: number): void;
};

const param = (value: number): TParam => ({
    value,
    setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    cancelScheduledValues() {},
});

const node = () => ({
    connect() {},
    disconnect() {},
});

/**
 * How long a decoded sound says it lasts. Nothing is decoded, so every sound is a second long.
 */
const DECODED_SECONDS = 1;

/**
 * A constructor in place of `AudioContext`, for `globalThis` where there is none.
 */
export function SilentAudioContext(this: unknown) {
    const sampleRate = 44100;
    return {
        currentTime: 0,
        sampleRate,
        state: 'running',
        destination: node(),
        listener: {
            positionX: param(0), positionY: param(0), positionZ: param(0),
            forwardX: param(0), forwardY: param(0), forwardZ: param(-1),
            upX: param(0), upY: param(1), upZ: param(0),
        },
        createBuffer: (_channels: number, length: number, rate: number) => ({
            duration: length / rate,
            length,
            sampleRate: rate,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(length),
            copyToChannel() {},
        }),
        createGain: () => ({ ...node(), gain: param(1) }),
        createBufferSource: () => ({
            ...node(),
            buffer: null,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            playbackRate: param(1),
            onended: null as (() => void) | null,
            start() {},
            stop() { this.onended?.(); },
        }),
        createPanner: () => ({
            ...node(),
            panningModel: '',
            distanceModel: '',
            refDistance: 1,
            maxDistance: 10000,
            rolloffFactor: 1,
            positionX: param(0), positionY: param(0), positionZ: param(0),
            orientationX: param(1), orientationY: param(0), orientationZ: param(0),
            coneInnerAngle: 360,
            coneOuterAngle: 360,
            coneOuterGain: 0,
        }),
        decodeAudioData: async () => ({
            duration: DECODED_SECONDS,
            length: DECODED_SECONDS * sampleRate,
            sampleRate,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(DECODED_SECONDS * sampleRate),
        }),
        resume: async () => {},
        suspend: async () => {},
        close: async () => {},
    };
}

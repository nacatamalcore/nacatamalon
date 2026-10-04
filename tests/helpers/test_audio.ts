/**
 * A browser audio engine with nothing behind it.
 *
 * WebAudio does not exist in bun, and what these tests check is not the sound: it is the wiring (what
 * connects to what), the numbers (volume, speed, distance) and the moments (start, stop, resume).
 * That is all recorded here.
 */

/**
 * A knob that can be moved over time. What was scheduled on it is kept in order, and a ramp lands
 * at once on its target: these tests check what was asked for, not how it sounds on the way.
 */
export type TFakeParam = {
    value: number;
    /**
     * Everything scheduled, in order: `set` at a time, `ramp` to a value by a time, `cancel` from a time.
     */
    events: Array<{ kind: 'set' | 'ramp' | 'cancel'; value: number; time: number }>;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    cancelScheduledValues(time: number): void;
};

const param = (value: number): TFakeParam => ({
    value,
    events: [],
    setValueAtTime(next: number, time: number) { this.events.push({ kind: 'set', value: next, time }); this.value = next; },
    linearRampToValueAtTime(next: number, time: number) { this.events.push({ kind: 'ramp', value: next, time }); this.value = next; },
    cancelScheduledValues(time: number) { this.events.push({ kind: 'cancel', value: this.value, time }); },
});

export type TFakeNode = {
    kind: string;
    /**
     * What this node is plugged into.
     */
    connectedTo: TFakeNode | null;
    connect(target: TFakeNode): void;
    disconnect(): void;
};

export type TFakeGain = TFakeNode & { gain: TFakeParam };

export type TFakeSource = TFakeNode & {
    buffer: unknown;
    loop: boolean;
    playbackRate: TFakeParam;
    onended: (() => void) | null;
    started: boolean;
    stopped: boolean;
    /**
     * Where in the sound it was started, in seconds.
     */
    startOffset: number;
    /**
     * When on the audio clock it was asked to start.
     */
    startAt: number;
    /**
     * When on the audio clock it was asked to stop: `0` is at once.
     */
    stopAt: number;
    start(when?: number, offset?: number): void;
    stop(when?: number): void;
};

export type TFakePanner = TFakeNode & {
    panningModel: string;
    distanceModel: string;
    refDistance: number;
    maxDistance: number;
    positionX: TFakeParam;
    positionY: TFakeParam;
    positionZ: TFakeParam;
    orientationX: TFakeParam;
    orientationY: TFakeParam;
    orientationZ: TFakeParam;
    coneInnerAngle: number;
    coneOuterAngle: number;
    coneOuterGain: number;
};

export type TFakeListener = {
    positionX: TFakeParam;
    positionY: TFakeParam;
    positionZ: TFakeParam;
    forwardX: TFakeParam;
    forwardY: TFakeParam;
    forwardZ: TFakeParam;
    upX: TFakeParam;
    upY: TFakeParam;
    upZ: TFakeParam;
};

export type TFakeContext = {
    currentTime: number;
    destination: TFakeNode;
    listener: TFakeListener;
    state: string;
    closed: boolean;
    /**
     * Every source ever created, in order, so a test can count how many voices played.
     */
    sources: TFakeSource[];
    gains: TFakeGain[];
    panners: TFakePanner[];
    resumes: number;
    createGain(): TFakeGain;
    createBufferSource(): TFakeSource;
    createPanner(): TFakePanner;
    decodeAudioData(data: ArrayBuffer): Promise<unknown>;
    resume(): Promise<void>;
    close(): Promise<void>;
};

const node = (kind: string): TFakeNode => ({
    kind,
    connectedTo: null,
    connect(target: TFakeNode) { this.connectedTo = target; },
    disconnect() { this.connectedTo = null; },
});

/**
 * How long the decoded sounds say they last, so `pause` has something to work with.
 */
export const FAKE_DURATION = 4;

export const createFakeAudioContext = (): TFakeContext => {
    const context: TFakeContext = {
        currentTime: 0,
        destination: node('destination'),
        listener: {
            positionX: param(0), positionY: param(0), positionZ: param(0),
            forwardX: param(0), forwardY: param(0), forwardZ: param(-1),
            upX: param(0), upY: param(1), upZ: param(0),
        },
        state: 'suspended',
        closed: false,
        sources: [],
        gains: [],
        panners: [],
        resumes: 0,
        createGain: () => {
            const gain = { ...node('gain'), gain: param(1) } as TFakeGain;
            context.gains.push(gain);
            return gain;
        },
        createBufferSource: () => {
            const source = {
                ...node('source'),
                buffer: null,
                loop: false,
                playbackRate: param(1),
                onended: null,
                started: false,
                stopped: false,
                startOffset: 0,
                startAt: 0,
                stopAt: 0,
                start(when = 0, offset = 0) { this.started = true; this.startAt = when; this.startOffset = offset; },
                stop(when = 0) {
                    if (!this.started) throw new Error('not started');
                    this.stopped = true;
                    this.stopAt = when;
                    // The browser tells whoever was listening, and so does this.
                    this.onended?.();
                },
            } as TFakeSource;
            context.sources.push(source);
            return source;
        },
        createPanner: () => {
            const panner = {
                ...node('panner'),
                panningModel: '',
                distanceModel: '',
                refDistance: 1,
                maxDistance: 10000,
                positionX: param(0),
                positionY: param(0),
                positionZ: param(0),
                orientationX: param(1),
                orientationY: param(0),
                orientationZ: param(0),
                coneInnerAngle: 360,
                coneOuterAngle: 360,
                coneOuterGain: 0,
            } as TFakePanner;
            context.panners.push(panner);
            return panner;
        },
        decodeAudioData: async () => ({ duration: FAKE_DURATION }),
        resume: async () => { context.resumes += 1; context.state = 'running'; },
        close: async () => { context.closed = true; },
    };
    return context;
};

/**
 * Every context built while this was installed, newest last.
 */
export const installFakeAudio = (): { contexts: TFakeContext[]; restore: () => void } => {
    const contexts: TFakeContext[] = [];
    const previous = (globalThis as { AudioContext?: unknown }).AudioContext;
    (globalThis as { AudioContext?: unknown }).AudioContext = function FakeAudioContext() {
        const context = createFakeAudioContext();
        contexts.push(context);
        return context;
    } as unknown as typeof AudioContext;
    return {
        contexts,
        restore: () => { (globalThis as { AudioContext?: unknown }).AudioContext = previous; },
    };
};

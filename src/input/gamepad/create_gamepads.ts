import { deadzoneRadial, deadzoneScalar } from './deadzone';
import { GAMEPAD_AXES, GAMEPAD_BUTTONS, gamepadAxisIndex, gamepadButtonIndex } from './gamepad_standard';
import type { TGamepad, TGamepadInfo, TGamepadListener, TGamepadSource, TGamepadTarget, TRumbleOptions, TUseGamepadOptions } from './types/t_gamepad';

/**
 * How many ports the browser hands out, and so how far "the first connected" looks.
 */
const GAMEPAD_PORTS = 4;
/**
 * Longer than this and the browser cuts the vibration without saying so.
 */
const MAX_RUMBLE_MS = 5000;
const DEFAULT_DEADZONE = 0.2;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * One port's state. The buffers are written over and never rebuilt: the browser already makes a
 * fresh object for every pad on every question, and four more arrays a frame on top of that would
 * be rubbish nobody reads.
 */
type TPort = {
    /**
     * This frame's pressed buttons, and the previous frame's. Swapped, not copied.
     */
    cur: Uint8Array;
    prev: Uint8Array;
    values: Float32Array;
    axes: Float32Array;
    connected: boolean;
    id: string;
    mapping: string;
    buttonCount: number;
    axisCount: number;
    /**
     * Whether this pad has been asked about at least once since it appeared.
     *
     * Its whole job is the frame a pad shows up. The browser hides a pad until a button is pressed
     * on it, so that first answer almost always has a button down: the one the player used to wake
     * the controller. Comparing it against an empty previous frame would report a press nobody
     * made, and a title screen waiting for "any button" would skip itself.
     */
    seen: boolean;
    /**
     * Whether it has ever been vibrated, so the teardown knows whether to stop it.
     */
    rumbled: boolean;
    connectListeners: TGamepadListener[];
    disconnectListeners: TGamepadListener[];
};

const createPort = (): TPort => ({
    cur: new Uint8Array(GAMEPAD_BUTTONS.length),
    prev: new Uint8Array(GAMEPAD_BUTTONS.length),
    values: new Float32Array(GAMEPAD_BUTTONS.length),
    axes: new Float32Array(GAMEPAD_AXES.length),
    connected: false,
    id: '',
    mapping: '',
    buttonCount: 0,
    axisCount: 0,
    seen: false,
    rumbled: false,
    connectListeners: [],
    disconnectListeners: [],
});

/**
 * Grows the buffers if a pad turns up with more buttons or axes than fit. Rare (a standard pad is
 * 17 and 4) but a pad whose extra buttons quietly vanished would be a bug with no symptom other
 * than a button that does nothing.
 */
const ensureCapacity = (port: TPort, buttons: number, axes: number): void => {
    if (buttons > port.cur.length) {
        const cur = new Uint8Array(buttons);
        const prev = new Uint8Array(buttons);
        const values = new Float32Array(buttons);
        cur.set(port.cur);
        prev.set(port.prev);
        values.set(port.values);
        port.cur = cur;
        port.prev = prev;
        port.values = values;
    }
    if (axes > port.axes.length) {
        const grown = new Float32Array(axes);
        grown.set(port.axes);
        port.axes = grown;
    }
};

/**
 * Builds the pads of one game, read from the window the canvas really lives in.
 *
 * The window matters more here than anywhere else: a pad belongs to the window that enumerated it,
 * so a host that puts the canvas in another document (an editor with its play window pulled out)
 * would ask the wrong one for ever and find nothing, with no error to say why. The keyboard already
 * binds the same way.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGamepads = (canvas: HTMLCanvasElement): TGamepadSource => {
    const view = canvas.ownerDocument?.defaultView ?? (globalThis as unknown as Window);
    const ports = new Map<number, TPort>();

    const padAt = (index: number): Gamepad | null => view.navigator?.getGamepads?.()[index] ?? null;

    const portAt = (index: number): TPort => {
        const existing = ports.get(index);
        if (existing !== undefined) {
            return existing;
        }
        const port = createPort();
        ports.set(index, port);
        return port;
    };

    const infoOf = (index: number, port: TPort): TGamepadInfo => ({
        index,
        id: port.id,
        mapping: port.mapping,
        buttonCount: port.buttonCount,
        axisCount: port.axisCount,
    });

    const subscribe = (list: TGamepadListener[], listener: TGamepadListener): (() => void) => {
        list.push(listener);
        return () => {
            const at = list.indexOf(listener);
            if (at !== -1) {
                list.splice(at, 1);
            }
        };
    };

    const emit = (list: TGamepadListener[], info: TGamepadInfo): void => {
        // A copy, so one that stops listening while being told does not make the next one skip.
        for (const listener of [...list]) {
            listener(info);
        }
    };

    const sample = (port: TPort, pad: Gamepad | null): void => {
        // The frame rolls forward by swapping: this frame's buffer becomes last frame's, and the
        // one being retired is written over below. Nothing is allocated and nothing is copied.
        const retired = port.prev;
        port.prev = port.cur;
        port.cur = retired;

        if (pad === null || !pad.connected) {
            port.cur.fill(0);
            port.values.fill(0);
            port.axes.fill(0);
            port.connected = false;
            port.id = '';
            port.mapping = '';
            port.buttonCount = 0;
            port.axisCount = 0;
            // A pad that goes away releases what it was holding, and it does so here rather than in
            // the browser's unplug event on purpose: `prev` still has the pressed buttons, so this
            // frame reports them as just released, at a frame boundary where everyone sees the same
            // thing. Doing it from the event would clear it half way through a frame, and whoever
            // had already asked would have seen the button down while everyone after saw it up.
            port.seen = false;
            return;
        }

        ensureCapacity(port, pad.buttons.length, pad.axes.length);
        // Cleared first, so a pad with fewer buttons than the buffer (no `guide`, say) reads as not
        // pressed there instead of inheriting whatever the previous pad left behind.
        port.cur.fill(0);
        port.values.fill(0);
        for (let i = 0; i < pad.buttons.length; i++) {
            port.cur[i] = pad.buttons[i].pressed ? 1 : 0;
            port.values[i] = pad.buttons[i].value;
        }
        port.axes.fill(0);
        for (let i = 0; i < pad.axes.length; i++) {
            port.axes[i] = pad.axes[i];
        }

        // The frame it appears produces no presses: see `seen`.
        if (!port.seen) {
            port.prev.set(port.cur);
        }

        port.connected = true;
        port.id = pad.id;
        port.mapping = pad.mapping;
        port.buttonCount = pad.buttons.length;
        port.axisCount = pad.axes.length;
        port.seen = true;
    };

    const stopPortRumble = (index: number, port: TPort): void => {
        if (!port.rumbled) {
            return;
        }
        const actuator = padAt(index)?.vibrationActuator;
        if (actuator === null || actuator === undefined) {
            return;
        }
        if (actuator.reset !== undefined) {
            void actuator.reset().catch(() => {});
            return;
        }
        void actuator.playEffect?.('dual-rumble', { duration: 0, strongMagnitude: 0, weakMagnitude: 0 }).catch(() => {});
    };

    const onConnected = (event: Event): void => {
        const pad = (event as GamepadEvent).gamepad;
        const port = ports.get(pad.index);
        if (port === undefined) {
            return;
        }
        // The event's own pad is the truth about what just arrived; the port's fields are still
        // last frame's, because the sample has not run yet.
        emit(port.connectListeners, {
            index: pad.index,
            id: pad.id,
            mapping: pad.mapping,
            buttonCount: pad.buttons.length,
            axisCount: pad.axes.length,
        });
    };

    const onDisconnected = (event: Event): void => {
        const pad = (event as GamepadEvent).gamepad;
        const port = ports.get(pad.index);
        if (port === undefined) {
            return;
        }
        emit(port.disconnectListeners, infoOf(pad.index, port));
    };

    view.addEventListener('gamepadconnected', onConnected);
    view.addEventListener('gamepaddisconnected', onDisconnected);

    const buildHandle = (target: TGamepadTarget, options: TUseGamepadOptions & { scope?: (off: () => void) => void } = {}): TGamepad => {
        // A handle that follows the first pad has to bring every port into being, not only the one
        // it happens to read: a port is only sampled once someone asks for it, so an untouched port
        // 1 would stay empty for ever and "the first connected pad" would never find it.
        if (target === 'first') {
            for (let i = 0; i < GAMEPAD_PORTS; i++) {
                portAt(i);
            }
        } else {
            portAt(target);
        }

        /**
         * Which port to read this instant. A pinned handle answers with its own number even when
         * nothing is plugged into it, because reading an empty port is zeros, and that is the truth.
         */
        const resolved = (): number => {
            if (target !== 'first') {
                return target;
            }
            for (let i = 0; i < GAMEPAD_PORTS; i++) {
                if (ports.get(i)?.connected === true) {
                    return i;
                }
            }
            return 0;
        };
        const portNow = (): TPort => portAt(resolved());
        let deadzone = clamp01(options.deadzone ?? DEFAULT_DEADZONE);

        /**
         * Listens on every port this handle could end up reading, as one unsubscribe.
         */
        const scopeAll = (listener: TGamepadListener, pick: (port: TPort) => TGamepadListener[]): (() => void) => {
            const stops = target === 'first'
                ? Array.from({ length: GAMEPAD_PORTS }, (_, i) => subscribe(pick(portAt(i)), listener))
                : [subscribe(pick(portAt(target)), listener)];
            const off = (): void => {
                for (const stop of stops) {
                    stop();
                }
            };
            options.scope?.(off);
            return off;
        };

        const rawDown = (i: number): boolean => {
            const port = portNow();
            return i >= 0 && i < port.cur.length && port.cur[i] === 1;
        };
        const wasDown = (i: number): boolean => {
            const port = portNow();
            return i >= 0 && i < port.prev.length && port.prev[i] === 1;
        };
        const rawValue = (i: number): number => {
            const port = portNow();
            return i >= 0 && i < port.values.length ? port.values[i] : 0;
        };
        const rawAxisAt = (i: number): number => {
            const port = portNow();
            return i >= 0 && i < port.axes.length ? port.axes[i] : 0;
        };
        const stick = (x: number, y: number) => deadzoneRadial(rawAxisAt(x), rawAxisAt(y), deadzone);

        // Every field is a getter reading the port. Deliberately not built by spreading a ready-made
        // object: a spread reads each getter once, which would freeze `connected` at whatever it was
        // while the scene was being built, and that is `false` on essentially every real machine.
        return {
            get index() { return resolved(); },
            get connected() { return portNow().connected; },
            get id() { return portNow().id; },
            get mapping() { return portNow().mapping; },
            get buttonCount() { return portNow().buttonCount; },
            get axisCount() { return portNow().axisCount; },

            isDown: (button) => rawDown(gamepadButtonIndex[button]),
            justPressed: (button) => {
                const i = gamepadButtonIndex[button];
                return rawDown(i) && !wasDown(i);
            },
            justReleased: (button) => {
                const i = gamepadButtonIndex[button];
                return !rawDown(i) && wasDown(i);
            },
            value: (button) => rawValue(gamepadButtonIndex[button]),

            axis: (name) => deadzoneScalar(rawAxisAt(gamepadAxisIndex[name]), deadzone),
            leftStick: () => stick(gamepadAxisIndex.leftX, gamepadAxisIndex.leftY),
            rightStick: () => stick(gamepadAxisIndex.rightX, gamepadAxisIndex.rightY),
            get deadzone() { return deadzone; },
            setDeadzone: (value) => { deadzone = clamp01(value); },

            rawButton: rawDown,
            rawButtonValue: rawValue,
            rawJustPressed: (i) => rawDown(i) && !wasDown(i),
            rawJustReleased: (i) => !rawDown(i) && wasDown(i),
            rawAxis: rawAxisAt,

            get canRumble() {
                return Boolean(padAt(resolved())?.vibrationActuator?.playEffect);
            },
            rumble: (rumbleOptions: TRumbleOptions = {}): Promise<boolean> => {
                // Asked for again on every call: the browser hands back a fresh object every time,
                // and the motor hanging off one from three frames ago is not reliably the live one.
                const actuator = padAt(resolved())?.vibrationActuator;
                if (actuator?.playEffect === undefined) {
                    return Promise.resolve(false);
                }

                const duration = Math.min(Math.max(rumbleOptions.duration ?? 200, 0), MAX_RUMBLE_MS);
                const startDelay = Math.max(rumbleOptions.delay ?? 0, 0);
                portNow().rumbled = true;

                return actuator
                    .playEffect('dual-rumble', {
                        duration,
                        startDelay,
                        strongMagnitude: clamp01(rumbleOptions.strong ?? 1),
                        weakMagnitude: clamp01(rumbleOptions.weak ?? 1),
                    })
                    // It **fails** when it cannot play (the pad went away mid shake, the kind of
                    // effect is not supported). A game that rumbles on every hit would otherwise
                    // print an unhandled error on every hit.
                    .then((result) => result === 'complete')
                    .catch(() => false);
            },
            stopRumble: () => stopPortRumble(resolved(), portNow()),

            // A pinned handle hears about its own port; one that follows the first pad hears about
            // any of them, because "a pad turned up" is the event it exists for and it cannot know
            // in advance which port the browser will use.
            onConnect: (listener) => scopeAll(listener, (port) => port.connectListeners),
            onDisconnect: (listener) => scopeAll(listener, (port) => port.disconnectListeners),
        };
    };

    return {
        handle: buildHandle,
        beginFrame: () => {
            if (ports.size === 0) {
                return;
            }
            // One question for the whole frame, not one per port: the browser makes a fresh object
            // per pad every time it is asked, so asking four times means four times the rubbish for
            // four readings of the same list.
            const pads = view.navigator?.getGamepads?.();
            for (const [index, port] of ports) {
                sample(port, pads?.[index] ?? null);
            }
        },
        get active() { return ports.size > 0; },
        destroy: () => {
            view.removeEventListener('gamepadconnected', onConnected);
            view.removeEventListener('gamepaddisconnected', onDisconnected);
            // A game closed mid shake leaves the pad buzzing in the player's hands with nothing left
            // running to stop it: only the effect's own length would ever end it.
            for (const [index, port] of ports) {
                stopPortRumble(index, port);
            }
            ports.clear();
        },
    };
};

/**
 * A pad with nothing behind it.
 *
 * The browser only lets a pad be **asked** how it is, so a fake one is a thing whose buttons and
 * sticks a test can move by hand, plus the list the engine reads.
 */

export type TFakePad = {
    index: number;
    id: string;
    mapping: string;
    connected: boolean;
    buttons: Array<{ pressed: boolean; value: number }>;
    axes: number[];
    vibrationActuator?: { playEffect?: (...args: unknown[]) => Promise<string>; reset?: () => Promise<void> };
    /**
     * Presses a button by its standard number.
     */
    press(index: number, value?: number): void;
    /**
     * Lets it go.
     */
    release(index: number): void;
    /**
     * Pushes a stick, by axis number.
     */
    push(axis: number, value: number): void;
};

export const createFakePad = (index = 0, options: { buttons?: number; axes?: number; mapping?: string; id?: string } = {}): TFakePad => {
    const pad: TFakePad = {
        index,
        id: options.id ?? 'Fake Pad',
        mapping: options.mapping ?? 'standard',
        connected: true,
        buttons: Array.from({ length: options.buttons ?? 17 }, () => ({ pressed: false, value: 0 })),
        axes: Array.from({ length: options.axes ?? 4 }, () => 0),
        press(button, value = 1) {
            this.buttons[button] = { pressed: value > 0, value };
        },
        release(button) {
            this.buttons[button] = { pressed: false, value: 0 };
        },
        push(axis, value) {
            this.axes[axis] = value;
        },
    };
    return pad;
};

/**
 * Puts a `navigator.getGamepads` on the window a fake canvas belongs to. Returns the list the test
 * fills: whatever is in it is what the engine will find.
 */
export const installFakePads = (): { pads: Array<TFakePad | null>; restore: () => void } => {
    const pads: Array<TFakePad | null> = [null, null, null, null];
    const navigatorObject = globalThis.navigator as unknown as { getGamepads?: () => unknown };
    const previous = navigatorObject.getGamepads;
    navigatorObject.getGamepads = () => pads;
    return {
        pads,
        restore: () => { navigatorObject.getGamepads = previous; },
    };
};

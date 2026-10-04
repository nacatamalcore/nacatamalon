import type { TGamepadAxisName, TGamepadButtonName } from '../gamepad_standard';

/**
 * What a pad says about itself when it arrives or leaves.
 *
 * `mapping` is the field worth reading: `'standard'` means the button names line up with the
 * plastic, and anything else (usually an empty string) is a pad the browser did not recognise, one
 * of those cheap USB copies of a SNES or Mega Drive controller, whose buttons land wherever the
 * manufacturer put them. Those are still perfectly playable through `rawButton` and `rawAxis`; what
 * does not work on them are the names, and this is how a game finds that out instead of quietly
 * reading the wrong button.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepadInfo = {
    /**
     * The port it is plugged into, the same number `useGamepad(port)` takes.
     */
    index: number;
    /**
     * What the browser calls it, something like `'Xbox Wireless Controller (…)'`.
     */
    id: string;
    /**
     * `'standard'` when the names can be trusted, usually empty otherwise.
     */
    mapping: string;
    buttonCount: number;
    axisCount: number;
};

/**
 * Told when a pad arrives in a port, or leaves it.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepadListener = (info: TGamepadInfo) => void;

/**
 * How hard and how long to shake the pad. Everything is optional: `rumble()` on its own is a short
 * generic thump, which is what most calls want.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRumbleOptions = {
    /**
     * Milliseconds, default 200, never more than 5000: past that the browser cuts it without saying so.
     */
    duration?: number;
    /**
     * The heavy motor, 0 to 1, default 1. The one felt as a thud.
     */
    strong?: number;
    /**
     * The light motor, 0 to 1, default 1. The one felt as a buzz.
     */
    weak?: number;
    /**
     * Milliseconds to wait before starting, default 0.
     */
    delay?: number;
};

/**
 * One pad, as a game reads it. Returned by `useGamepad`.
 *
 * Everything here is **live**: a handle taken while the scene is being built says there is no pad,
 * and starts saying there is one by itself when the player's shows up. That matters more than it
 * sounds, because browsers hide a pad until a button is pressed on it (so that a page cannot tell
 * who you are by your hardware): "no pad" is the normal state at the start of a scene even with a
 * controller plugged in.
 *
 * Held and just pressed split exactly like the keyboard's, and for the same reason: hold `left` to
 * walk, `justPressed('a')` to jump once however long the button is held.
 *
 * **One thing it cannot do**, and it is the browser's limit rather than a choice: a press and a
 * release that both happen between two frames leave no trace. A pad sends no events, it can only be
 * asked how it is now, so "what happened since the last frame" is a comparison of two answers. At
 * 60 frames a second that is a tap under 16 ms, which no thumb produces on a real button. The
 * keyboard does catch that case, because it gets real events.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepad = {
    /**
     * The port being read **right now**. Fixed for a handle pinned to a number; for one that
     * follows the first pad, it changes when pads are plugged in or out.
     */
    readonly index: number;
    /**
     * Whether there is a pad in that port right now.
     */
    readonly connected: boolean;
    /**
     * What the browser calls it, or empty with nothing connected.
     */
    readonly id: string;
    /**
     * `'standard'`, or empty for a pad the browser did not recognise.
     */
    readonly mapping: string;
    /**
     * How many buttons the pad says it has, `0` with nothing connected.
     */
    readonly buttonCount: number;
    /**
     * How many axes the pad says it has, `0` with nothing connected.
     */
    readonly axisCount: number;

    /**
     * Whether the button is held right now.
     */
    isDown(button: TGamepadButtonName): boolean;
    /**
     * Whether it went down **this frame**: true for exactly one frame per press.
     */
    justPressed(button: TGamepadButtonName): boolean;
    /**
     * Whether it came up this frame. A pad unplugged while something was held releases everything,
     * so a shot charged from press to release still finishes instead of waiting for ever.
     */
    justReleased(button: TGamepadButtonName): boolean;
    /**
     * How far it is pressed, 0 to 1. Only the triggers are analogue on a standard pad; every other
     * button is 0 or 1. **No dead zone here**: a trigger rests at exactly 0 and does not drift, so
     * trimming its first fifth would only shorten the travel.
     */
    value(button: TGamepadButtonName): number;

    /**
     * One stick axis, with its dead zone, from -1 to 1 (`y` grows downwards).
     *
     * For **movement** use `leftStick()` instead. Cutting axes one at a time makes the dead area a
     * square, and a stick pushed gently on the diagonal then loses one of its two directions.
     */
    axis(name: TGamepadAxisName): number;
    /**
     * The left stick as a direction, with a **round** dead zone: inside it, exactly zero; outside,
     * it climbs from zero instead of jumping. This is the one to move a character with.
     */
    leftStick(): { x: number; y: number };
    /**
     * The right stick, treated the same way.
     */
    rightStick(): { x: number; y: number };
    /**
     * The dead zone this handle uses, 0 to 1.
     */
    readonly deadzone: number;
    /**
     * Changes it. Per handle, so two objects reading one pad can each choose.
     */
    setDeadzone(value: number): void;

    /**
     * Whether the raw button at that number is held: the way out for a pad whose `mapping` is not
     * standard, where the names point at whatever the maker wired. A number out of range reads
     * `false` instead of failing.
     */
    rawButton(index: number): boolean;
    /**
     * How far the raw button at that number is pressed, 0 to 1.
     */
    rawButtonValue(index: number): number;
    /**
     * Just pressed, by number, so a game on an unrecognised pad still gets presses and not only holds.
     */
    rawJustPressed(index: number): boolean;
    /**
     * Just released, by number.
     */
    rawJustReleased(index: number): boolean;
    /**
     * The raw axis at that number, -1 to 1, with **no** dead zone.
     */
    rawAxis(index: number): number;

    /**
     * Whether the browser offers vibration for this pad, so an options screen can grey out its
     * switch instead of offering one that does nothing.
     */
    readonly canRumble: boolean;
    /**
     * Shakes the pad. Resolves `true` if the browser says it played, `false` if it could not. It
     * never fails: a game that rumbles on every hit would otherwise fill the console.
     *
     * **This is the least reliable corner of the whole browser API, and macOS is the worst of it.**
     * Vibration was built against Windows first; a pad that reads perfectly there may never shake,
     * and over Bluetooth the motors are often simply out of reach. Safari offers nothing at all.
     * There is no second way to try, so treat it as a garnish and never as something the player
     * needs to feel. `true` means "the browser says it played", not "the player felt it".
     */
    rumble(options?: TRumbleOptions): Promise<boolean>;
    /**
     * Stops whatever is playing. Done for you when the game is destroyed.
     */
    stopRumble(): void;

    /**
     * Runs when a pad appears in **this port**. Per port, because that is what makes "PLAYER 2,
     * PRESS START" work. Returns the function that stops listening; asked for from a scene, it also
     * stops by itself when the scene goes away.
     */
    onConnect(listener: TGamepadListener): () => void;
    /**
     * Runs when the pad in this port goes away. Same rules.
     */
    onDisconnect(listener: TGamepadListener): () => void;
};

/**
 * Which pad a handle reads: a port number, or the first one connected.
 *
 * The difference is not fussiness. The **browser** owns the port, not the player: a pad unplugged
 * and plugged back in usually lands in a different one, so a single player game nailed to port 0
 * goes silent with nothing in the console to say why. Following the first pad is what such a game
 * actually means; a number is what local multiplayer means, where "player two" has to keep meaning
 * one particular controller.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepadTarget = number | 'first';

/**
 * What `useGamepad` accepts.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseGamepadOptions = {
    /**
     * Stick dead zone, 0 to 1. Default `0.2`: inside the value Xbox pads themselves suggest, and
     * above the drift of the cheap pads this engine's players will really own.
     */
    deadzone?: number;
};

/**
 * The pads of one game, as the engine holds them: what the loop samples and what a scene reads.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepadSource = {
    /**
     * The handle for a port, or for the first pad connected.
     */
    handle(target: TGamepadTarget, options?: TUseGamepadOptions & { scope?: (off: () => void) => void }): TGamepad;
    /**
     * Asks every port how it is, once per frame, before anything updates. Called by the loop, and
     * **also while the game is paused**: presses are a comparison between two answers, so a game
     * that stopped asking would report everything pressed during the pause on the frame it resumes.
     */
    beginFrame(): void;
    /**
     * Whether anyone asked for a pad at all, and so whether there is anything to sample.
     */
    readonly active: boolean;
    /**
     * Stops any vibration and forgets everything.
     */
    destroy(): void;
};

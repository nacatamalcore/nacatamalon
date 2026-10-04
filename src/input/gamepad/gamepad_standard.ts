/**
 * A button of the W3C **standard mapping**, by the name this engine gives it.
 *
 * The names are the Xbox labels because that is how the specification itself defines the mapping:
 * "the bottom button of the right cluster" is index 0, and every pad that reports
 * `mapping: 'standard'` has agreed to put its bottom face button there.
 *
 * Worth knowing before the first bug report: on a Nintendo or an 8BitDo pad the **printed** letters
 * sit in the other order, so the button under the player's thumb when they press `'a'` is the one
 * labelled B on the plastic. That is the pad's labelling, not a mistake here: the position is what
 * the standard mapping promises, and the position is what a game cares about.
 *
 * A closed list of seventeen, so a typo is caught when the game is compiled.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepadButtonName =
    | 'a' | 'b' | 'x' | 'y'
    | 'lb' | 'rb' | 'lt' | 'rt'
    | 'back' | 'start'
    | 'ls' | 'rs'
    | 'up' | 'down' | 'left' | 'right'
    | 'guide';

/**
 * A stick axis of the standard mapping. `X` grows to the right and `Y` grows **downwards**, which
 * is what the browser reports and also how this engine measures the screen: pushing the stick up
 * gives a negative `leftY`, the same sign a sprite needs to move up.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGamepadAxisName = 'leftX' | 'leftY' | 'rightX' | 'rightY';

/**
 * Every standard button, in the order the specification gives them: **the position in this list is
 * the number the browser reports**, so turning a name into a number is a lookup instead of a second
 * table to keep in step.
 *
 * `'guide'` is last because a pad is allowed not to have it, which makes it the only one a lookup
 * can fall off the end of. Reads are checked against the pad's real button count anyway.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GAMEPAD_BUTTONS: readonly TGamepadButtonName[] = [
    'a',      // 0  bottom of the right cluster
    'b',      // 1  right of the right cluster
    'x',      // 2  left of the right cluster
    'y',      // 3  top of the right cluster
    'lb',     // 4  top left front
    'rb',     // 5  top right front
    'lt',     // 6  bottom left front  (analogue: read `value`)
    'rt',     // 7  bottom right front (analogue: read `value`)
    'back',   // 8  left of the middle cluster
    'start',  // 9  right of the middle cluster
    'ls',     // 10 left stick pressed in
    'rs',     // 11 right stick pressed in
    'up',     // 12 d-pad
    'down',   // 13 d-pad
    'left',   // 14 d-pad
    'right',  // 15 d-pad
    'guide',  // 16 middle of the middle cluster (may not exist)
];

/**
 * Every standard axis, in specification order: as with the buttons, the position is the number the
 * browser reports.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GAMEPAD_AXES: readonly TGamepadAxisName[] = ['leftX', 'leftY', 'rightX', 'rightY'];

/**
 * Name to number, built from the list so the two cannot disagree.
 *
 * @internal
 */
export const gamepadButtonIndex: Readonly<Record<TGamepadButtonName, number>> =
    Object.fromEntries(GAMEPAD_BUTTONS.map((name, index) => [name, index])) as Record<TGamepadButtonName, number>;

/**
 * Name to number for the axes.
 *
 * @internal
 */
export const gamepadAxisIndex: Readonly<Record<TGamepadAxisName, number>> =
    Object.fromEntries(GAMEPAD_AXES.map((name, index) => [name, index])) as Record<TGamepadAxisName, number>;

/**
 * What each button is called when it is shown to a player, for a controls screen that has to print
 * what a key is bound to.
 *
 * Here and not in the game, because the name and its label are one fact: a second hand-written list
 * would drift the first time a name changed, and it would drift in silence, since a wrong label
 * still looks fine.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GAMEPAD_BUTTON_LABELS: Readonly<Record<TGamepadButtonName, string>> = {
    a: 'A',
    b: 'B',
    x: 'X',
    y: 'Y',
    lb: 'LB',
    rb: 'RB',
    lt: 'LT',
    rt: 'RT',
    back: 'BACK',
    start: 'START',
    ls: 'L STICK',
    rs: 'R STICK',
    up: 'D-PAD UP',
    down: 'D-PAD DOWN',
    left: 'D-PAD LEFT',
    right: 'D-PAD RIGHT',
    guide: 'GUIDE',
};

/**
 * What each axis is called when it is shown to a player.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GAMEPAD_AXIS_LABELS: Readonly<Record<TGamepadAxisName, string>> = {
    leftX: 'L STICK X',
    leftY: 'L STICK Y',
    rightX: 'R STICK X',
    rightY: 'R STICK Y',
};

/**
 * How one **direction** of an axis reads on a controls screen: "L STICK LEFT", "L STICK DOWN".
 *
 * A direction, and not an axis, is what a binding really names: an axis goes both ways and the
 * thing bound to it does not. `y` grows downwards, so `dir: 1` on a vertical axis is **down**, and
 * writing that out is the whole point of this function: it is the one place that convention meets
 * a person.
 *
 * @param axis - The stick axis.
 * @param dir - Which way along it: `-1` or `1`.
 * @returns What to print on the screen.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gamepadAxisDirectionLabel = (axis: TGamepadAxisName, dir: -1 | 1): string => {
    const vertical = axis === 'leftY' || axis === 'rightY';
    const stick = axis === 'leftX' || axis === 'leftY' ? 'L STICK' : 'R STICK';
    if (vertical) {
        return `${stick} ${dir === 1 ? 'DOWN' : 'UP'}`;
    }
    return `${stick} ${dir === 1 ? 'RIGHT' : 'LEFT'}`;
};

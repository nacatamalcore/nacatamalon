import type { TGamepadButtonName } from '../gamepad';
import type { TActionBinding, TActionDef, TActionMap } from './types/t_action';

/**
 * Which input map `INPUT.ACTION_PRESETS` has ready.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionPresetName = 'nes' | 'genesis' | 'snes' | 'arcade' | 'platformer';

const key = (name: string): TActionBinding => ({ type: 'key', key: name });
const button = (name: TGamepadButtonName): TActionBinding => ({ type: 'button', button: name });

/**
 * The four directions, each where a player looks for it: the arrows, WASD, the d-pad and the left
 * stick. Four bindings an action, sixteen in all, which is what nobody should have to write by hand.
 */
const directions = (): TActionDef[] => [
    { name: 'up', bindings: [key('ArrowUp'), key('w'), button('up'), { type: 'axis', axis: 'leftY', dir: -1 }] },
    { name: 'down', bindings: [key('ArrowDown'), key('s'), button('down'), { type: 'axis', axis: 'leftY', dir: 1 }] },
    { name: 'left', bindings: [key('ArrowLeft'), key('a'), button('left'), { type: 'axis', axis: 'leftX', dir: -1 }] },
    { name: 'right', bindings: [key('ArrowRight'), key('d'), button('right'), { type: 'axis', axis: 'leftX', dir: 1 }] },
];

/**
 * One button of the console: a key of the keyboard and the button of a pad in the place it had.
 */
const pressed = (name: string, ...bindings: TActionBinding[]): TActionDef => ({ name, bindings });

/**
 * Ready input maps, by console and by kind of game.
 *
 * A console's buttons sit on the pad where they sat on its own: the names are the standard pad's,
 * which are an Xbox pad's (`'a'` the bottom of the right cluster, `'b'` its right, `'x'` its left,
 * `'y'` its top). On the keyboard they are where emulators put them, on the bottom row, out of the way
 * of WASD; `start` is Enter and `select` Shift.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ACTION_PRESETS: Readonly<Record<TActionPresetName, TActionMap>> = {
    // B and A side by side, A on the right: the bottom and the right of the cluster.
    nes: [
        ...directions(),
        pressed('a', key('x'), button('b')),
        pressed('b', key('z'), button('a')),
        pressed('select', key('Shift'), button('back')),
        pressed('start', key('Enter'), button('start')),
    ],
    // A, B and C in a row: left, bottom and right of the cluster.
    genesis: [
        ...directions(),
        pressed('a', key('z'), button('x')),
        pressed('b', key('x'), button('a')),
        pressed('c', key('c'), button('b')),
        pressed('start', key('Enter'), button('start')),
    ],
    // A diamond like the standard pad's, with A and B, X and Y the other way round.
    snes: [
        ...directions(),
        pressed('a', key('x'), button('b')),
        pressed('b', key('z'), button('a')),
        pressed('x', key('v'), button('y')),
        pressed('y', key('c'), button('x')),
        pressed('l', key('q'), button('lb')),
        pressed('r', key('e'), button('rb')),
        pressed('select', key('Shift'), button('back')),
        pressed('start', key('Enter'), button('start')),
    ],
    // Six buttons, three above three, as a fighting game puts them on a pad; coin and start where an
    // arcade emulator has them, 5 and 1.
    arcade: [
        ...directions(),
        pressed('button1', key('z'), button('x')),
        pressed('button2', key('x'), button('y')),
        pressed('button3', key('c'), button('rb')),
        pressed('button4', key('v'), button('a')),
        pressed('button5', key('b'), button('b')),
        pressed('button6', key('n'), button('rt')),
        pressed('coin', key('5'), button('back')),
        pressed('start', key('1'), key('Enter'), button('start')),
    ],
    // Not a console: what a platformer reads, by what it does.
    platformer: [
        ...directions(),
        pressed('jump', key(' '), key('z'), button('a')),
        pressed('action', key('x'), button('x')),
        pressed('pause', key('Escape'), key('Enter'), button('start')),
    ],
};

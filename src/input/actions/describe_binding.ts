import { GAMEPAD_BUTTON_LABELS, gamepadAxisDirectionLabel } from '../gamepad';
import type { TActionBinding } from './types/t_action';

/**
 * A binding the way a person reads it: `'Space'`, `'A'`, `'L STICK LEFT'`.
 *
 * It lives next to the labels of the pad rather than in each controls screen, because the names and
 * the labels are one fact: a second copy would drift, and a wrong label still draws, so nobody would
 * be told. A key reads as its character when it is one, and a named key is split into its words
 * (`'ArrowLeft'` becomes `'Arrow Left'`).
 *
 * @param binding - The binding.
 * @returns What to print on a controls screen.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const describeBinding = (binding: TActionBinding): string => {
    if (binding.type === 'key') {
        if (binding.key === ' ') {
            return 'Space';
        }
        if (binding.key.length === 1) {
            return binding.key.toUpperCase();
        }
        return binding.key.replace(/([a-z])([A-Z])/g, '$1 $2');
    }
    if (binding.type === 'button') {
        return GAMEPAD_BUTTON_LABELS[binding.button];
    }
    return gamepadAxisDirectionLabel(binding.axis, binding.dir);
};

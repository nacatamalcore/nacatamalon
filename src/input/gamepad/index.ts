export { createGamepads } from './create_gamepads';
export { deadzoneRadial, deadzoneScalar } from './deadzone';
export {
    GAMEPAD_AXES,
    GAMEPAD_AXIS_LABELS,
    GAMEPAD_BUTTONS,
    GAMEPAD_BUTTON_LABELS,
    gamepadAxisDirectionLabel,
    gamepadAxisIndex,
    gamepadButtonIndex,
} from './gamepad_standard';

export type { TGamepadAxisName, TGamepadButtonName } from './gamepad_standard';
export type {
    TGamepad,
    TGamepadInfo,
    TGamepadListener,
    TGamepadSource,
    TGamepadTarget,
    TRumbleOptions,
    TUseGamepadOptions,
} from './types/t_gamepad';

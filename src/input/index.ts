export { createKeyboard } from './create_keyboard';
export { createPointer } from './create_pointer';
export { pickTargets } from './pick_targets';

export type { TKeyboard, TKeyboardSource } from './types/t_keyboard';
export type { TKeyName } from './types/t_key_name';
export type { TPointerInfo, TPointerListener, TPointerWheelInfo, TPointerWheelListener, TPointerHandle, TPointerLockOptions, TPointerSource, TPointerKind } from './types/t_pointer';
export type { TSpriteEvents } from './types/t_sprite_events';
export { SPRITE_EVENT_NAMES } from './types/t_sprite_events';
export { createGamepads, deadzoneRadial, deadzoneScalar, GAMEPAD_AXES, GAMEPAD_AXIS_LABELS, GAMEPAD_BUTTONS, GAMEPAD_BUTTON_LABELS, gamepadAxisDirectionLabel, gamepadAxisIndex, gamepadButtonIndex } from './gamepad';
export { createActions, createInputMap, normalizeActionMap, bindingKey, describeBinding, DEFAULT_ACTION_DEADZONE, DEFAULT_ACTION_PRESS, INPUT_MAP_STORAGE_KEY } from './actions';

export type { TGamepad, TGamepadAxisName, TGamepadButtonName, TGamepadInfo, TGamepadListener, TGamepadSource, TGamepadTarget, TRumbleOptions, TUseGamepadOptions } from './gamepad';
export type { TAction, TActionBinding, TActionCaptureOptions, TActionDef, TActionDevice, TActionMap, TActionName, TActionOverrides, TActionPersist, TActionsHandle, TActionSource, TInputMapHandle } from './actions';

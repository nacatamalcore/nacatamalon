export { createGameSignal } from './create_game_signal';
export { scenePaused, sceneResumed, gamePaused, gameResumed } from './engine_signals';

export type { TGameSignal, TSignalHandler } from './types/t_game_signal';
export type { TScenePauseEvent, TGamePauseEvent } from './engine_signals';

import type { TGameOptions } from './t_game_options';

/**
 * `TGameOptions` after `cleanGameOptions` has filled every default: the *resolved*
 * configuration, where `TGameOptions` is the *request*.
 *
 * Everything is required, so nothing downstream has to write `?? something` again. `seed`
 * and `actionsPersist` are the exceptions and stay optional: absent means "not pinned" and
 * "do not keep the player's controls", which are real states and not missing defaults.
 *
 * Worth annotating `cleanGameOptions`'s return with this, then adding a field to
 * `TGameOptions` and forgetting its default stops compiling.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameConfig = Required<Omit<TGameOptions, 'seed' | 'actionsPersist' | 'post'>> & Pick<TGameOptions, 'seed' | 'actionsPersist' | 'post'>;

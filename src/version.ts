import { version } from '../package.json';

/**
 * The engine's version, as a string: what the console prints when a game starts, and what a bug
 * report should quote.
 *
 * It is read from the package's own `package.json`, so it is always the version that is running.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const VERSION: string = version;

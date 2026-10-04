/**
 * Spells a key the one way the engine compares them: a single character folds to lowercase,
 * everything longer keeps its exact name.
 *
 * Shift+A arrives as `'A'` and a game asking for `'a'` means the same physical key, so single
 * characters fold. Anything longer is a name and names are case sensitive: folding them would let
 * `'arrowleft'` match a key nobody spells that way, and would make two different names collide.
 *
 * The one name that is folded is the space bar: the browser reports it as `' '`, and nearly
 * everyone writes `'Space'` (the way `KeyboardEvent.code` and every engine's docs spell it), which
 * then never matched anything and failed in silence. `'Space'` and the old `'Spacebar'` both mean `' '`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const ALIASES: Record<string, string> = { Space: ' ', Spacebar: ' ' };

export const normalizeKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : ALIASES[key] ?? key);

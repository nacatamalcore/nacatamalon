import type { TRule } from './types/t_rule';

/**
 * One thing a rule did, or did not do and why, as a tool sees it while the game is played: what
 * lets an editor say which rule fired, which condition kept one from firing, and which step was
 * passed by.
 *
 * - `armed`: it is in the game, played, and waits: told once, as its box is built, so a rule that
 *   then never does anything is known to have been there.
 * - `fired`: what it waits for happened, its conditions held, its steps start (`from`: the box that
 *   told, for a report).
 * - `held`: what it waits for happened and condition `condition` did not hold: `seen` is what it read,
 *   and `said` why when it could read nothing (a store that is not there).
 * - `once`: it happened again, and the rule happens only once.
 * - `step`: step `step` was done.
 * - `passed`: step `step` was passed by, and `said` is why (a box not there, an action nobody has).
 * - `threw`: step `step` threw, `said` is what, and the rest of the rule was passed by.
 *
 * `time` is the seconds its scene has run. `rule` is the rule as its box carries it. A step is told
 * once it is done, so what it set off (another rule, hearing a report it sent) is told before it.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuleTrace = {
    what: 'armed' | 'fired' | 'held' | 'once' | 'step' | 'passed' | 'threw';
    /** The box the rules are on: its id and name. */
    box: string;
    boxName: string;
    rule: TRule;
    time: number;
    from?: { id: string; name: string };
    condition?: number;
    seen?: unknown;
    step?: number;
    said?: string;
};

const tracers = new Set<(trace: TRuleTrace) => void>();

/**
 * Tells `listener` everything the game's rules do from now on (`TRuleTrace`), until the function it
 * gives back is called. For an editor showing what happened while the game was played; a game
 * never calls it. Nothing is made for it while nobody watches.
 *
 * @param listener What to tell each trace.
 * @returns A function that stops it.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const watchRules = (listener: (trace: TRuleTrace) => void): (() => void) => {
    tracers.add(listener);
    return () => {
        tracers.delete(listener);
    };
};

/**
 * Whether anything watches the rules: what keeps the traces from being made when nothing does.
 *
 * @internal
 */
export const tracingRules = (): boolean => tracers.size > 0;

/**
 * Hands a trace to whoever watches. One that throws is passed by: watching must never change the game.
 *
 * @internal
 */
export const traceRule = (trace: TRuleTrace): void => {
    for (const listener of [...tracers]) {
        try {
            listener(trace);
        } catch {
            // A tool's own trouble, not the game's.
        }
    }
};

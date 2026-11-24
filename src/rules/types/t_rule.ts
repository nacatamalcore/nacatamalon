import type { TScriptProps } from '../../scripts/types/t_script';

/**
 * Which box a rule means: its id or its name, as a behaviour's `'box'` setting holds one (`findBoxRef`
 * finds it, nearest first), the empty text for the box the rules are on, or `'@from'` for the box
 * that sent the report the rule heard, or was clicked.
 *
 * A name names every box of that name where a rule listens ("when any Coin is picked"), and the
 * nearest one where it acts on one.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuleBox = string;

/**
 * What starts a rule.
 *
 * - `report`: a box told whoever listens something (`health`'s `dead`, `pickup`'s `picked`), sent
 *   with `useReport` and declared in `registerScript`'s `reports`. Heard from every box the rule
 *   names, those made later included, and **without taking it** from whoever placed the box and
 *   listens with `onReport`: a rule watches, it does not answer.
 *   With `tag` instead of `box`, from every box carrying that tag (`set_box_tags`, a box's `tags`):
 *   "when any coin is picked", the coins each a name of their own.
 * - `start`: once, when the box the rules are on is ready.
 * - `action`: the player presses one of the game's actions (its input map), or lets it go
 *   (`phase: 'released'`), on whatever it is bound to: a key, a pad, an on-screen button.
 * - `click`: the player clicks a box, or touches it: pressed and let go on it, or on anything inside
 *   it. With `tag` instead of `box`, any box carrying that tag. `'@from'` is then the box clicked.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuleWhen =
    | { on: 'report'; box: TRuleBox; report: string }
    | { on: 'report'; tag: string; report: string }
    | { on: 'start' }
    | { on: 'action'; action: string; phase?: 'pressed' | 'released' }
    | { on: 'click'; box: TRuleBox }
    | { on: 'click'; tag: string };

/**
 * How a condition compares.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuleCompare = '==' | '!=' | '<' | '<=' | '>' | '>=';

/**
 * What must hold for a rule to go on once it has started: a field of a store (`stores/<key>.store`),
 * or what came with the report it heard (`hurt`'s `lives`), compared with a value.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuleCondition =
    | { store: string; field: string; is: TRuleCompare; value: string | number | boolean }
    | { payload: string; is: TRuleCompare; value: string | number | boolean };

/**
 * One thing a rule does, in the order written.
 *
 * - `call`: an action a behaviour declares (`registerScript`'s `actions`), on the box that carries
 *   it: a door's `open`. `params` are what it is called with.
 * - `destroy`, `show`, `hide`: a box taken out of the game, shown or hidden.
 * - `store`: a field of a store set to a value, or a number added to it.
 * - `say`: what the texts a box is laid out with say, given anew (not those a behaviour made on it,
 *   a waving title's letters). `{key}` in it is what came with the report the rule heard
 *   (`"{by} HITS IT OUT!"`; `{value}` when it came with one value), so the words can follow what
 *   happened. `color` (`'#f8d830'`) tints the one in front, the last: a shadow comes before it.
 * - `sound`: a sound the box carries (a `sound`, `music` or `song` component) played, by its name
 *   (its file's or the component's id, as `soundOf` finds it), or the first it carries when empty;
 *   by its name, one of the boxes inside it too (a box of sounds, one a box, named by its sound or by
 *   its own name, whose first sound it plays). `{key}` in the name is
 *   what came with the report.
 * - `report`: this box tells whoever listens, as a behaviour does with `useReport`: what another
 *   rule, or the code that placed it, can wait for.
 * - `scene`: the game goes to another scene.
 * - `wait`: so many seconds of game time before the next step.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRuleStep =
    | { do: 'call'; box: TRuleBox; script: string; action: string; params?: TScriptProps }
    | { do: 'destroy'; box: TRuleBox }
    | { do: 'show'; box: TRuleBox }
    | { do: 'hide'; box: TRuleBox }
    | { do: 'say'; box: TRuleBox; text: string; color?: string }
    | { do: 'sound'; box: TRuleBox; sound: string }
    | { do: 'store'; store: string; field: string; add?: number; set?: string | number | boolean }
    | { do: 'report'; report: string }
    | { do: 'scene'; scene: string }
    | { do: 'wait'; seconds: number };

/**
 * When something happens, if these hold, do these: logic written as data rather than as code, so a
 * form can show it and change it, and so can an agent, and the two see the same thing.
 *
 * Its words are the behaviours' own. What a rule waits for is what a behaviour reports, and what it
 * does, beyond the few things any box can do, is what a behaviour says it can be told to do: a game
 * that needs another word writes a behaviour that has it, and the rules can use it from then on.
 *
 * `once` makes it happen the first time only. `id` is what a tool changes it by; it means nothing
 * to the game.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRule = {
    id: string;
    when: TRuleWhen;
    if?: TRuleCondition[];
    do: TRuleStep[];
    once?: boolean;
};

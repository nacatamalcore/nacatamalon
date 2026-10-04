import type { TGameObject } from '../../hooks/spawn/use_spawn';

/**
 * The authored settings of one attached script, and what makes a behaviour **configurable**
 * instead of fixed: two boxes can carry the same `patrol` at different speeds.
 *
 * Only numbers, text and true or false, and that ceiling is on purpose rather than an oversight.
 * These are typed into a form by hand, so anything with structure (a point, a colour, a list)
 * would need an editor of its own and a story for changing it later. A behaviour that wants a
 * place already has one, its box's; one that wants a target names it and looks it up. If a nested
 * shape ever becomes unavoidable it should arrive as a new kind of field, not by opening this up.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptProps = Record<string, string | number | boolean>;

/**
 * A behaviour, written as a function and registered under a name.
 *
 * It is handed the object it was attached to, so it can reach what that object carries
 * (`self.drawables[0]`, its placement) and register per-frame work over it.
 *
 * **A script adds behaviour, not things.** It should not create sprites or meshes and should not
 * call `useData` in its body: what a scene is made of is the scene's business, and a script is run
 * again every time the scene is opened, so anything it built would be built twice. That line is
 * the same one the whole saved format rests on.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptFn = (self: TGameObject, props: TScriptProps) => void;

/**
 * One setting a script declares about itself.
 *
 * A behaviour's settings cannot be guessed from outside: they are variables inside a function and
 * nothing but the code knows they exist. So the code says so here, and an editor builds a form
 * from it without knowing anything about the behaviour.
 *
 * `default` is not optional. It is what a freshly attached script starts with, and it is what
 * fills the gap when a script **gains** a setting that a scene saved earlier knows nothing about.
 * An absent value has no other sensible answer.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptField = {
    key: string;
    /**
     * What the form calls it. The key itself when left out.
     */
    label?: string;
    /**
     * How the value is written.
     *
     * `'key'` is a `'string'` that happens to be a keyboard key, and it exists because typing one
     * into a text box does not work: what the input system matches is the browser's own spelling,
     * where space is a single blank character. That renders as an empty box and reads as a setting
     * nobody filled in. A form shows `'key'` as "press the key you want" instead, which is both
     * easier and the only way to write down the keys with nothing to print. Saved exactly like a
     * string; nothing further down needs to know the difference.
     */
    type: 'number' | 'boolean' | 'string' | 'select' | 'key';
    default: string | number | boolean;
    min?: number;
    max?: number;
    step?: number;
    /**
     * `'select'` only: what may be chosen.
     */
    options?: { label: string; value: string }[];
};

/**
 * One thing a script needs its object to already have: the type of a component (`'mesh'`), the
 * stand-in word `'drawable'` for "anything this object draws", or the name of another script.
 *
 * **One list and not three**, because from inside a script the question is always the same one:
 * is this on my object? Splitting it would make an author pick a category before saying what they
 * need, and a name that matches nothing is reported exactly like a name that is genuinely missing,
 * so a typo is loud instead of a check that quietly never fires.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptRequirement = string;

/**
 * What a script says about itself beyond its settings.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptOptions = {
    fields?: TScriptField[];
    /**
     * Whether this behaviour also runs while a scene is being **edited** rather than played.
     *
     * Off by default, which is what keeps an editor usable: a behaviour that walks an object
     * around would walk it away from where you just put it, and its idea of the arrow keys would
     * start competing with the editor's. Turn it on for a behaviour whose *purpose* is to be seen
     * while building, such as one that lays out its own children or draws a guide.
     */
    tool?: boolean;
    /**
     * What this script needs its object to already carry, so that an object missing it is
     * **reported** instead of quietly doing nothing.
     *
     * Almost every script opens by giving up in silence: take the first drawable, and return if
     * there is none. That guard is right, because one badly set up object must not take a whole
     * scene down. But the guard is also the entire diagnosis, and nobody can see it. Saying what
     * is needed turns the same situation into a line somebody reads, and leaves the guard exactly
     * where it is.
     *
     * It is also what lets behaviours be written apart and put together later. One that expects a
     * sibling behaviour names it, the two files never import each other, and the contract between
     * them is a word in a document, which is the only kind two separately written scripts can
     * share.
     *
     * **None of this decides whether a script runs.** It is a diagnosis and never a gate: refusing
     * to run would make a half built object behave differently from a broken one, and building is
     * mostly half built objects.
     */
    requires?: TScriptRequirement[];
};

/**
 * One script attached to one object: which behaviour, and what it was given.
 *
 * `props` is already resolved, the script's own defaults with the saved values laid over them, so
 * this says what the behaviour **actually ran with**, which is the question anything reading it
 * has.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptAttachment = {
    id: string;
    ref: string;
    props: TScriptProps;
};

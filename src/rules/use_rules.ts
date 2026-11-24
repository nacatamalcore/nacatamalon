import { getActiveBox, getActiveGame } from '../store';
import { documentComponentIds } from '../scene/document/built_from';
import { getColor } from '../color/get_color';
import { playAttachment, soundOf } from '../audio/attachment_players';
import type { TText } from '../gameobjects/text/types/t_text';
import { outsideSceneBody } from '../utils/outside_scene_body';
import { nanoId } from '../utils';
import { useTimer } from '../hooks/timer/use_timer';
import { useScene } from '../hooks/scene/use_scene';
import { useReady } from '../hooks/scene/use_ready';
import { useUpdate } from '../hooks/loop/use_update';
import { useActions } from '../hooks/input/use_actions';
import { traceRule, tracingRules } from './trace';
import { conditionReadable } from './parse_rules';
import type { TRuleTrace } from './trace';
import { sendReport, watchReports } from '../events/reports';
import { getGameStore } from '../game_store/store_registry';
import { findBoxRef } from '../box/find_object';
import { rootOf } from '../box/root_of';
import { destroy } from '../destroy/destroy';
import type { TBox } from '../box';
import type { TGameObject } from '../hooks/spawn/use_spawn';
import type { TRule, TRuleBox, TRuleCompare, TRuleCondition, TRuleStep } from './types/t_rule';

/**
 * The rules each object carries, by attachment, as they were given: what writing a scene down
 * writes back. A map beside the objects, as reports are, so an object stays plain data.
 */
const attached = new WeakMap<TBox, Array<{ id: string; rules: TRule[] }>>();

/**
 * The rules `box` carries, one entry per `useRules`, in the order they were attached.
 *
 * @internal
 */
export const rulesOf = (box: TBox): ReadonlyArray<{ id: string; rules: readonly TRule[] }> => attached.get(box) ?? [];

/**
 * Options of `useRules`.
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseRulesOptions = {
    /**
     * The attachment's identity, kept across saving and opening: what a scene read from a file
     * passes. Left out, it gets a fresh one.
     */
    id?: string;
};

/** How deep rules may set one another off in one go before it is taken for a loop. */
const MOST_NESTED = 32;
let nested = 0;

/** Each problem said once per rule, not every time it fires. */
const said = new WeakMap<TBox, Set<string>>();
const sayOnce = (box: TBox, key: string, message: string): void => {
    const known = said.get(box) ?? new Set<string>();
    said.set(box, known);
    if (known.has(key)) return;
    known.add(key);
    console.warn(message);
};

/**
 * A sound by its name on a box, or on one of the boxes inside it, nearest first: a box of sounds,
 * each sound a box of its own, named by its sound or by its own name (its first sound then, so the
 * file it plays can change). What plays it, or `null`.
 */
const soundInside = (box: TBox, name: string): (() => boolean) | null => {
    let level: TBox[] = [box];
    while (level.length > 0) {
        for (const each of level) {
            const own = soundOf(each, name);
            if (own !== null) return () => (own.play(), true);
            const first = each !== box && each.name === name ? each.sounds[0] : undefined;
            if (first !== undefined) return () => playAttachment(first);
        }
        level = level.flatMap((each) => each.children.filter((child) => !child.destroyed));
    }
    return null;
};

/**
 * What came with a report under `key`: its own field (never one it inherits, `constructor`), or,
 * when it came with one plain value (`useReport<number>`), that value as `value`.
 */
const payloadAt = (payload: unknown, key: string): unknown => {
    if (typeof payload === 'object' && payload !== null) return Object.hasOwn(payload, key) ? (payload as Record<string, unknown>)[key] : undefined;
    return key === 'value' ? payload : undefined;
};

/**
 * Words with `{key}` given what came with a report: `"{by} HITS IT OUT!"` with `{ by: 'NACA' }`. A
 * key it did not bring (or a rule that heard no report, one that starts with the scene) is left as
 * it is written, so the mistake shows.
 */
const fillIn = (words: string, payload: unknown): string =>
    words.replace(/\{(\w+)\}/g, (whole, key: string) => {
        const value = payloadAt(payload, key);
        if (value === undefined || value === null) return whole;
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });

/**
 * Compares as a person reads it: numbers as numbers, and anything else as text for `==` and `!=`.
 */
const holds = (seen: unknown, is: TRuleCompare, value: string | number | boolean): boolean => {
    if (is === '==' || is === '!=') {
        const same = typeof seen === 'number' && typeof value === 'number' ? seen === value : String(seen) === String(value);
        return is === '==' ? same : !same;
    }
    const a = Number(seen);
    const b = Number(value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return is === '<' ? a < b : is === '<=' ? a <= b : is === '>' ? a > b : a >= b;
};

/**
 * Gives an object rules: when something happens, if these hold, do these (`TRule`). A scene's
 * `rules` component is this, and a game can call it too.
 *
 * Rules run while the game is played and not while a scene is being edited, as behaviours do. They
 * start listening once the scene is ready, so a box placed after this one in the file is there to
 * be found, and they keep listening for as long as the object lives.
 *
 * What a rule waits for it hears from the whole scene, copies made later included, after whoever
 * listens with `onReport` and without taking it from them. What it acts on is found when it acts,
 * so a box that is gone by then is said once and passed by, and the rest of the rule goes on.
 *
 * Rules are their box's: gone with it, a rule still doing its steps stops at its next `wait`, as its
 * box's timers do. Rules that wait for something beyond their box (a coin picked, then a door
 * opened a second later) go on a box that stays: the scene's root, or one of its own.
 *
 * @param rules The rules.
 * @param options Its identity, for a scene read from a file.
 *
 * @example
 * ```ts
 * useRules([{
 *     id: 'open-when-picked',
 *     when: { on: 'report', box: 'Key', report: 'picked' },
 *     do: [{ do: 'call', box: 'Door', script: 'door', action: 'open' }],
 *     once: true,
 * }]);
 * ```
 *
 * @category Rules
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRules = (rules: readonly TRule[], options: TUseRulesOptions = {}): void => {
    const self = getActiveBox();
    const game = getActiveGame();
    if (self === null || game === null) {
        throw outsideSceneBody('useRules');
    }
    const own = structuredClone([...rules]) as TRule[];
    const list = attached.get(self) ?? [];
    list.push({ id: options.id ?? nanoId(), rules: own });
    attached.set(self, list);

    // A scene shown rather than played keeps its rules and runs none, as with its behaviours.
    if (game.get('world').buildScripts === 'attach') {
        return;
    }

    // The seconds the scene has run, for what is traced. Before the timer, so a step after a wait is
    // traced at the time it runs, not the frame before. One assignment a frame per box with rules.
    let time = 0;
    useUpdate((_delta, now) => {
        time = now;
    });
    const timer = useTimer();
    const scene = useScene();
    const done = new Set<TRule>();
    const where = (rule: TRule): string => `[NacatamalOn] rule '${rule.id}' on '${self.name}'`;
    const trace = (rule: TRule, what: TRuleTrace['what'], more: Partial<TRuleTrace> = {}): void => {
        if (tracingRules()) traceRule({ what, box: self.id, boxName: self.name, rule, time, ...more });
    };

    /** The box a step means, or why there is none, said once. */
    const boxFor = (rule: TRule, ref: TRuleBox, from: TBox | null): TBox | string => {
        const box = ref === '' ? self : ref === '@from' ? from : findBoxRef(self, ref);
        if (box === null || box.destroyed) {
            const why = `there is no box '${ref}' to act on`;
            sayOnce(self, `${rule.id}\u0000box\u0000${ref}`, `${where(rule)}: ${why}, so that step is passed by. Name a box of the scene, by its id or its name.`);
            return why;
        }
        return box;
    };

    /** What a condition reads now. */
    const seenBy = (condition: TRuleCondition, payload: unknown): unknown => {
        if ('payload' in condition) return payloadAt(payload, condition.payload);
        const store = getGameStore(condition.store);
        return store === null ? undefined : (store.get() as Record<string, unknown>)[condition.field];
    };

    const passes = (rule: TRule, condition: TRuleCondition, payload: unknown): boolean => {
        if (!conditionReadable(condition)) {
            sayOnce(self, `${rule.id}\u0000if\u0000${JSON.stringify(condition)}`, `${where(rule)}: its condition ${JSON.stringify(condition)} cannot be read, so it never holds. Write it as { store, field, is, value } or { payload, is, value }, is one of == != < <= > >=.`);
            return false;
        }
        if (!('payload' in condition) && getGameStore(condition.store) === null) {
            sayOnce(self, `${rule.id}\u0000if\u0000${condition.store}`, `${where(rule)}: its condition reads the store '${condition.store}', which there is not, so it never holds. Make stores/${condition.store}.store.`);
            return false;
        }
        return holds(seenBy(condition, payload), condition.is, condition.value);
    };

    /** Does one step: nothing when it was done, why when it was passed by. */
    const step = (rule: TRule, todo: TRuleStep, from: TBox | null, payload: unknown): string | null => {
        switch (todo.do) {
            case 'call': {
                const box = boxFor(rule, todo.box, from);
                if (typeof box === 'string') return box;
                const api = box.scriptApis.get(todo.script) as Record<string, unknown> | undefined;
                const fn = api?.[todo.action];
                if (typeof fn !== 'function') {
                    const why = `'${box.name}' has no '${todo.script}' that can be told to '${todo.action}'`;
                    sayOnce(self, `${rule.id}\u0000call\u0000${box.id}\u0000${todo.script}\u0000${todo.action}`,
                        `${where(rule)}: ${why}. Give it that behaviour, or call an action it declares.`);
                    return why;
                }
                (fn as (params: unknown) => unknown).call(api, { ...todo.params });
                return null;
            }
            case 'destroy': {
                const box = boxFor(rule, todo.box, from);
                if (typeof box === 'string') return box;
                destroy(box as TGameObject);
                return null;
            }
            case 'show':
            case 'hide': {
                const box = boxFor(rule, todo.box, from);
                if (typeof box === 'string') return box;
                box.visible = todo.do === 'show';
                return null;
            }
            case 'say': {
                const box = boxFor(rule, todo.box, from);
                if (typeof box === 'string') return box;
                // The texts it is laid out with: not those a behaviour made on it (a waving title's letters).
                const own = documentComponentIds(box, 'text');
                const texts = box.drawables.filter((drawable): drawable is TText => drawable.type === 'text' && (own === null || own.has(drawable.id)));
                if (texts.length === 0) {
                    const why = `'${box.name}' has no text to say it with`;
                    sayOnce(self, `${rule.id}\u0000say\u0000${box.id}`, `${where(rule)}: ${why}, so that step is passed by. Say it on a box with a text.`);
                    return why;
                }
                const said = fillIn(todo.text, payload);
                for (const label of texts) label.text = said;
                // The one in front: a shadow comes before it.
                if (todo.color !== undefined) texts[texts.length - 1]!.tint = getColor(todo.color);
                return null;
            }
            case 'sound': {
                const box = boxFor(rule, todo.box, from);
                if (typeof box === 'string') return box;
                const name = fillIn(todo.sound, payload);
                const first = box.sounds[0];
                const play = name === '' ? (first === undefined ? null : () => playAttachment(first)) : soundInside(box, name);
                if (play === null || !play()) {
                    const why = name === '' ? `'${box.name}' carries no sound` : `'${box.name}' carries no sound '${name}'`;
                    sayOnce(self, `${rule.id}\u0000sound\u0000${box.id}\u0000${name}`, `${where(rule)}: ${why}, so that step is passed by. Give the box a sound component, or name one it carries.`);
                    return why;
                }
                return null;
            }
            case 'store': {
                const store = getGameStore(todo.store);
                if (store === null) {
                    const why = `there is no store '${todo.store}'`;
                    sayOnce(self, `${rule.id}\u0000store\u0000${todo.store}`, `${where(rule)}: ${why}, so that step is passed by. Make stores/${todo.store}.store.`);
                    return why;
                }
                store.set((state) => {
                    const fields = state as Record<string, unknown>;
                    if (todo.add !== undefined) fields[todo.field] = (Number(fields[todo.field]) || 0) + todo.add;
                    else if (todo.set !== undefined) fields[todo.field] = todo.set;
                });
                return null;
            }
            // Empty, a step still being written: nothing to do yet.
            case 'report':
                if (todo.report === '') return 'it tells nothing yet';
                sendReport(self, todo.report, undefined);
                return null;
            case 'scene':
                if (todo.scene === '') return 'it names no scene yet';
                scene.change(todo.scene);
                return null;
            default: {
                const why = `it does '${String((todo as { do?: unknown }).do)}', which this engine does not know`;
                sayOnce(self, `${rule.id}\u0000do\u0000${String((todo as { do?: unknown }).do)}`, `${where(rule)}: ${why}, so that step is passed by.`);
                return why;
            }
        }
    };

    /** The rule's steps from `at`, a wait handing the rest to the timer. One that throws ends it. */
    const runFrom = (rule: TRule, at: number, from: TBox | null, payload: unknown): void => {
        if (self.destroyed) return;
        for (let i = at; i < rule.do.length; i++) {
            const todo = rule.do[i]!;
            if (todo.do === 'wait') {
                trace(rule, 'step', { step: i });
                timer.after(Math.max(0, Number(todo.seconds) || 0), () => runFrom(rule, i + 1, from, payload));
                return;
            }
            let why: string | null;
            try {
                why = step(rule, todo, from, payload);
            } catch (error) {
                // One rule broken (an action that threw, a scene not there) is its own: the others, and
                // the scene starting, go on.
                console.error(`${where(rule)}: step ${i + 1} threw, so the rest of this rule is passed by. Look at the action it calls, or the scene it goes to.`, error);
                trace(rule, 'threw', { step: i, said: error instanceof Error ? error.message : String(error) });
                return;
            }
            trace(rule, why === null ? 'step' : 'passed', { step: i, ...(why === null ? {} : { said: why }) });
        }
    };

    const fire = (rule: TRule, payload: unknown, from: TBox | null): void => {
        if (self.destroyed) return;
        const sender = from === null ? {} : { from: { id: from.id, name: from.name } };
        if (rule.once === true && done.has(rule)) {
            trace(rule, 'once', sender);
            return;
        }
        const conditions = rule.if ?? [];
        const failing = conditions.findIndex((condition) => !passes(rule, condition, payload));
        if (failing >= 0) {
            const held = conditions[failing]!;
            const unread = !conditionReadable(held);
            const missing = !unread && !('payload' in held) && getGameStore(held.store) === null;
            const said = unread ? 'its condition cannot be read' : missing ? `there is no store '${held.store}'` : null;
            trace(rule, 'held', { ...sender, condition: failing, seen: unread ? null : seenBy(held, payload) ?? null, ...(said === null ? {} : { said }) });
            return;
        }
        if (nested >= MOST_NESTED) {
            sayOnce(self, `${rule.id}\u0000loop`, `${where(rule)}: rules set one another off more than ${MOST_NESTED} deep at once, so it stops here. Look for a rule that reports what it listens to.`);
            trace(rule, 'passed', { ...sender, said: `rules set one another off more than ${MOST_NESTED} deep` });
            return;
        }
        done.add(rule);
        trace(rule, 'fired', sender);
        nested++;
        try {
            runFrom(rule, 0, from, payload);
        } finally {
            nested--;
        }
    };

    /**
     * Whether a report from `from` is one a rule waiting on `ref` waits for: sent by that box or by
     * anything inside it, as `onReport` on it would hear (a coin whose pickup is on a piece of it).
     */
    const sentBy = (from: TBox, ref: TRuleBox): boolean => {
        for (let box: TBox | null = from; box !== null; box = box.parent) {
            if (ref === '' ? box === self : box.id === ref || box.name === ref) return true;
        }
        return false;
    };
    /** The same for a rule waiting on a tag: sent by a box carrying it, or by anything inside one. */
    const sentByTagged = (from: TBox, tag: string): boolean => {
        if (tag === '') return false;
        for (let box: TBox | null = from; box !== null; box = box.parent) if (box.tags.includes(tag)) return true;
        return false;
    };

    for (const rule of own) trace(rule, 'armed');

    // Listening from now, as the object is built and before anything in the scene is ready, so a
    // report sent by another rule as the scene starts, or from another ready, is heard. On the scene,
    // so whatever is in it is heard, made later or not; let go with this box.
    const heard = own.filter((rule) => rule.when.on === 'report');
    if (heard.length > 0) {
        watchReports(rootOf(self), (name, payload, from) => {
            for (const rule of heard) {
                const when = rule.when as Extract<TRule['when'], { on: 'report' }>;
                if (when.report !== name) continue;
                if ('tag' in when ? sentByTagged(from, when.tag) : sentBy(from, when.box)) fire(rule, payload, from);
            }
        });
    }

    const pressing = own.filter((rule) => rule.when.on === 'action');
    if (pressing.length > 0) {
        const actions = useActions();
        useUpdate(() => {
            for (const rule of pressing) {
                const when = rule.when as Extract<TRule['when'], { on: 'action' }>;
                if (when.action === '') continue;
                if (!actions.has(when.action)) {
                    sayOnce(self, `${rule.id}\u0000action\u0000${when.action}`, `${where(rule)}: it waits for the action '${when.action}', which the game does not have. Add it to the actions of createGame or of the project.`);
                    continue;
                }
                if (when.phase === 'released' ? actions.justReleased(when.action) : actions.justPressed(when.action)) fire(rule, undefined, null);
            }
        });
    }

    for (const rule of own) {
        const when = rule.when;
        if (when.on !== 'click') continue;
        game.get('input').pointer.claimClicks(self, {
            // In its own scene, as a report is heard: another's "Continue" is not this one's.
            matches: (box) => rootOf(box) === rootOf(self) && !rootOf(self).paused
                && ('tag' in when ? when.tag !== '' && box.tags.includes(when.tag)
                    : when.box === '' ? box === self : box.id === when.box || box.name === when.box),
            click: (box) => fire(rule, undefined, box),
        });
    }
    useReady(() => {
        for (const rule of own) {
            if (rule.when.on === 'start') fire(rule, undefined, null);
        }
    });
};

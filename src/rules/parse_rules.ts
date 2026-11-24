import type { TScriptProps } from '../scripts/types/t_script';
import type { TRule, TRuleCompare, TRuleCondition, TRuleStep, TRuleWhen } from './types/t_rule';

const COMPARES: readonly TRuleCompare[] = ['==', '!=', '<', '<=', '>', '>='];

const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

const text = (value: unknown): value is string => typeof value === 'string';
const scalar = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

const parseWhen = (raw: unknown): TRuleWhen | null => {
    const when = record(raw);
    if (when === null) return null;
    if (when.on === 'start') return { on: 'start' };
    // An empty report is a rule still being written: kept, and it waits for nothing.
    // An empty tag too, as an empty report: a rule still being written, kept, hearing nobody.
    if (when.on === 'report' && text(when.tag) && text(when.report)) {
        return { on: 'report', tag: when.tag, report: when.report };
    }
    if (when.on === 'report' && text(when.box) && text(when.report)) {
        return { on: 'report', box: when.box, report: when.report };
    }
    if (when.on === 'action' && text(when.action)) {
        return { on: 'action', action: when.action, ...(when.phase === 'released' ? { phase: 'released' as const } : {}) };
    }
    if (when.on === 'click' && text(when.tag)) return { on: 'click', tag: when.tag };
    if (when.on === 'click' && text(when.box)) return { on: 'click', box: when.box };
    return null;
};

const readCondition = (raw: unknown): TRuleCondition | null => {
    const condition = record(raw);
    if (condition === null || !COMPARES.includes(condition.is as TRuleCompare) || !scalar(condition.value)) return null;
    const is = condition.is as TRuleCompare;
    if (text(condition.payload)) return { payload: condition.payload, is, value: condition.value };
    if (text(condition.store) && text(condition.field)) return { store: condition.store, field: condition.field, is, value: condition.value };
    return null;
};

/**
 * Whether a condition is one the rules can read (`is: "="` is not): one that is not never holds,
 * rather than being left out and letting its rule go on unchecked.
 *
 * @internal
 */
export const conditionReadable = (condition: unknown): condition is TRuleCondition => readCondition(condition) !== null;

/** A condition as written, or, when it cannot be read, kept as it was so the file loses nothing. */
const parseCondition = (raw: unknown): TRuleCondition => readCondition(raw) ?? ({ ...(record(raw) ?? { value: raw }) } as unknown as TRuleCondition);

const parseParams = (raw: unknown): TScriptProps | undefined => {
    const params = record(raw);
    if (params === null) return undefined;
    const kept: TScriptProps = {};
    for (const [key, value] of Object.entries(params)) if (scalar(value)) kept[key] = value;
    return Object.keys(kept).length > 0 ? kept : undefined;
};

const parseStep = (raw: unknown): TRuleStep | null => {
    const step = record(raw);
    if (step === null) return null;
    switch (step.do) {
        case 'call': {
            if (!text(step.box) || !text(step.script) || !text(step.action)) return null;
            const params = parseParams(step.params);
            return { do: 'call', box: step.box, script: step.script, action: step.action, ...(params ? { params } : {}) };
        }
        case 'destroy':
        case 'show':
        case 'hide':
            return text(step.box) ? { do: step.do, box: step.box } : null;
        case 'say':
            return text(step.box) && text(step.text)
                ? { do: 'say', box: step.box, text: step.text, ...(text(step.color) && step.color !== '' ? { color: step.color } : {}) }
                : null;
        case 'sound':
            return text(step.box) && text(step.sound) ? { do: 'sound', box: step.box, sound: step.sound } : null;
        case 'store': {
            if (!text(step.store) || !text(step.field)) return null;
            if (typeof step.add === 'number' && Number.isFinite(step.add)) return { do: 'store', store: step.store, field: step.field, add: step.add };
            if (scalar(step.set)) return { do: 'store', store: step.store, field: step.field, set: step.set };
            return null;
        }
        case 'report':
            return text(step.report) ? { do: 'report', report: step.report } : null;
        case 'scene':
            return text(step.scene) ? { do: 'scene', scene: step.scene } : null;
        case 'wait':
            return typeof step.seconds === 'number' && Number.isFinite(step.seconds) && step.seconds >= 0 ? { do: 'wait', seconds: step.seconds } : null;
        default:
            return null;
    }
};

/**
 * The rules of a `rules` component as a file holds them: each kept with what of it is understood. A
 * rule with no `when` it knows is left out, and so is a step it does not know, rather than handed on
 * to something that would trip on it. A condition it cannot read is kept as written, and never holds.
 *
 * @internal
 */
export const parseRules = (raw: unknown): TRule[] => {
    if (!Array.isArray(raw)) return [];
    const rules: TRule[] = [];
    for (const entry of raw) {
        const rule = record(entry);
        if (rule === null || !text(rule.id)) continue;
        const when = parseWhen(rule.when);
        if (when === null) continue;
        const conditions = Array.isArray(rule.if) ? rule.if.map(parseCondition) : [];
        const steps = Array.isArray(rule.do) ? rule.do.map(parseStep).filter((s): s is TRuleStep => s !== null) : [];
        rules.push({
            id: rule.id,
            when,
            ...(conditions.length > 0 ? { if: conditions } : {}),
            do: steps,
            ...(rule.once === true ? { once: true } : {}),
        });
    }
    return rules;
};

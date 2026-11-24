import type { TBoxNode } from './types/t_scene_doc';
import type { TRule } from '../../rules/types/t_rule';
import type { TScriptProps } from '../../scripts/types/t_script';

/**
 * Settings with every text that is one of `renewed`'s old ids given its new one. Settings are only
 * text, numbers and true or false, and an id is a long random word, so a text that is one is that box.
 */
const relinkProps = (props: TScriptProps, renewed: ReadonlyMap<string, string>): TScriptProps => {
    const next: TScriptProps = {};
    for (const [key, value] of Object.entries(props)) {
        next[key] = typeof value === 'string' ? renewed.get(value) ?? value : value;
    }
    return next;
};

/**
 * `rules` with every box they name, and every setting an action is called with, by one of
 * `renewed`'s old ids named by its new one.
 *
 * @internal
 */
export const renewRuleBoxes = (rules: TRule[], renewed: ReadonlyMap<string, string>): TRule[] => {
    const box = (ref: string): string => renewed.get(ref) ?? ref;
    return rules.map((rule) => ({
        ...rule,
        when: 'box' in rule.when ? { ...rule.when, box: box(rule.when.box) } : rule.when,
        do: rule.do.map((todo) => {
            if (todo.do === 'call') return { ...todo, box: box(todo.box), ...(todo.params ? { params: relinkProps(todo.params, renewed) } : {}) };
            return 'box' in todo ? { ...todo, box: box(todo.box) } : todo;
        }),
    }));
};

/**
 * What a copy carries that names a box of the copy by its id, made to name the copy's own: a mask's
 * shape, a behaviour's `'box'` setting, a rule's boxes. `renewed` holds each box's old id with its
 * new one; what names a box outside the copy is left as it is.
 *
 * @internal
 */
export const relinkIds = (node: TBoxNode, renewed: ReadonlyMap<string, string>): void => {
    for (const component of node.components) {
        if (component.type === 'mask' && component.by !== undefined && renewed.has(component.by)) {
            component.by = renewed.get(component.by)!;
        }
        if (component.type === 'script' && component.props !== undefined) {
            component.props = relinkProps(component.props, renewed);
        }
        if (component.type === 'rules') {
            component.rules = renewRuleBoxes(component.rules, renewed);
        }
    }
    node.children.forEach((child) => relinkIds(child, renewed));
};

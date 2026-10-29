import { buildUniformLayout, ENGINE_FIELDS, MAX_MATERIAL_FLOATS, POST_ENGINE_FIELDS } from '../render/shared/material_uniforms';
import { getActiveGame } from '../store/active_game';
import { firstTimeIn } from '../utils/first_time_in';
import { POST_RULES } from './derive_signature';
import type { TSignatureRules } from './derive_signature';
import type { TUniformSignature } from './types/t_uniforms';

/**
 * Says, once, that a material or a screen effect asks for more numbers than one holds.
 *
 * Said here, where it is made, and not where it is drawn: the card that draws it would say it a
 * frame later or not at all, and the two cards would say it differently. Each card still leaves it
 * out on its own, quietly, since this has already said why.
 *
 * Said once per name and size, not per copy: a hundred sprites on one material are one mistake.
 *
 * @param sig Its parameters, with the file's when there is one.
 * @param rules Whose rules they were read by, which says whose words to use.
 * @param name Its name, when it has one.
 * @returns Whether they fit.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const checkParameterRoom = (sig: TUniformSignature, rules: TSignatureRules, name: string | null): boolean => {
    const post = rules === POST_RULES;
    const needed = buildUniformLayout(sig, post ? POST_ENGINE_FIELDS : ENGINE_FIELDS).floatCount;
    if (needed <= MAX_MATERIAL_FLOATS) {
        return true;
    }

    const kind = post ? 'effect' : 'material';
    const subject = name !== null ? `the ${kind} "${name}"` : `a ${kind}`;
    const engine = post ? 'mu.time, mu.resolution, mu.progress and mu.phase' : 'mu.time and mu.resolution';
    const outcome = post ? 'so it is skipped and the frame shows unchanged' : 'so it draws with the built-in look';
    if (firstTimeIn(getActiveGame(), `${rules.caller}: ${name ?? ''} needs ${needed}`)) {
        console.warn(
            `[NacatamalOn] ${rules.caller}: ${subject} needs ${needed} numbers for its parameters and one holds ` +
            `${MAX_MATERIAL_FLOATS}, ${engine} included, ${outcome}. Use fewer parameters, or write the single ` +
            'numbers one after another so none leaves a gap before a vec3 or vec4.',
        );
    }
    return false;
};

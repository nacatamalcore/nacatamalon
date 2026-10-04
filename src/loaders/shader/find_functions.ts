/**
 * A function found in a shader file: what it is called, and where it starts and stops.
 *
 * The bounds are into the **original** text, never into the working copy, so what gets emitted is
 * what the author typed.
 */
export type TShaderFunction = {
    name: string;
    start: number;
    end: number;
};

/**
 * Replaces every comment with spaces, keeping the line breaks.
 *
 * Keeping the length is the whole trick: the scan copy and the original stay the same size, so a
 * position found in one is the same position in the other. That is what lets the emitted source be
 * **identical byte for byte** to what was written, comments and spacing and all, instead of being a
 * tidied-up version of it. It also means a brace inside a comment cannot be mistaken for the end of
 * a function.
 */
const blankComments = (source: string): string => {
    let out = '';
    let at = 0;

    while (at < source.length) {
        const two = source.slice(at, at + 2);

        if (two === '//') {
            const end = source.indexOf('\n', at);
            const stop = end === -1 ? source.length : end;
            out += ' '.repeat(stop - at);
            at = stop;
            continue;
        }

        if (two === '/*') {
            const end = source.indexOf('*/', at + 2);
            const stop = end === -1 ? source.length : end + 2;
            for (let i = at; i < stop; i++) {
                out += source[i] === '\n' ? '\n' : ' ';
            }
            at = stop;
            continue;
        }

        out += source[at];
        at += 1;
    }

    return out;
};

/**
 * WGSL names its functions with a keyword, which makes them unmistakable.
 */
const WGSL_FUNCTION = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * GLSL has no keyword, so a definition looks exactly like a call with a type in front of it. Anchored
 * to the start of a line, which is where a definition is and where a call almost never is.
 */
const GLSL_FUNCTION = /^[ \t]*(?:[A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;

/**
 * Finds every function a shader file defines, in the order they appear.
 *
 * Which language it is written in is **worked out, not declared**: WGSL says `fn`, GLSL does not.
 * Asking the author to say so as well would be asking them to repeat something the file already
 * makes obvious, and to be able to get it wrong.
 *
 * The end of a function is found by counting braces from its first one, which is why the comments
 * were blanked first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findFunctions = (source: string): TShaderFunction[] => {
    const scan = blankComments(source);
    const isWgsl = /\bfn\s+[A-Za-z_]/.test(scan);
    const pattern = isWgsl ? WGSL_FUNCTION : GLSL_FUNCTION;
    pattern.lastIndex = 0;

    const found: TShaderFunction[] = [];
    let match = pattern.exec(scan);

    while (match !== null) {
        const open = scan.indexOf('{', match.index);
        if (open === -1) {
            break;
        }

        let depth = 0;
        let at = open;
        while (at < scan.length) {
            if (scan[at] === '{') {
                depth += 1;
            } else if (scan[at] === '}') {
                depth -= 1;
                if (depth === 0) {
                    break;
                }
            }
            at += 1;
        }

        found.push({ name: match[1] as string, start: match.index, end: at + 1 });
        pattern.lastIndex = at + 1;
        match = pattern.exec(scan);
    }

    return found;
};

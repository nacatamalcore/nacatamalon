/**
 * A file's two halves. `glsl` is empty for a file that only speaks WGSL, which is most of them.
 */
export type TShaderSections = {
    wgsl: string;
    glsl: string;
};

/**
 * A line that is nothing but `// @wgsl` or `// @glsl`, which is how a half is opened.
 */
const MARKER = /^[ \t]*\/\/[ \t]*@(wgsl|glsl)[ \t]*$/gm;

/**
 * Splits a shader file into its WGSL half and its GLSL half.
 *
 * A file with no markers at all is WGSL from top to bottom, which keeps the common case free of
 * ceremony: an effect for WebGPU only is just WGSL in a file.
 *
 * Each half runs from its marker to the next one or to the end, and two halves of the same language
 * are joined, so an author may go back and forth if that reads better.
 *
 * **A file with a GLSL half and no WGSL one is refused.** WGSL is the one this engine compiles
 * everywhere it can; a file that only has the fallback is a file that works on the older card and
 * not on the newer one, which is never what anybody meant.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const splitSections = (source: string, src: string): TShaderSections => {
    MARKER.lastIndex = 0;
    const marks: Array<{ language: 'wgsl' | 'glsl'; from: number; to: number }> = [];

    let match = MARKER.exec(source);
    while (match !== null) {
        marks.push({
            language: match[1] as 'wgsl' | 'glsl',
            from: match.index + match[0].length,
            to: source.length,
        });
        const previous = marks[marks.length - 2];
        if (previous !== undefined) {
            previous.to = match.index;
        }
        match = MARKER.exec(source);
    }

    if (marks.length === 0) {
        return { wgsl: source, glsl: '' };
    }

    let wgsl = '';
    let glsl = '';
    for (const mark of marks) {
        const body = source.slice(mark.from, mark.to);
        if (mark.language === 'wgsl') {
            wgsl += body;
        } else {
            glsl += body;
        }
    }

    if (wgsl.trim() === '') {
        throw new Error(
            `[NacatamalOn] useLoadShader: '${src}' has a @glsl half and no @wgsl one. ` +
            'WGSL is the half this engine compiles wherever it can, so it is the one that has to be there.',
        );
    }

    return { wgsl, glsl };
};

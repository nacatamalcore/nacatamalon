/**
 * How many extra maps a model's material may carry besides its picture.
 *
 * Fixed, and small, on purpose: every material shader declares this many slots whether it uses them
 * or not, so there is one layout on each backend and nothing to rebuild when a material gains a map.
 * Four covers what the consoles of the era combined in practice (a picture, a reflection, a detail
 * and a mask) with room to spare.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_MATERIAL_MAPS = 4;

/**
 * What a map may be called: it becomes part of a function name in the shader, `sampleMap_<name>`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAP_NAME = /^[a-z][A-Za-z0-9]*$/;

/**
 * The maps a shader reads, in the order it first reads them: that order is which slot each one is
 * given.
 *
 * Read from the code itself rather than declared, so a hand-written file, a graph and a hook typed
 * at the call site all work the same with nothing new to write, and the shader's text alone decides
 * its slots: two materials running one shader with different maps share its compiled pipeline.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mapNamesOf = (...sources: readonly (string | null | undefined)[]): string[] => {
    const names: string[] = [];
    for (const source of sources) {
        if (source === null || source === undefined) {
            continue;
        }
        for (const found of source.matchAll(/\bsampleMap_([a-z][A-Za-z0-9]*)\s*\(/g)) {
            const name = found[1]!;
            if (!names.includes(name)) {
                names.push(name);
            }
        }
    }
    return names;
};

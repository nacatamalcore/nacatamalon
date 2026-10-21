/**
 * The keys already said to be taken, so a scene that asks every time it starts says it once.
 */
const said = new Set<string>();

/**
 * Says that a key already names another file. The cache keeps one thing per key, so the second file
 * is not loaded and whatever asked for it gets the first: without a word, the wrong picture or the
 * wrong sound turns up and nothing says why. Asking again for the same file under its key is the
 * ordinary case, and says nothing.
 *
 * @param hook Who asked, for the message: `'useLoadTexture'`.
 * @param key The key both were asked under.
 * @param kept What it already names.
 * @param asked What was asked for now.
 *
 * @internal
 */
export const warnIfKeyTaken = (hook: string, key: string, kept: string, asked: string): void => {
    if (kept === asked) return;
    const id = `${hook}:${key}:${asked}`;
    if (said.has(id)) return;
    said.add(id);
    console.warn(`[NacatamalOn] ${hook}: the key '${key}' already names '${kept}', so '${asked}' was not loaded and the first is used. Give each file a key of its own.`);
};

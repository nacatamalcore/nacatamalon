import { VERSION } from '../version';
import { getActiveGame } from '../store';
import { firstTimeIn } from '../utils/first_time_in';

/**
 * A version as three numbers and what comes after a hyphen (`0.7.0-beta.1` has `beta` and `1`),
 * which goes before the same three numbers without it.
 */
type TVersion = { parts: [number, number, number]; pre: readonly string[] };

/**
 * One test a version has to pass: `>=0.7.0` is `{ op: '>=', version: 0.7.0 }`. `null` passes
 * everything (`*`).
 */
type TComparator = { op: '<' | '<=' | '>' | '>=' | '='; version: TVersion } | null;

/**
 * A version as a range writes it: up to three numbers, any of them `x`, `X` or `*` (or left out),
 * then what comes after a hyphen and after a plus, which no comparison reads. No number starts with a
 * 0 unless it is 0, as npm has it.
 */
const PARTIAL = /^v?(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * A partial version: the numbers it wrote, up to the first one left out or written as a wildcard.
 */
type TPartial = { parts: number[]; pre: readonly string[] };

const readPartial = (text: string): TPartial | null => {
    const match = PARTIAL.exec(text);
    if (!match) return null;
    const parts: number[] = [];
    for (const part of [match[1], match[2], match[3]]) {
        if (part === undefined || /^[xX*]$/.test(part)) break;
        parts.push(Number(part));
    }
    // What follows a hyphen belongs to a whole version only: `1.2-beta` is not one.
    const pre = match[4] === undefined ? [] : match[4].split('.');
    if (pre.length > 0 && parts.length < 3) return null;
    return { parts, pre };
};

/**
 * The version a text names, `null` when it is not a whole one.
 */
const readVersion = (text: string): TVersion | null => {
    const read = readPartial(text.trim());
    return read !== null && read.parts.length === 3 ? { parts: read.parts as [number, number, number], pre: read.pre } : null;
};

/**
 * Two parts after the hyphen, as npm orders them: numbers by size and before words, words by their
 * letters.
 */
const compareIdentifier = (a: string, b: string): number => {
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber) return Number(a) - Number(b);
    if (aNumber) return -1;
    if (bNumber) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Negative when `a` is older than `b`, positive when newer, 0 when the same.
 */
const compare = (a: TVersion, b: TVersion): number => {
    for (let i = 0; i < 3; i++) {
        if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
    }
    if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
        if (a.pre[i] === undefined) return -1;
        if (b.pre[i] === undefined) return 1;
        const order = compareIdentifier(a.pre[i], b.pre[i]);
        if (order !== 0) return order;
    }
    return 0;
};

/**
 * A version from its numbers. `floor` is the lowest version there is with them, `-0` after them, which
 * a bound below a version uses so that none of its previews gets in either.
 */
const version = (major: number, minor: number, patch: number, floor = false): TVersion => ({ parts: [major, minor, patch], pre: floor ? ['0'] : [] });

/**
 * The first version past a partial one: past `1` is `2.0.0`, past `1.2` is `1.3.0`. As a bound below
 * (`<`) it is the `floor` of that version, so its previews are left out too; as a bound from (`>=`)
 * it is the version itself, which names no preview and so lets none in.
 */
const past = ({ parts }: TPartial, floor: boolean): TVersion =>
    parts.length === 1 ? version(parts[0] + 1, 0, 0, floor) : version(parts[0], parts[1] + 1, 0, floor);

/**
 * A partial version with what it left out as zeros.
 */
const filled = ({ parts, pre }: TPartial): TVersion => ({ parts: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], pre });

/**
 * The tests one word of a range stands for, as npm reads it: `>=0.7.0` is one; `^0.7.0` and `~0.7.0`
 * two (from it, and below the next version it does not take); a bare `0.7` two (any `0.7.x`), `*`
 * none. A partial version after a comparison is read as a whole one would be: `>1` is from `2.0.0`,
 * `<=1.2` is below `1.3.0`. `null` when the word is not one.
 */
const readWord = (word: string): TComparator[] | null => {
    const op = /^(<=|>=|<|>|=|\^|~>?)?(.*)$/.exec(word)!;
    const read = readPartial(op[2]);
    if (!read) return null;
    const written = read.parts.length;
    const from = filled(read);
    const [major, minor, patch] = from.parts;
    const kind = op[1] === '~>' ? '~' : op[1];
    if (written === 0) {
        // Anything, or, for `<*` and `>*`, nothing at all.
        return kind === '<' || kind === '>' ? [{ op: '<', version: version(0, 0, 0, true) }] : [null];
    }
    switch (kind) {
        case '^': {
            const below = major > 0 || written === 1 ? version(major + 1, 0, 0, true)
                : minor > 0 || written === 2 ? version(0, minor + 1, 0, true)
                    : version(0, 0, patch + 1, true);
            return [{ op: '>=', version: from }, { op: '<', version: below }];
        }
        case '~': {
            const below = written === 1 ? version(major + 1, 0, 0, true) : version(major, minor + 1, 0, true);
            return [{ op: '>=', version: from }, { op: '<', version: below }];
        }
        case undefined:
        case '=':
            return written === 3 ? [{ op: '=', version: from }] : [{ op: '>=', version: from }, { op: '<', version: past(read, true) }];
        case '>':
            return [written === 3 ? { op: '>', version: from } : { op: '>=', version: past(read, false) }];
        case '>=':
            return [{ op: '>=', version: from }];
        case '<':
            return [{ op: '<', version: written === 3 ? from : version(major, minor, patch, true) }];
        case '<=':
            return [written === 3 ? { op: '<=', version: from } : { op: '<', version: past(read, true) }];
        default:
            return null;
    }
};

const passes = (running: TVersion, test: TComparator): boolean => {
    if (test === null) return true;
    const order = compare(running, test.version);
    switch (test.op) {
        case '<': return order < 0;
        case '<=': return order <= 0;
        case '>': return order > 0;
        case '>=': return order >= 0;
        case '=': return order === 0;
    }
};

/**
 * The tests of one alternative of a range: its words, or `a - b` from one version to another.
 */
const readAlternative = (alternative: string): TComparator[] | null => {
    // `>= 0.7.0` is `>=0.7.0`.
    const text = alternative.trim().replace(/(<=|>=|<|>|=|\^|~>?)\s+/g, '$1');
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text);
    if (hyphen) {
        const low = readPartial(hyphen[1]);
        const high = readPartial(hyphen[2]);
        if (!low || !high) return null;
        const to: TComparator = high.parts.length === 0 ? null
            : high.parts.length === 3 ? { op: '<=', version: filled(high) } : { op: '<', version: past(high, true) };
        return [{ op: '>=', version: filled(low) }, to];
    }
    // Nothing, as npm reads it, is any version.
    if (text === '') return [null];
    const tests: TComparator[] = [];
    for (const word of text.split(/\s+/)) {
        const read = readWord(word);
        if (!read) return null;
        tests.push(...read);
    }
    return tests;
};

/**
 * Whether `running` passes all of `tests`. A preview (`0.7.0-beta.1`) passes only where one of them
 * names a preview of the same three numbers, as npm has it: `>=0.6.0` does not take the betas of
 * 0.7.0, which may break what 0.6 did, and `>=0.7.0-beta.1` does.
 */
const passesAll = (running: TVersion, tests: readonly TComparator[]): boolean => {
    if (!tests.every((test) => passes(running, test))) return false;
    if (running.pre.length === 0) return true;
    return tests.some((test) => test !== null && test.version.pre.length > 0
        && test.version.parts[0] === running.parts[0] && test.version.parts[1] === running.parts[1] && test.version.parts[2] === running.parts[2]);
};

/**
 * Whether `running` is in `range`: alternatives split by `||`, any of which it passes. `null` when
 * one cannot be read, so whoever asked can say which.
 */
const inRange = (running: TVersion, range: string): boolean | null => {
    let any = false;
    for (const alternative of range.split('||')) {
        const tests = readAlternative(alternative);
        if (!tests) return null;
        if (passesAll(running, tests)) any = true;
    }
    return any;
};

/**
 * Whether the version written as `version` is in `range`, `null` when either cannot be read. For the
 * tests, which cannot change the version that is running.
 */
export const versionInRange = (version: string, range: string): boolean | null => {
    const read = readVersion(version);
    return read ? inRange(read, range) : null;
};

/**
 * Whether the engine running this game is one a plugin was made for, and when it is not, saying so
 * once, in the plugin's name, with both versions.
 *
 * A plugin names the engines it takes in its `package.json` (`peerDependencies`), and npm checks
 * that when it installs. A plugin copied into a project by hand, or opened in the editor, has no one
 * to check it: this is that check, said the same way by every plugin. It does not stop anything.
 * The plugin decides what to do with `false`: carry on and hope, or leave its work undone. Asking
 * again costs nothing and says nothing more.
 *
 * The range is written as npm writes it, and read by npm's rules: `>=0.7.0 <1`, `^0.7.0`,
 * `~0.7.2`, `0.7`, `0.7.x`, `0.6 - 0.8`, alternatives with `||`. A preview of the engine
 * (`0.7.0-beta.1`) is only in a range that names a preview of the same version. A plugin built
 * from the plugin template passes its own `peerDependencies` range, so npm, when it installs, and
 * this, when the game runs, never say different things.
 *
 * @example
 * ```ts
 * import { requireEngine } from 'nacatamalon/extend';
 *
 * export const useWobble = (amount = 2) => {
 *     if (!requireEngine('nacatamalon-wobble', '>=0.7.0 <1')) return;
 *     // ...
 * };
 * ```
 *
 * @param plugin The plugin's name, as its `package.json` says it: it is who speaks in the message.
 * @param range The engine versions it was made for.
 * @returns `true` when the running engine is in the range.
 * @throws When the range cannot be read: that is the plugin's mistake, not the game's.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const requireEngine = (plugin: string, range: string): boolean => {
    const running = readVersion(VERSION);
    const fits = running ? inRange(running, range) : true;
    if (fits === null) {
        throw new Error(`[NacatamalOn] ${plugin}: requireEngine cannot read the range '${range}'. Write it as npm does, such as '>=0.7.0 <1' or '^0.7.0'.`);
    }
    if (!fits && firstTimeIn(getActiveGame(), `requireEngine: ${plugin} ${range}`)) {
        console.warn(`[NacatamalOn] ${plugin}: it was made for nacatamalon ${range}, and this game runs ${VERSION}. Use a version of ${plugin} made for ${VERSION}, or move the game to an engine it takes.`);
    }
    return fits;
};

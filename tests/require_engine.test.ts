import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { requireEngine, versionInRange } from '../src/extend/require_engine';
import { VERSION } from '../src/version';

/**
 * A plugin asking whether the engine running the game is one it was made for: the ranges as npm
 * writes them, and the message, said once in the plugin's name.
 */

describe('a range as npm writes it', () => {
    const cases: [string, string, boolean][] = [
        ['0.7.0', '>=0.7.0', true],
        ['0.6.9', '>=0.7.0', false],
        ['0.7.3', '>=0.7.0 <1', true],
        ['1.0.0', '>=0.7.0 <1', false],
        ['0.7.5', '^0.7.0', true],
        ['0.8.0', '^0.7.0', false],
        ['1.9.0', '^1.2.0', true],
        ['2.0.0', '^1.2.0', false],
        ['0.0.3', '^0.0.3', true],
        ['0.0.4', '^0.0.3', false],
        ['0.7.9', '~0.7.2', true],
        ['0.8.0', '~0.7.2', false],
        ['0.7.4', '0.7', true],
        ['0.8.0', '0.7', false],
        ['0.7.0', '0.7.0', true],
        ['0.7.1', '=0.7.0', false],
        ['0.5.0', '^0.5.0 || ^0.7.0', true],
        ['0.6.0', '^0.5.0 || ^0.7.0', false],
        ['0.7.0-beta.1', '>=0.7.0', false],
        ['0.7.0', '>0.7.0-beta.1', true],
        // A partial version after a comparison, read as npm reads it.
        ['1.0.1', '>1', false],
        ['2.0.0', '>1', true],
        ['1.3.0', '>1.2', true],
        ['1.2.9', '>1.2', false],
        ['1.2.9', '<=1.2', true],
        ['1.3.0', '<=1.2', false],
        ['0.9.9', '<1', true],
        ['1.0.0', '>=1', true],
        // Previews: their parts compared one by one, numbers as numbers, and only in a range that
        // names a preview of the same version.
        ['0.7.0-beta.10', '>0.7.0-beta.2', true],
        ['0.7.0-beta.2', '>0.7.0-beta.10', false],
        ['0.7.0-beta', '<0.7.0-beta.1', true],
        ['0.7.0-1', '<0.7.0-alpha', true],
        ['0.7.0-beta.1', '>=0.6.0', false],
        ['0.7.0-beta.1', '>=0.7.0-beta.0 <1', true],
        ['0.8.0-beta.1', '>=0.7.0-beta.0 <1', false],
        ['1.0.0-rc.1', '>=0.7.0 <1', false],
        ['0.7.2-rc.1', '~0.7.2-beta.3', true],
        // Wildcards, spaces after a comparison, and a span from one version to another.
        ['0.7.4', '0.7.x', true],
        ['0.8.0', '0.7.x', false],
        ['3.1.4', '*', true],
        ['3.1.4', '', true],
        ['0.7.4', '>=0.7.x', true],
        ['0.7.3', '>= 0.7.0 < 1', true],
        ['0.7.3', '0.6 - 0.7', true],
        ['0.8.0', '0.6 - 0.7', false],
        ['0.7.0', '0.6.0 - 0.7.0', true],
        ['0.7.1', '0.6.0 - 0.7.0', false],
        ['0.7.5', '~>0.7.2', true],
        ['0.0.9', '^0.0', true],
        ['0.1.0', '^0.0', false],
        ['0.7.0+build.5', '0.7.0', true],
        // A partial bound from (`>1` is `>=2.0.0`) names no preview, so lets none in.
        ['2.0.0-beta.1', '>1', false],
        ['1.3.0-beta.1', '>1.2', false],
        ['2.0.0-beta.1', '<=1', false],
        ['2.0.0-beta.1', '1', false],
    ];
    for (const [version, range, fits] of cases) {
        it(`${version} ${fits ? 'is' : 'is not'} in ${range}`, () => {
            expect(versionInRange(version, range)).toBe(fits);
        });
    }

    it('cannot read what is not a range', () => {
        expect(versionInRange('0.7.0', 'latest')).toBeNull();
        expect(versionInRange('0.7.0', '>=0.7.0 ||| <1')).toBeNull();
        expect(versionInRange('0.7.0', '>=0.7-beta')).toBeNull();
        expect(versionInRange('0.7.0', '=>0.7.0')).toBeNull();
        // No number starts with a 0 unless it is 0, as npm has it.
        expect(versionInRange('0.7.0', '>=0.07.0')).toBeNull();
        expect(versionInRange('0.7.0', '>=0.7.0-01')).toBeNull();
    });
});

describe('requireEngine', () => {
    let warn: ReturnType<typeof spyOn>;
    afterEach(() => warn?.mockRestore());

    it('says nothing when the running engine is in the range', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        expect(requireEngine('a-plugin', `>=${VERSION}`)).toBe(true);
        expect(warn).not.toHaveBeenCalled();
    });

    it('says once, in the plugin\'s name, when it is not', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        expect(requireEngine('nacatamalon-wobble', '>=99.0.0')).toBe(false);
        expect(requireEngine('nacatamalon-wobble', '>=99.0.0')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        const text = String(warn.mock.calls[0][0]);
        expect(text.startsWith('[NacatamalOn] nacatamalon-wobble: ')).toBe(true);
        expect(text).toContain('>=99.0.0');
        expect(text).toContain(VERSION);
    });

    it('throws for a range it cannot read, in the plugin\'s name', () => {
        expect(() => requireEngine('nacatamalon-wobble', 'latest')).toThrow('[NacatamalOn] nacatamalon-wobble: requireEngine cannot read');
    });
});

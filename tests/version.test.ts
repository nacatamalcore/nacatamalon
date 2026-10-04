import { describe, expect, test } from 'bun:test';
import { VERSION } from '../src/version';

/**
 * The banner every game prints announces `VERSION`, which is read from `package.json`. What can
 * still go wrong is the reading: a build that stops handing JSON over would leave the banner
 * saying `vundefined` without anything failing.
 */
describe('version', () => {
    test('the engine announces a version that looks like one', () => {
        expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });
});

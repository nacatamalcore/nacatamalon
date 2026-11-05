import { describe, expect, it } from 'bun:test';
import { GAME, drop, dropAll, dropIdle, heldBy, heldByOthers, hold, holdOnlyWhileDrawn, holdersOf, stopCounting, whenFree } from '../src/loaders/asset_holds';

type TFakeHolder = { status: string; bound: unknown[] };

const holder = (): TFakeHolder => ({ status: 'ready', bound: [] });

describe('asset holds', () => {
    it('notes who holds a thing, once however many times it is taken', () => {
        const sheet = {};
        const effect = holder();
        hold(sheet, effect);
        hold(sheet, effect);
        expect(holdersOf(sheet)).toEqual([effect]);
        expect(heldBy(effect)).toEqual([sheet]);
        expect(heldByOthers(sheet)).toBe(true);
        expect(heldByOthers(sheet, effect)).toBe(false);
    });

    it('takes nothing for a holder already let go of', () => {
        const sheet = {};
        const gone = { status: 'released', bound: [] };
        hold(sheet, gone);
        expect(holdersOf(sheet)).toEqual([]);
    });

    it('stops counting a holder once it is let go of', () => {
        const picture = {};
        const atlas = holder();
        hold(picture, atlas);
        atlas.status = 'released';
        expect(heldByOthers(picture)).toBe(false);
        // Taken off on the way.
        expect(holdersOf(picture)).toEqual([]);
    });

    it('counts one held only while drawn while it has an emitter', () => {
        const picture = {};
        const inCode = holder();
        hold(picture, inCode, { whileDrawn: true });
        expect(heldByOthers(picture)).toBe(false);
        inCode.bound.push({});
        hold(picture, inCode);
        expect(heldByOthers(picture)).toBe(true);
    });

    it('lets an idle holder go of everything at once, and only an idle one', () => {
        const picture = {};
        const sheet = {};
        const inCode = holder();
        inCode.bound.push({});
        hold(picture, inCode, { whileDrawn: true });
        hold(sheet, inCode);
        dropIdle(inCode);
        expect(heldBy(inCode)).toHaveLength(2);
        inCode.bound.length = 0;
        dropIdle(inCode);
        expect(heldBy(inCode)).toEqual([]);
        expect(holdersOf(picture)).toEqual([]);
        expect(holdersOf(sheet)).toEqual([]);
    });

    it('makes a holder count only while drawn from then on', () => {
        const child = {};
        const parent = holder();
        hold(child, parent);
        holdOnlyWhileDrawn(parent);
        expect(heldByOthers(child)).toBe(false);
    });

    it('runs a wait at once on a thing nobody holds', () => {
        let ran = 0;
        whenFree({}, 'release', () => { ran++; });
        expect(ran).toBe(1);
    });

    it('runs a wait when the last holder lets go, not before', () => {
        const picture = {};
        const one = holder();
        const two = holder();
        hold(picture, one);
        hold(picture, two);
        let ran = 0;
        whenFree(picture, 'release', () => { ran++; });
        drop(picture, one);
        expect(ran).toBe(0);
        drop(picture, two);
        expect(ran).toBe(1);
        // Gone once run.
        hold(picture, one);
        drop(picture, one);
        expect(ran).toBe(1);
    });

    it('runs waits when the last holder leaves the game', () => {
        const picture = {};
        const model = holder();
        hold(picture, model);
        let ran = 0;
        whenFree(picture, 'release', () => { ran++; });
        dropAll(model);
        expect(ran).toBe(1);
    });

    it('keeps one wait of each kind on a thing, the last asked', () => {
        const child = {};
        const parent = holder();
        hold(child, parent);
        const ran: string[] = [];
        whenFree(child, 'release', () => { ran.push('first'); });
        whenFree(child, 'release', () => { ran.push('again'); });
        whenFree(child, 'forget', () => { ran.push('forget'); });
        drop(child, parent);
        expect(ran).toEqual(['again', 'forget']);
    });

    it('keeps a wait that finds the thing held again and waits once more', () => {
        const sheet = {};
        const one = holder();
        const two = holder();
        hold(sheet, one);
        let ran = 0;
        const tryRelease = (): void => {
            ran++;
            if (ran === 1) {
                hold(sheet, two);
                whenFree(sheet, 'release', tryRelease);
            }
        };
        whenFree(sheet, 'release', tryRelease);
        drop(sheet, one);
        expect(ran).toBe(1);
        drop(sheet, two);
        expect(ran).toBe(2);
    });

    it('holds for the game until the game lets go', () => {
        const texture = {};
        const file = holder();
        hold(texture, GAME);
        hold(texture, file);
        expect(heldByOthers(texture, file)).toBe(true);
        let ran = 0;
        drop(texture, file);
        whenFree(texture, 'release', () => { ran++; });
        expect(ran).toBe(0);
        drop(texture, GAME);
        expect(ran).toBe(1);
    });

    it('keeps no list of what the game holds, so the game keeps nothing alive', () => {
        const texture = {};
        hold(texture, GAME);
        expect(holdersOf(texture)).toEqual([GAME]);
        expect(heldBy(GAME)).toEqual([]);
    });

    it('takes a holder that stops counting off what it holds at once, and still knows what it took', () => {
        const picture = {};
        const model = holder();
        hold(picture, model);
        let ran = 0;
        hold(picture, GAME);
        drop(picture, GAME);
        whenFree(picture, 'release', () => { ran++; }, undefined);
        expect(ran).toBe(0);
        stopCounting(model);
        expect(ran).toBe(1);
        expect(holdersOf(picture)).toEqual([]);
        expect(heldBy(model)).toEqual([picture]);
    });

    it('does not leave an older wait behind when one of the same kind finishes at once', () => {
        const sheet = {};
        const map = holder();
        hold(sheet, map);
        const ran: string[] = [];
        whenFree(sheet, 'release', () => { ran.push('old'); });
        map.status = 'released';
        whenFree(sheet, 'release', () => { ran.push('new'); });
        hold(sheet, holder());
        drop(sheet, map);
        expect(ran).toEqual(['new']);
    });
});

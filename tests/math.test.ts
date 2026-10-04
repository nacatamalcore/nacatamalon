import { describe, expect, it } from 'bun:test';
import {
    TAU, clamp, degToRad, lerp, lerpAngle, radToDeg, wrapAngle,
    vec2Add, vec2Angle, vec2Distance, vec2Dot, vec2Equals, vec2Length, vec2Lerp, vec2Negate, vec2Normalize, vec2Scale, vec2Sub,
    vec3Cross, vec3Distance, vec3Length, vec3Normalize,
} from '../src';

/**
 * The arithmetic a game reaches for, through the front door and under the names a game uses.
 *
 * Imported from `../src` on purpose: what is tested is the public name, so an export that points
 * at the wrong function (`vec2Length` at `lenSq`) fails here and not in somebody's game.
 */

describe('numbers', () => {
    it('clamps from both sides and leaves the middle alone', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
        expect(clamp(4, 0, 10)).toBe(4);
    });

    it('lerps without clamping', () => {
        expect(lerp(10, 20, 0.25)).toBe(12.5);
        expect(lerp(10, 20, 2)).toBe(30);
    });
});

describe('angles', () => {
    it('converts both ways', () => {
        expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
        expect(radToDeg(TAU)).toBeCloseTo(360, 10);
    });

    it('wraps any number of turns back into one', () => {
        expect(wrapAngle(TAU * 3 + 0.5)).toBeCloseTo(0.5, 10);
        expect(wrapAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 10);
    });

    it('turns the short way round', () => {
        // From 350 degrees to 10 is twenty degrees forward, not three hundred and forty back.
        expect(radToDeg(lerpAngle(degToRad(350), degToRad(10), 0.5))).toBeCloseTo(360, 6);
    });
});

describe('vectors', () => {
    it('take a transform as it is, extra fields and all', () => {
        const player = { x: 0, y: 0, rotation: 1, scaleX: 2, scaleY: 2 };
        const coin = { x: 3, y: 4, rotation: 0, scaleX: 1, scaleY: 1 };
        expect(vec2Distance(player, coin)).toBe(5);
    });

    it('never change what they are given', () => {
        const a = { x: 1, y: 2 };
        vec2Add(a, { x: 5, y: 5 });
        vec2Scale(a, 3);
        vec2Normalize(a);
        expect(a).toEqual({ x: 1, y: 2 });
    });

    it('do the arithmetic', () => {
        expect(vec2Add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
        expect(vec2Sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
        expect(vec2Negate({ x: 1, y: -2 })).toEqual({ x: -1, y: 2 });
        expect(vec2Lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
        expect(vec2Dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
        expect(vec2Length({ x: 3, y: 4 })).toBe(5);
        expect(vec2Equals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    });

    it('normalize a zero vector to zero rather than to NaN', () => {
        expect(vec2Normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(vec3Normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('give the angle a sprite turns to, with +y down', () => {
        expect(vec2Angle({ x: 1, y: 0 })).toBe(0);
        expect(vec2Angle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10);
    });

    it('in 3D too', () => {
        expect(vec3Cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
        expect(vec3Length({ x: 2, y: 3, z: 6 })).toBe(7);
        expect(vec3Distance({ x: 1, y: 1, z: 1 }, { x: 3, y: 4, z: 7 })).toBe(7);
    });
});

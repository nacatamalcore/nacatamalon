import { describe, expect, it } from 'bun:test';
import { areaOf, checkOutline, insideRing, triangulateWithHoles } from '../src/geometry/build/outline';

/**
 * An outline with holes cut into triangles: every point of the solid in exactly one, every point
 * of a hole or outside in none, and every triangle counter-clockwise.
 */

type P = { x: number; y: number };

const circle = (cx: number, cy: number, r: number, n: number, clockwise = false): P[] =>
    Array.from({ length: n }, (_, i) => {
        const a = ((clockwise ? -1 : 1) * i * Math.PI * 2) / n;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });

const square = (cx: number, cy: number, half: number): P[] => [
    { x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half },
];

/** Cuts and checks it against the solid, at a grid of points over its box. */
const covers = (outline: P[], holes: P[][] = []) => {
    const checked = checkOutline('test', outline, holes);
    const points = [...checked.outline, ...checked.holes.flat()];
    const triangles = triangulateWithHoles(checked.outline, checked.holes);
    const tri = (t: number) => [points[triangles[t]]!, points[triangles[t + 1]]!, points[triangles[t + 2]]!];
    let area = 0;
    for (let t = 0; t < triangles.length; t += 3) {
        const [a, b, c] = tri(t);
        const signed = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        // Counter-clockwise, or with no inside: a point on a straight side is kept in one of those.
        expect(signed).toBeGreaterThanOrEqual(0);
        area += signed;
    }
    const solid = Math.abs(areaOf(outline)) - holes.reduce((sum, hole) => sum + Math.abs(areaOf(hole)), 0);
    expect(area).toBeCloseTo(solid, 6);

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const inside = (p: P, [a, b, c]: P[]) => {
        const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        const d2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
        const d3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
        return d1 > 0 && d2 > 0 && d3 > 0;
    };
    for (let i = 0; i < 41; i++) {
        for (let j = 0; j < 41; j++) {
            // Off the grid of the corners, so no point lands on a side.
            const p = { x: x0 + ((x1 - x0) * (i + 0.37)) / 41, y: y0 + ((y1 - y0) * (j + 0.61)) / 41 };
            const inSolid = insideRing(p, outline) && !holes.some((hole) => insideRing(p, hole));
            let count = 0;
            for (let t = 0; t < triangles.length; t += 3) {
                if (inside(p, tri(t))) count++;
            }
            expect(count).toBe(inSolid ? 1 : 0);
        }
    }
    return triangles.length / 3;
};

describe('an outline with holes, cut into triangles', () => {
    it('cuts a square with a square hole, given either way round', () => {
        expect(covers(square(0, 0, 2), [square(0, 0, 1)])).toBe(8);
        expect(covers(square(0, 0, 2).reverse(), [square(0, 0, 1).reverse()])).toBe(8);
    });

    it('cuts a ring, a hole off the middle, and several holes side by side and one above another', () => {
        covers(circle(0, 0, 2, 32), [circle(0, 0, 1.2, 24, true)]);
        covers(circle(0, 0, 2, 20), [circle(0.6, 0.3, 0.5, 12)]);
        covers(square(0, 0, 4), [square(-2, 0, 0.8), square(0, 0, 0.8), square(2, 0, 0.8), square(0, 2.5, 0.6), square(0, -2.5, 0.6)]);
        // Holes in a row, with their rightmost corners at the same height as each other's.
        covers(square(0, 0, 5), [square(-3, 0, 1), square(0, 0, 1), square(3, 0, 1)]);
        // Two holes joined to the same corner, the only one to their right: the second is joined to
        // whichever of its two places in the ring opens towards it.
        covers([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 10 }], [square(5, 4.5, 0.3), square(5, 6, 0.3)]);
        covers([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 10 }], [square(5, 6, 0.3), square(5, 4.5, 0.3)]);
    });

    it('cuts a hollowed outline with holes in its arms, and a letter', () => {
        const ell: P[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 6 }, { x: 0, y: 6 }];
        covers(ell, [square(4, 1, 0.5), square(1, 4, 0.5), square(1, 1, 0.5)]);
        // A hole whose look to the right meets a hollow of the outline.
        const comb: P[] = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 1.5 }, { x: 5, y: 1.5 }, { x: 5, y: 4 }, { x: 0, y: 4 }];
        covers(comb, [square(2.5, 2, 0.6)]);
        // An "A": its triangle hole above the bar.
        const a: P[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1.5, y: 1.2 }, { x: 2.5, y: 1.2 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 2.4, y: 5 }, { x: 1.6, y: 5 }];
        covers(a, [[{ x: 1.8, y: 2 }, { x: 2.2, y: 2 }, { x: 2, y: 3.2 }]]);
    });

    it('cuts what it always did without holes', () => {
        covers([{ x: 0, y: 0.3 }, { x: 0.15, y: 0 }, { x: 0, y: -0.3 }, { x: -0.15, y: 0 }]);
        covers(circle(0, 0, 1, 64));
        const star = Array.from({ length: 10 }, (_, i) => {
            const r = i % 2 === 0 ? 1 : 0.4;
            const a = (i * Math.PI) / 5;
            return { x: Math.cos(a) * r, y: Math.sin(a) * r };
        });
        covers(star, [circle(0, 0, 0.2, 8)]);
    });

    it('cuts holes whose joins run along a line with other corners on it', () => {
        // The triangle's rightmost corner is level with the square's lowest: its join runs flat,
        // along the square's side.
        const box: P[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
        covers(box, [[{ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 2 }], [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }]]);

        // A join along a slanted side that ends level with the hole: met at its end exactly, not a
        // hair short of it, so the join does not go through the other hole.
        covers([{ x: -4, y: -4 }, { x: 2, y: -4 }, { x: 3, y: -1.7 }, { x: 2, y: 6 }, { x: -4, y: 6 }], [
            [{ x: -1, y: 1 }, { x: -0.2, y: 1 }, { x: 0, y: 2 }],
            [{ x: -1, y: 2 }, { x: -0.5, y: 2 }, { x: -1, y: 2.5 }],
        ]);

        // Corners on one line as written, a hair off it in decimals.
        covers([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 2, y: 4 }, { x: 1.5, y: 4 }], [
            [{ x: 0.7, y: 0.8 }, { x: 0.6, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.4, y: 0.9 }, { x: 0.3, y: 0.7 }, { x: 0.4, y: 0.7 }, { x: 0.5, y: 0.6 }, { x: 0.6, y: 0.6 }],
            [{ x: 1.5, y: 3.3 }, { x: 1.8, y: 3.3 }, { x: 1.5, y: 3.5 }],
        ]);
        const tenths = (v: number) => Math.round(v / 0.1) * 0.1;
        covers([[3.9, -0.1], [-0.4, 5], [-3.6, -0.5], [-3.1, -2.9]].map(([x, y]) => ({ x: tenths(x!), y: tenths(y!) })), [
            [[-1.4, 1.7], [-1.2, 1.7], [-1.2, 1.9]].map(([x, y]) => ({ x: tenths(x!), y: tenths(y!) })),
        ]);

        // Many more like it: holes in a grid of cells, each a square, a half of one or a diamond,
        // so their corners and joins line up with each other's.
        let seed = 7;
        const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        const shapes = (x: number, y: number): P[][] => [
            [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }],
            [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }],
            [{ x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }],
            [{ x, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }],
            [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }],
            [{ x: x + 0.5, y }, { x: x + 1, y: y + 0.5 }, { x: x + 0.5, y: y + 1 }, { x, y: y + 0.5 }],
        ];
        for (let run = 0; run < 150; run++) {
            const across = 2 + Math.floor(random() * 4);
            const up = 1 + Math.floor(random() * 3);
            const holes: P[][] = [];
            for (let i = 0; i < across; i++) {
                for (let j = 0; j < up; j++) {
                    if (random() < 0.6) {
                        const all = shapes(2 * i + 1, 2 * j + 1);
                        holes.push(all[Math.floor(random() * all.length)]!);
                    }
                }
            }
            covers([{ x: 0, y: 0 }, { x: 2 * across + 1, y: 0 }, { x: 2 * across + 1, y: 2 * up + 1 }, { x: 0, y: 2 * up + 1 }], holes);
        }
    });

    it('cuts a small outline far from the middle as it does one at it', () => {
        expect(covers(square(1e8, 1e8, 0.5))).toBe(2);
        expect(covers(square(1000, 1000, 5e-7))).toBe(2);
        covers(square(1e5, 1e5, 2), [square(1e5, 1e5, 1)]);
    });

    it('says what is wrong with an outline or a hole', () => {
        expect(() => checkOutline('t', [{ x: 0, y: 0 }, { x: 1, y: 1 }], [])).toThrow('the outline has no inside');
        expect(() => checkOutline('t', [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [])).toThrow('the outline has no inside');
        expect(() => checkOutline('t', [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }], [])).toThrow('crosses or touches itself');
        // Flat as near as a turn can tell, crossing itself on the way: no inside, as a hole too.
        const flat = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1001, y: 5e-10 }, { x: 1001, y: 0 }, { x: 1000, y: 5e-10 }];
        expect(() => checkOutline('t', flat, [])).toThrow('the outline has no inside');
        expect(() => checkOutline('t', square(500, 0, 2000), [flat])).toThrow('hole 0 has no inside');
        expect(() => checkOutline('t', [{ x: 0, y: Number.NaN }, { x: 1, y: 1 }, { x: 1, y: 0 }], [])).toThrow('with numbers');
        expect(() => checkOutline('t', square(0, 0, 1), [square(3, 0, 0.5)])).toThrow('hole 0 is not inside the outline');
        expect(() => checkOutline('t', square(0, 0, 1), [square(0.8, 0, 0.5)])).toThrow('hole 0 is not inside the outline');
        expect(() => checkOutline('t', square(0, 0, 3), [square(0, 0, 1), square(0.5, 0, 1)])).toThrow('holes 0 and 1 meet');
        expect(() => checkOutline('t', square(0, 0, 3), [square(0, 0, 2), square(0, 0, 0.5)])).toThrow('holes 0 and 1 meet or one is inside the other');
    });
});

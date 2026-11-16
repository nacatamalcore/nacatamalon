import { createGeometryBuilder } from '../build/geometry_builder';
import { areaOf, crossesItself, insideRing, ringsTouch, triangulateWithHoles } from '../build/outline';

type TPoint = { readonly x: number; readonly y: number };

/**
 * How an extruded shape's edges are rounded off: how far in from the outline and from each face, and
 * in how many steps. `1` is a straight cut at 45°, more a rounder one.
 *
 * @internal
 */
export type TExtrudeBevel = { size: number; segments: number };

/**
 * One ring of the outline on the way from the front face round to the back one: how far in from
 * the outline, at what depth, and how its facing leans, `out` across and `z` forward.
 */
type TRing = { inset: number; z: number; out: number; facing: number };

/** The ways from the front face round the edge to the back, outline included. */
const ringsOf = (depth: number, bevel: TExtrudeBevel | null): TRing[] => {
    const half = depth / 2;
    if (bevel === null) {
        return [{ inset: 0, z: half, out: 1, facing: 0 }, { inset: 0, z: -half, out: 1, facing: 0 }];
    }
    const { size, segments } = bevel;
    const front: TRing[] = [];
    for (let k = 0; k <= segments; k++) {
        // A quarter of a circle of radius `size`, from the face (no lean out) to the side (all out).
        const t = (k / segments) * (Math.PI / 2);
        // Its two ends exactly on the face and on the side, so they meet them with no seam.
        const inset = k === 0 ? size : k === segments ? 0 : size * (1 - Math.sin(t));
        const z = k === 0 ? half : k === segments ? half - size : half - size + size * Math.cos(t);
        front.push({ inset, z, out: k === segments ? 1 : Math.sin(t), facing: k === segments ? 0 : Math.cos(t) });
    }
    const back = front.map((ring) => ({ ...ring, z: -ring.z, facing: -ring.facing })).reverse();
    return [...front, ...back];
};

/**
 * For each corner, the way its point moves in to stay `1` from both its sides: the sides' inward
 * facings averaged and lengthened by how sharp the corner is.
 */
const mitersOf = (ring: ReadonlyArray<TPoint>, inward: ReadonlyArray<TPoint>): TPoint[] =>
    ring.map((_, i) => {
        const a = inward[(i - 1 + ring.length) % ring.length]!;
        const b = inward[i]!;
        // Kept finite at a corner so sharp it turns all the way back, where the two facings cancel:
        // the point would go off for ever, and a bevel that moves it is refused for folding.
        const k = Math.max(1 + a.x * b.x + a.y * b.y, 1e-9);
        return { x: (a.x + b.x) / k, y: (a.y + b.y) / k };
    });

/** Each side's facing into the solid, which is on its left. */
const inwardOf = (ring: ReadonlyArray<TPoint>): TPoint[] =>
    ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    });

const inset = (ring: ReadonlyArray<TPoint>, miters: ReadonlyArray<TPoint>, by: number): TPoint[] =>
    ring.map((p, i) => ({ x: p.x + miters[i]!.x * by, y: p.y + miters[i]!.y * by }));

/**
 * A flat outline pushed out into a solid `depth` deep, centred on its middle: its front face at
 * `z = depth / 2`, facing the viewer, its back at `-depth / 2`, and a side round every edge of it and
 * of each hole. The outline counter-clockwise and its holes clockwise, as `checkOutline` hands them.
 *
 * A bevel cuts into the edges between the faces and the sides, so the solid still fills the outline
 * by `depth` and its faces are smaller by the bevel. A side turns hard where the outline turns more
 * than `creaseAngle`, and smoothly where it turns less, as round a circle given in points.
 *
 * Its picture: once over each face, the box round the outline (`0, 0` its top left as the face is
 * seen, so the back reads it the right way round from behind), and once round each outline along
 * the sides (`u` growing to the right as each is seen from outside the solid, `v` from the front
 * face to the back).
 *
 * @internal
 */
export const buildExtrude = (
    hook: string,
    outline: ReadonlyArray<TPoint>,
    holes: ReadonlyArray<ReadonlyArray<TPoint>>,
    depth: number,
    bevel: TExtrudeBevel | null,
    creaseAngle: number,
) => {
    const b = createGeometryBuilder();
    const contours = [outline, ...holes];
    const inwards = contours.map(inwardOf);
    const miters = contours.map((ring, c) => mitersOf(ring, inwards[c]!));

    // The faces, inset by the bevel: checked, since a bevel wider than a narrow part of the outline
    // would fold its faces over themselves.
    const faceInset = bevel === null ? 0 : bevel.size;
    const faces = contours.map((ring, c) => inset(ring, miters[c]!, faceInset));
    if (bevel !== null) {
        // Each still going round as it did, every side still running the way it ran on the outline
        // (a square cut past its middle comes out turned half round, the same way round but every
        // side backwards), none crossing itself or another, and every hole still inside the outline
        // and outside the others: one grown past the outline meets nothing.
        const backwards = (ring: ReadonlyArray<TPoint>, c: number) => ring.some((p, i) => {
            const q = ring[(i + 1) % ring.length]!;
            const a = contours[c]![i]!;
            const b = contours[c]![(i + 1) % ring.length]!;
            return (q.x - p.x) * (b.x - a.x) + (q.y - p.y) * (b.y - a.y) <= 0;
        });
        const folded = faces.some((ring, c) => Math.sign(areaOf(ring)) !== Math.sign(areaOf(contours[c]!)) || backwards(ring, c) || crossesItself(ring))
            || faces.some((ring, c) => faces.some((other, d) => d > c && ringsTouch(ring, other)))
            || faces.some((ring, c) => c > 0 && (!insideRing(ring[0]!, faces[0]!) || faces.some((other, d) => d > 0 && d !== c && insideRing(ring[0]!, other))));
        if (folded) {
            throw new Error(`[NacatamalOn] ${hook}: a bevel of ${bevel.size} reaches past the middle of the outline where it is narrowest, past the rounding of a corner given in points, or past the room a sharp corner pointing into the solid leaves (a notch, the tip of a hole), and its faces would fold over themselves. Make it smaller.`);
        }
    }

    // The faces' picture, by the box round the outline itself, so a bevel does not shrink it.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of outline) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const half = depth / 2;

    const points = faces.flat();
    const triangles = triangulateWithHoles(faces[0]!, faces.slice(1));
    const front = points.map((p) => b.addVertex(p.x, p.y, half, 0, 0, 1, (p.x - minX) / width, (maxY - p.y) / height));
    const back = points.map((p) => b.addVertex(p.x, p.y, -half, 0, 0, -1, (maxX - p.x) / width, (maxY - p.y) / height));
    for (let t = 0; t < triangles.length; t += 3) {
        const [i, j, k] = [triangles[t]!, triangles[t + 1]!, triangles[t + 2]!];
        b.addTriangle(front[i]!, front[j]!, front[k]!);
        b.addTriangle(back[i]!, back[k]!, back[j]!);
    }

    // The sides, a band from each ring to the next, each side of the outline a quad of its own so a
    // hard corner has two facings; a soft one gives both the same.
    const rings = ringsOf(depth, bevel);
    const chamfer = bevel !== null && bevel.segments === 1;
    for (const [c, ring] of contours.entries()) {
        const n = ring.length;
        const outward = inwards[c]!.map((p) => ({ x: -p.x, y: -p.y }));
        // Where each corner is soft, the two sides' facings met halfway.
        const soft = ring.map((_, i) => {
            const before = outward[(i - 1 + n) % n]!;
            const after = outward[i]!;
            // By the angle the outline turns, never more than half a turn: a `creaseAngle` of half a
            // turn or more creases nothing, and a right angle is not more than a right angle.
            if (Math.atan2(Math.abs(before.x * after.y - before.y * after.x), before.x * after.x + before.y * after.y) > creaseAngle) {
                return null;
            }
            const length = Math.hypot(before.x + after.x, before.y + after.y);
            return { x: (before.x + after.x) / length, y: (before.y + after.y) / length };
        });
        const lengths = [0];
        for (let i = 0; i < n; i++) {
            const p = ring[i]!;
            const q = ring[(i + 1) % n]!;
            lengths.push(lengths[i]! + Math.hypot(q.x - p.x, q.y - p.y));
        }
        const around = lengths[n]!;

        for (let r = 0; r + 1 < rings.length; r++) {
            const near = rings[r]!;
            const far = rings[r + 1]!;
            if (near.z - far.z <= 0) {
                continue;
            }
            // A straight cut faces halfway between the face and the side all across; a round one
            // leans from one to the other, ring by ring.
            const cut = chamfer && (near.facing !== 0 || far.facing !== 0);
            const halfway: TRing = { inset: 0, z: 0, out: Math.SQRT1_2, facing: Math.sign(near.facing + far.facing) * Math.SQRT1_2 };
            const a0 = cut ? halfway : near;
            const a1 = cut ? halfway : far;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const corner = (at: number, side: TRing, rim: TRing) => {
                    const p = ring[at]!;
                    const m = miters[c]![at]!;
                    const across = soft[at] ?? outward[i]!;
                    const nx = across.x * side.out;
                    const ny = across.y * side.out;
                    const length = Math.hypot(nx, ny, side.facing);
                    return b.addVertex(
                        p.x + m.x * rim.inset, p.y + m.y * rim.inset, rim.z,
                        nx / length, ny / length, side.facing / length,
                        (at === i ? lengths[i]! : lengths[i + 1]!) / around, (half - rim.z) / depth,
                    );
                };
                const nearA = corner(i, a0, near);
                const nearB = corner(j, a0, near);
                const farA = corner(i, a1, far);
                const farB = corner(j, a1, far);
                b.addTriangle(farA, farB, nearB);
                b.addTriangle(farA, nearB, nearA);
            }
        }
    }

    return b.build();
};

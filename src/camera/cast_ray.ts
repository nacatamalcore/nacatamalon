import { computeModelMatrix } from '../render/shared/compute_mvp_3d';
import { cullOf } from '../render/shared/cull_of';
import type { TBox } from '../box/types/t_box';
import type { TGameObject } from '../hooks/spawn/use_spawn';
import type { TMesh } from '../gameobjects/mesh/types/t_mesh';
import type { TRay } from './screen_to_ray';

/**
 * What a ray met: which model of which object, where, which way the surface faces there, and how
 * far along the ray.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRayHit = {
    /**
     * The object the model belongs to, the one to move, light up or take away.
     */
    box: TGameObject;
    /**
     * The model that was met.
     */
    mesh: TMesh;
    /**
     * Where, in the world.
     */
    point: { x: number; y: number; z: number };
    /**
     * Which way the triangle met faces, one unit long, on the side the ray came from: what to stand
     * a thing on, or to bounce a ball off.
     */
    normal: { x: number; y: number; z: number };
    /**
     * How far along the ray, in the world's units.
     */
    distance: number;
    /**
     * Which triangle of the shape, from 0, in the order of its corners.
     */
    triangle: number;
    /**
     * Which instance, from 0, for a model made by `createMeshInstances`; `null` for any other.
     */
    instance: number | null;
};

/**
 * How far a ray reaches.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCastRayOptions = {
    /**
     * In the world's units. Left out, as far as there is anything.
     */
    maxDistance?: number;
};

/**
 * A placement as twelve numbers, the three rows of a matrix with the move last in each, kept in
 * full precision: the ray is taken into each model's own space, and back out at what it met.
 */
type TAffine = Float64Array;

const IDENTITY: TAffine = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0);

/** The rows of a placement the renderer would build, from its matrix (columns first). */
const affineOfMatrix = (m: ArrayLike<number>): TAffine =>
    Float64Array.of(m[0]!, m[4]!, m[8]!, m[12]!, m[1]!, m[5]!, m[9]!, m[13]!, m[2]!, m[6]!, m[10]!, m[14]!);

/** `a` then `b`: `b` placed inside `a`. */
const compose = (a: TAffine, b: TAffine): TAffine => {
    const out = new Float64Array(12);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
            out[r * 4 + c] = a[r * 4]! * b[c]! + a[r * 4 + 1]! * b[4 + c]! + a[r * 4 + 2]! * b[8 + c]! + (c === 3 ? a[r * 4 + 3]! : 0);
        }
    }
    return out;
};

const matrixScratch = new Float32Array(16);
const placementOf = (transform: NonNullable<TBox['transform']>): TAffine => affineOfMatrix(computeModelMatrix(transform, matrixScratch));

/**
 * The placement undone, or `null` for one that flattens everything onto a plane or a line (a scale
 * of 0, or so near it, once turned, that what is left is rounding), which cannot be. Its
 * determinant comes with it, whose sign says whether it mirrors.
 */
const inverseOf = (m: TAffine): { inverse: TAffine; det: number } | null => {
    const [a, b, c, tx, d, e, f, ty, g, h, i, tz] = m as unknown as number[];
    const A = e! * i! - f! * h!;
    const B = f! * g! - d! * i!;
    const C = d! * h! - e! * g!;
    const det = a! * A + b! * B + c! * C;
    // Against how big the placement is, so a 0 turned by the boxes above it, which comes out of the
    // turns as a crumb of rounding rather than as 0, still counts as flat.
    const size = Math.hypot(a!, d!, g!) * Math.hypot(b!, e!, h!) * Math.hypot(c!, f!, i!);
    if (!(Math.abs(det) > 1e-9 * size)) {
        return null;
    }
    const inv = new Float64Array(12);
    inv[0] = A / det;
    inv[1] = (c! * h! - b! * i!) / det;
    inv[2] = (b! * f! - c! * e!) / det;
    inv[4] = B / det;
    inv[5] = (a! * i! - c! * g!) / det;
    inv[6] = (c! * d! - a! * f!) / det;
    inv[8] = C / det;
    inv[9] = (b! * g! - a! * h!) / det;
    inv[10] = (a! * e! - b! * d!) / det;
    for (let r = 0; r < 3; r++) {
        inv[r * 4 + 3] = -(inv[r * 4]! * tx! + inv[r * 4 + 1]! * ty! + inv[r * 4 + 2]! * tz!);
    }
    return { inverse: inv, det };
};

/**
 * Whether a ray goes through a box anywhere between its start and `far`.
 */
const throughBox = (
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
    min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }, far: number,
): boolean => {
    let near = 0;
    let out = far;
    for (const [o, d, lo, hi] of [[ox, dx, min.x, max.x], [oy, dy, min.y, max.y], [oz, dz, min.z, max.z]] as const) {
        if (d === 0) {
            if (o < lo || o > hi) return false;
            continue;
        }
        let t0 = (lo - o) / d;
        let t1 = (hi - o) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        if (t0 > near) near = t0;
        if (t1 < out) out = t1;
        if (near > out) return false;
    }
    return true;
};

/**
 * Every triangle of one model a ray meets, as it is drawn: in its own space, with the ray taken
 * there, so a stretched or turned model costs no more than a plain one.
 */
const meetMesh = (
    hits: TRayHit[], ray: TRay, box: TBox, mesh: TMesh, place: TAffine, instance: number | null, far: number,
): void => {
    const geometry = mesh.geometry!;
    const indices = geometry.indices!;
    const { origin: O, direction: D } = ray;
    const undone = inverseOf(place);
    let positions: ArrayLike<number> = geometry.positions!;
    let n: TAffine = IDENTITY;
    let mirrored = false;
    let ox = O.x;
    let oy = O.y;
    let oz = O.z;
    let dx = D.x;
    let dy = D.y;
    let dz = D.z;
    if (undone === null) {
        // Flattened by a scale of 0, and still drawn: a floor squashed flat is the floor. Its
        // corners carried into the world, where the ray is, and met there.
        const local = geometry.positions!;
        const world = new Float64Array(local.length);
        for (let i = 0; i < local.length; i += 3) {
            const [x, y, z] = [local[i]!, local[i + 1]!, local[i + 2]!];
            world[i] = place[0]! * x + place[1]! * y + place[2]! * z + place[3]!;
            world[i + 1] = place[4]! * x + place[5]! * y + place[6]! * z + place[7]!;
            world[i + 2] = place[8]! * x + place[9]! * y + place[10]! * z + place[11]!;
        }
        positions = world;
    } else {
        n = undone.inverse;
        mirrored = undone.det < 0;
        // The ray in the model's own space. Its direction keeps the length the placement gives it,
        // so a distance along it is a distance in the world.
        ox = n[0]! * O.x + n[1]! * O.y + n[2]! * O.z + n[3]!;
        oy = n[4]! * O.x + n[5]! * O.y + n[6]! * O.z + n[7]!;
        oz = n[8]! * O.x + n[9]! * O.y + n[10]! * O.z + n[11]!;
        dx = n[0]! * D.x + n[1]! * D.y + n[2]! * D.z;
        dy = n[4]! * D.x + n[5]! * D.y + n[6]! * D.z;
        dz = n[8]! * D.x + n[9]! * D.y + n[10]! * D.z;
        if (geometry.bounds !== null && !throughBox(ox, oy, oz, dx, dy, dz, geometry.bounds.min, geometry.bounds.max, far)) {
            return;
        }
    }

    // Which side is thrown away, as the renderer reads the material, and turned round when the
    // placement mirrors it: the card keeps the triangles that go round one way on the screen,
    // whatever made them so.
    const cull = cullOf(mesh);
    // Where this model has been met already, and from which side: a ray through an edge two
    // triangles share meets both at one place, and that is one surface met once.
    const met: Array<{ along: number; front: boolean }> = [];

    for (let t = 0; t + 2 < indices.length; t += 3) {
        const i0 = indices[t]! * 3;
        const i1 = indices[t + 1]! * 3;
        const i2 = indices[t + 2]! * 3;
        const ax = positions[i0]!;
        const ay = positions[i0 + 1]!;
        const az = positions[i0 + 2]!;
        const e1x = positions[i1]! - ax;
        const e1y = positions[i1 + 1]! - ay;
        const e1z = positions[i1 + 2]! - az;
        const e2x = positions[i2]! - ax;
        const e2y = positions[i2 + 1]! - ay;
        const e2z = positions[i2 + 2]! - az;
        // The ray against the triangle's plane and its three sides at once.
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const a = e1x * px + e1y * py + e1z * pz;
        if (a === 0) {
            continue;
        }
        // `a` is the triangle's facing against the ray, so its sign is which side the ray meets.
        const front = (a < 0) === mirrored;
        if ((cull === 'back' && !front) || (cull === 'front' && front)) {
            continue;
        }
        const f = 1 / a;
        const sx = ox - ax;
        const sy = oy - ay;
        const sz = oz - az;
        const u = f * (sx * px + sy * py + sz * pz);
        if (u < 0 || u > 1) {
            continue;
        }
        const qx = sy * e1z - sz * e1y;
        const qy = sz * e1x - sx * e1z;
        const qz = sx * e1y - sy * e1x;
        const v = f * (dx * qx + dy * qy + dz * qz);
        if (v < 0 || u + v > 1) {
            continue;
        }
        const along = f * (e2x * qx + e2y * qy + e2z * qz);
        if (along < 0 || along > far) {
            continue;
        }
        if (met.some((seen) => seen.front === front && Math.abs(seen.along - along) <= 1e-9 * Math.max(1, along))) {
            continue;
        }
        met.push({ along, front });
        // The facing taken back to the world, by the placement undone and turned over (what keeps a
        // facing square to its surface under a stretch), and turned towards where the ray came from.
        const lx = e1y * e2z - e1z * e2y;
        const ly = e1z * e2x - e1x * e2z;
        const lz = e1x * e2y - e1y * e2x;
        let nx = n[0]! * lx + n[4]! * ly + n[8]! * lz;
        let ny = n[1]! * lx + n[5]! * ly + n[9]! * lz;
        let nz = n[2]! * lx + n[6]! * ly + n[10]! * lz;
        const length = Math.hypot(nx, ny, nz);
        const toward = nx * D.x + ny * D.y + nz * D.z > 0 ? -1 : 1;
        nx = (nx / length) * toward;
        ny = (ny / length) * toward;
        nz = (nz / length) * toward;
        hits.push({
            box: box as TGameObject,
            mesh,
            point: { x: O.x + D.x * along, y: O.y + D.y * along, z: O.z + D.z * along },
            normal: { x: nx + 0, y: ny + 0, z: nz + 0 },
            distance: along,
            triangle: t / 3,
            instance,
        });
    }
};

/** One model, or each of its instances. */
const meetDrawable = (hits: TRayHit[], ray: TRay, box: TBox, mesh: TMesh, world: TAffine, far: number): void => {
    if (mesh.destroyed || mesh.visible === false || mesh.geometry === null || mesh.geometry.positions === null || mesh.geometry.indices === null) {
        return;
    }
    const place = compose(world, placementOf(mesh.transform));
    const run = mesh.instances ?? null;
    if (run === null) {
        meetMesh(hits, ray, box, mesh, place, null, far);
        return;
    }
    // As many as are drawn: the model's own count, which the run only catches up with when it is
    // next drawn, read the way it will be then.
    const wanted = (mesh as { count?: number }).count;
    const count = Number.isFinite(wanted) ? Math.min(Math.max(Math.floor(wanted!), 0), run.capacity) : 0;
    for (let i = 0; i < count; i++) {
        // Twenty numbers an instance, its placement first, as three rows with the move last.
        meetMesh(hits, ray, box, mesh, compose(place, run.data.subarray(i * 20, i * 20 + 12) as unknown as TAffine), i, far);
    }
};

/**
 * Whether a box is drawn in the world a ray goes through, and where, from its own placement and
 * everything above it: `null` when something above it is hidden, gone, pinned to the screen or the
 * inside of a picture.
 */
const worldAbove = (box: TBox): TAffine | null => {
    const chain: TBox[] = [];
    for (let up = box.parent; up !== null; up = up.parent) {
        chain.push(up);
    }
    let world = IDENTITY;
    for (let k = chain.length - 1; k >= 0; k--) {
        const above = chain[k]!;
        if (above.destroyed || !above.visible || above.screenSpace || (k < chain.length - 1 && above.spriteTexture !== null)) {
            return null;
        }
        if (above.transform !== null) {
            world = compose(world, placementOf(above.transform));
        }
    }
    return world;
};

/** Everything a box holds that a ray could meet, as the frame would draw it. */
const walk = (hits: TRayHit[], ray: TRay, box: TBox, world: TAffine, top: boolean, far: number): void => {
    // What is gone, hidden or pinned to the screen is not in the world a ray goes through, nor what
    // shows another world as a picture: what is in it is not where it is drawn.
    if (box.destroyed || !box.visible || box.screenSpace || (!top && box.spriteTexture !== null)) {
        return;
    }
    const here = box.transform === null ? world : compose(world, placementOf(box.transform));
    for (const drawable of box.drawables) {
        if (drawable.type === 'mesh') {
            meetDrawable(hits, ray, box, drawable, here, far);
        }
    }
    for (const child of box.children) {
        walk(hits, ray, child, here, false, far);
    }
};

/**
 * What a ray meets among the models of a scene, nearest first: what is under the pointer, with no
 * physics. A ray from `screenToRay` and the scene (`sceneOf(self)`) answer "what was clicked"; a ray
 * down from a piece, "what is it standing on".
 *
 * It looks at the models inside `where` (a box, or several), the boxes themselves and everything in
 * them, as they are drawn: what is hidden is not met, nor what is pinned to the screen, nor the side
 * of a triangle its material throws away (`cull`, the back unless it says otherwise), so what is met
 * is what is seen. Each instance of `createMeshInstances` is met where it is, and says which one.
 *
 * Met as its shape is built and placed, which is how most models are drawn. Not so for a model that
 * bends around its bones, met by its corners as its file gives them, before the bones move them;
 * one whose material moves its corners in its shader (a flag, grass in the wind, `vertexSnap`), met
 * where they were; and under a camera that follows a 2D world (`follow2d`), which draws every model
 * stood upright, met by its placement as it is, not as it is drawn. What is inside a picture drawn
 * in the game is not met from the scene: look in the picture's own box for that. A game with physics casts its rays there instead
 * (`usePhysicsWorld3d().raycast`), against its colliders and their layers.
 *
 * Each model is tried against the box it fits in before any of its triangles, so a scene of ordinary
 * size is quick enough to ask every time the pointer moves.
 *
 * @param ray Where it starts and which way it goes: from `screenToRay`, or made by hand.
 * @param where What to look in: the scene, `sceneOf(self)`, or the objects that can be met.
 * @param options How far it reaches.
 * @returns Everything it met, nearest first; empty when it met nothing.
 *
 * @example
 * ```ts
 * declare const Chip: (props: { x: number; y: number; z: number }) => void;
 *
 * const Table = () => {
 *     const camera = useCamera3d({ projection: 'perspective', transform: { y: 4, z: 6, rotationX: -0.6 } });
 *     const game = useGame();
 *     const scene = useSelf();
 *     createMesh({ geometry: useCubeGeometry({ width: 6, height: 0.2, depth: 4 }), tint: '#1d6b3a' });
 *
 *     usePointer().onDown((info) => {
 *         const ray = screenToRay(camera, game.getWidth(), game.getHeight(), info.screenX, info.screenY);
 *         const hit = castRay(ray, scene)[0];
 *         if (hit !== undefined) {
 *             // A chip put down where the table was clicked.
 *             useSpawn(Chip)({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
 *         }
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const castRay = (ray: TRay, where: TBox | ReadonlyArray<TBox>, options: TCastRayOptions = {}): TRayHit[] => {
    const { origin, direction } = ray ?? ({} as TRay);
    const finite = (p: { x: number; y: number; z: number } | undefined) => p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    if (!finite(origin) || !finite(direction)) {
        throw new Error('[NacatamalOn] castRay: the ray takes an origin and a direction, each three numbers, as screenToRay gives them.');
    }
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) {
        throw new Error('[NacatamalOn] castRay: the ray\'s direction is (0, 0, 0), and it takes which way it goes.');
    }
    const far = options.maxDistance ?? Infinity;
    if (!(far > 0)) {
        throw new Error(`[NacatamalOn] castRay: maxDistance is ${String(options.maxDistance)}, and it takes how far the ray reaches, above 0.`);
    }
    // One unit long, so a distance along it is a distance in the world.
    const unit: TRay = { origin, direction: { x: direction.x / length, y: direction.y / length, z: direction.z / length } };

    const hits: TRayHit[] = [];
    const given = Array.isArray(where) ? where : [where as TBox];
    // Each looked in once: one given twice, or inside another that is given, is in it already. Not
    // when a picture lies between them: the other's walk does not go into a picture's world.
    const all = new Set(given);
    const seen = new Set<TBox>();
    const tops = given.filter((top) => {
        if (seen.has(top)) return false;
        seen.add(top);
        let reached = top.spriteTexture === null;
        for (let up = top.parent; up !== null && reached; up = up.parent) {
            if (all.has(up)) return false;
            reached = up.spriteTexture === null;
        }
        return true;
    });
    for (const top of tops) {
        // A picture's world is drawn from the picture's own box, with nothing above it.
        const world = top.spriteTexture !== null ? IDENTITY : worldAbove(top);
        if (world !== null) {
            walk(hits, unit, top, world, true, far);
        }
    }
    // Stable, so two hits at one distance keep the order they were met in.
    return hits.sort((a, b) => a.distance - b.distance);
};

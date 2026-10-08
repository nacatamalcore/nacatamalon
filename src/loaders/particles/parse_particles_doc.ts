import { asBoolean, asNumber } from '../../utils';
import { getColor } from '../../color';
import { PARTICLES_FORMAT } from './types/t_particles_doc';
import type { TColor } from '../../color';
import type {
    TChildEmitter, TEmissionDoc, TEmitShape2d, TEmitShape3d, TParticleBlend, TParticleColorStop, TParticleRange,
    TParticleCollision, TParticleScaleStop, TParticlesBounds, TParticlesDoc, TParticlesDoc2d, TParticlesDoc3d,
    TParticleTrail,
} from './types/t_particles_doc';

/**
 * Fields this version reads. Anything else the file declared is kept aside, not thrown away.
 */
const KNOWN = new Set([
    'format', 'kind', 'texture', 'max', 'blend', 'worldSpace', 'emission', 'shape', 'direction',
    'spread', 'life', 'speed', 'size', 'spin', 'gravity', 'damping', 'colorOverLife', 'sizeOverLife',
    'collision', 'atlas', 'frame', 'anim', 'trail', 'bounds', 'children',
]);

/**
 * The shapes each dimension has, so one from the other gets its own answer rather than "unknown".
 */
const SHAPES_3D = new Set(['sphere', 'box', 'cone']);
const SHAPES_2D = new Set(['circle', 'rect', 'line']);

/**
 * Every refusal goes through here, so the file always names itself.
 *
 * A game loads a dozen effects and they all fail the same way; a message that does not say which
 * one is a message that costs you the afternoon.
 */
const fail = (src: string, message: string): never => {
    throw new Error(`[NacatamalOn] particles "${src}": ${message}`);
};

/**
 * A pair a particle draws from, from either way of writing one.
 *
 * A bare number widens to a pair of itself, because "every one of them is this big" is a thing
 * people write. A pair somebody wrote backwards is **turned round rather than refused**: the
 * intention is never in doubt, and refusing would stop a perfectly good effect from loading.
 */
const asRange = (value: unknown, fallback: TParticleRange, src: string, field: string): TParticleRange => {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return [value, value];
    }
    if (!Array.isArray(value) || value.length !== 2 || !value.every((part) => typeof part === 'number' && Number.isFinite(part))) {
        return fail(src, `"${field}" has to be a number or a pair of them, and it is ${JSON.stringify(value)}`);
    }
    const [low, high] = value as [number, number];
    return low <= high ? [low, high] : [high, low];
};

/**
 * `#rrggbb`, or whatever else `getColor` understands, refused if it comes out as nonsense.
 */
const asColor = (value: unknown, src: string): TColor => {
    // An effect written in code may hand over a colour already worked out. A file never does, and
    // writes it back as text.
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const given = value as Partial<TColor>;
        const color = { r: given.r, g: given.g, b: given.b, a: given.a ?? 1 } as TColor;
        if (![color.r, color.g, color.b, color.a].every((channel) => typeof channel === 'number' && Number.isFinite(channel))) {
            return fail(src, `${JSON.stringify(value)} is not a colour this engine can read`);
        }
        return color;
    }
    if (typeof value !== 'string') {
        return fail(src, `a colour has to be written as a string, and one is ${JSON.stringify(value)}`);
    }
    const color = getColor(value);
    // Checked on the way out as well as on the way in: a colour that came back with a NaN in it
    // would travel all the way into a buffer the card reads, and show up as a particle that is
    // simply not there.
    if (![color.r, color.g, color.b].every(Number.isFinite)) {
        return fail(src, `"${value}" is not a colour this engine can read`);
    }
    return color;
};

/**
 * A curve, sorted and with its stops inside the life they describe.
 *
 * Doing it here is what lets every sampler downstream be a plain walk with no guards. A curve
 * sorted at the point of use would be sorted once per particle per frame.
 */
const asColorCurve = (value: unknown, src: string): TParticleColorStop[] => {
    if (!Array.isArray(value) || value.length === 0) {
        return [{ t: 0, color: getColor('white'), alpha: 1 }];
    }
    return value
        .map((raw) => {
            const stop = raw as Record<string, unknown>;
            const color = asColor(stop.color, src);
            return {
                t: Math.min(1, Math.max(0, asNumber(stop.t, 0))),
                color,
                // Absent means the colour's own, so a file may say opacity once or twice but not
                // have to say it in two places that can disagree.
                alpha: asNumber(stop.alpha, color.a),
            };
        })
        .sort((a, b) => a.t - b.t);
};

const asScaleCurve = (value: unknown): TParticleScaleStop[] => {
    if (!Array.isArray(value) || value.length === 0) {
        return [{ t: 0, scale: 1 }];
    }
    return value
        .map((raw) => {
            const stop = raw as Record<string, unknown>;
            return {
                t: Math.min(1, Math.max(0, asNumber(stop.t, 0))),
                scale: asNumber(stop.scale, 1),
            };
        })
        .sort((a, b) => a.t - b.t);
};

const asEmission = (value: unknown, src: string): TEmissionDoc => {
    const read = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    const rate = asNumber(read.rate, 0);
    const burst = asNumber(read.burst, 0);

    if (rate < 0 || burst < 0) {
        return fail(src, 'a rate and a burst cannot be negative');
    }
    // Both at zero is deliberately allowed. It is an effect something else fires, and refusing it
    // would stop a perfectly good file from loading at all in order to catch a typo its author
    // would have seen the first time they looked at it.
    return {
        rate,
        burst,
        duration: Math.max(0, asNumber(read.duration, 0)),
        loop: asBoolean(read.loop, true),
    };
};

const asShape2d = (value: unknown, src: string): TEmitShape2d => {
    const read = (typeof value === 'object' && value !== null ? value : { kind: 'point' }) as Record<string, unknown>;
    const kind = read.kind;

    switch (kind) {
        case undefined:
        case 'point':
            return { kind: 'point' };
        case 'circle':
            return { kind: 'circle', radius: Math.max(0, asNumber(read.radius, 0)), edge: asBoolean(read.edge, false) };
        case 'rect':
            return { kind: 'rect', width: Math.max(0, asNumber(read.width, 0)), height: Math.max(0, asNumber(read.height, 0)) };
        case 'line':
            return { kind: 'line', length: Math.max(0, asNumber(read.length, 0)), angle: asNumber(read.angle, 0) };
        default:
            // A real shape in the wrong dimension gets its own answer. "unknown shape" would send
            // somebody looking for a typo in a word they spelled correctly.
            if (typeof kind === 'string' && SHAPES_3D.has(kind)) {
                return fail(src, `"${kind}" is a shape for three dimensions, and this is a particles2d effect`);
            }
            return fail(src, `"${String(kind)}" is not a birth shape. It goes point, circle, rect or line`);
    }
};

const asShape3d = (value: unknown, src: string): TEmitShape3d => {
    const read = (typeof value === 'object' && value !== null ? value : { kind: 'point' }) as Record<string, unknown>;
    const kind = read.kind;

    switch (kind) {
        case undefined:
        case 'point':
            return { kind: 'point' };
        case 'sphere':
            return { kind: 'sphere', radius: Math.max(0, asNumber(read.radius, 0)), edge: asBoolean(read.edge, false) };
        case 'box': {
            const size = Array.isArray(read.size) ? read.size : [];
            return {
                kind: 'box',
                size: [0, 1, 2].map((axis) => Math.max(0, asNumber(size[axis], 0))) as [number, number, number],
            };
        }
        case 'cone':
            return { kind: 'cone', radius: Math.max(0, asNumber(read.radius, 0)), angle: asNumber(read.angle, 0) };
        default:
            if (typeof kind === 'string' && SHAPES_2D.has(kind)) {
                return fail(src, `"${kind}" is a flat shape, and this is a particles3d effect`);
            }
            return fail(src, `"${String(kind)}" is not a birth shape. It goes point, sphere, box or cone`);
    }
};

/**
 * How it reacts to a collider, or `null` when the file says nothing, so every effect written before
 * this existed goes on passing through everything exactly as it did. The two amounts are held
 * inside `0` to `1`: a bounce above one would gain speed at every touch and never settle.
 */
const asCollision = (value: unknown, src: string): TParticleCollision | null => {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        return fail(src, '"collision" has to be an object, like { "mode": "bounce", "bounce": 0.3 }');
    }
    const read = value as Record<string, unknown>;
    const mode = read.mode ?? 'bounce';
    if (mode !== 'bounce' && mode !== 'die') {
        return fail(src, `"${String(mode)}" is not a way to collide. It goes bounce or die`);
    }
    const unit = (field: unknown, fallback: number): number => Math.min(1, Math.max(0, asNumber(field, fallback)));
    return { mode, bounce: unit(read.bounce, 0.3), friction: unit(read.friction, 0.2) };
};

/**
 * A tail, or `null`. Copies are whole numbers and at least one: a tail of half a copy has no
 * answer, and one of none is the same as not having one.
 */
const asTrail = (value: unknown, src: string): TParticleTrail | null => {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        return fail(src, '"trail" has to be an object, like { "length": 6, "width": 0.8, "fade": true }');
    }
    const read = value as Record<string, unknown>;
    return {
        length: Math.max(1, Math.round(asNumber(read.length, 8))),
        width: Math.max(0, asNumber(read.width, 1)),
        fade: asBoolean(read.fade, true),
    };
};

/**
 * How far it reaches, or `null`. A size is a whole width, so a negative one is taken as its length.
 */
const asBounds = (value: unknown, src: string): TParticlesBounds | null => {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        return fail(src, '"bounds" has to be an object with a "center" and a "size"');
    }
    const read = value as Record<string, unknown>;
    const size = asVec3(read.size, { x: 0, y: 0, z: 0 });
    return {
        center: asVec3(read.center, { x: 0, y: 0, z: 0 }),
        size: { x: Math.abs(size.x), y: Math.abs(size.y), z: Math.abs(size.z) },
    };
};

/**
 * The effects its particles set off. One that does not say which file, or when, is refused: it has
 * no sensible answer, and dropping it would quietly lose it the next time a tool saved the file.
 */
const asChildren = (value: unknown, src: string): TChildEmitter[] => {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        return fail(src, '"children" has to be a list');
    }
    return value.map((raw, index) => {
        const read = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        if (typeof read.src !== 'string' || read.src === '') {
            return fail(src, `child ${index} does not say which file it is`);
        }
        if (read.on !== 'birth' && read.on !== 'death') {
            return fail(src, `child ${index} goes off on ${JSON.stringify(read.on)}, and it has to be birth or death`);
        }
        return { on: read.on, src: read.src, count: Math.max(1, Math.round(asNumber(read.count, 1))) };
    });
};

/**
 * Three numbers, each falling back on its own, so a file may name only the axis it cares about.
 */
const asVec3 = (value: unknown, fallback: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
    const read = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    return { x: asNumber(read.x, fallback.x), y: asNumber(read.y, fallback.y), z: asNumber(read.z, fallback.z) };
};

/**
 * Which way they fly, one unit long.
 *
 * Made one unit long here so the birth can multiply it by a speed and be done. One of no length at
 * all is refused: it has no way to point, and the alternative is every particle standing still with
 * nothing anywhere saying why.
 */
const asDirection3d = (value: unknown, src: string): { x: number; y: number; z: number } => {
    const direction = asVec3(value, { x: 0, y: 1, z: 0 });
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!(length > 0)) {
        return fail(src, '"direction" has no length, so it points nowhere');
    }
    return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
};

/**
 * Reads a `.particles` file.
 *
 * Normalizes as it reads, and **names the file in every refusal**. What it refuses is only what has
 * no sensible answer: a kind of effect that is not one, a shape that is not one, a colour that
 * is not a colour, a lifetime of zero. Everything else falls back to something an author would
 * recognise, because an effect that loads slightly wrong can be seen and fixed, and one that does
 * not load at all takes the scene with it.
 *
 * @param value Whatever `JSON.parse` gave back.
 * @param src Which file it came from, for the messages.
 * @returns The effect, checked. A file this engine cannot read throws, naming the file.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseParticlesDoc = (value: unknown, src: string): TParticlesDoc => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return fail(src, 'that is not an effect file');
    }
    const read = value as Record<string, unknown>;

    const format = asNumber(read.format, PARTICLES_FORMAT);
    if (format > PARTICLES_FORMAT) {
        return fail(src, `it is written in format ${format} and this engine reads up to ${PARTICLES_FORMAT}`);
    }
    if (read.kind !== undefined && read.kind !== 'particles2d' && read.kind !== 'particles3d') {
        return fail(src, `"${String(read.kind)}" is not a kind of effect. It goes particles2d or particles3d`);
    }
    const flat = read.kind !== 'particles3d';

    const life = asRange(read.life, [0.6, 1.2], src, 'life');
    if (life[0] <= 0) {
        return fail(src, 'a particle has to live for longer than no time at all');
    }

    // Whatever this version does not draw, kept exactly as it was written. See `unsupported`.
    const unsupported: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(read)) {
        if (!KNOWN.has(name)) {
            unsupported[name] = field;
        }
    }

    // Everything a flat and a deep effect read the same way. Only the speeds and sizes fall back
    // differently, because the flat ones are pixels and the deep ones are units.
    const common = {
        format: PARTICLES_FORMAT,
        texture: typeof read.texture === 'string' && read.texture.trim() !== '' ? read.texture : null,
        atlas: typeof read.atlas === 'string' && read.atlas.trim() !== '' ? read.atlas : null,
        frame: typeof read.frame === 'number' || typeof read.frame === 'string' ? read.frame : null,
        // `frame` wins when a file says both, since a particle can only show one of the two.
        anim: typeof read.anim === 'string' && read.frame === undefined ? read.anim : null,
        max: Math.max(1, Math.round(asNumber(read.max, 100))),
        blend: read.blend === 'additive' ? 'additive' : 'alpha' as TParticleBlend,
        worldSpace: asBoolean(read.worldSpace, true),
        emission: asEmission(read.emission, src),
        spread: Math.max(0, asNumber(read.spread, Math.PI * 2)),
        life,
        speed: asRange(read.speed, flat ? [40, 90] : [1, 2], src, 'speed'),
        size: asRange(read.size, flat ? [4, 8] : [0.1, 0.25], src, 'size'),
        spin: asRange(read.spin, [0, 0], src, 'spin'),
        damping: Math.max(0, asNumber(read.damping, 0)),
        colorOverLife: asColorCurve(read.colorOverLife, src),
        sizeOverLife: asScaleCurve(read.sizeOverLife),
        collision: asCollision(read.collision, src),
        trail: asTrail(read.trail, src),
        bounds: asBounds(read.bounds, src),
        children: asChildren(read.children, src),
        unsupported,
    };

    if (!flat) {
        return {
            ...common,
            kind: 'particles3d',
            shape: asShape3d(read.shape, src),
            direction: asDirection3d(read.direction, src),
            gravity: asVec3(read.gravity, { x: 0, y: 0, z: 0 }),
        } satisfies TParticlesDoc3d;
    }

    const gravity = (typeof read.gravity === 'object' && read.gravity !== null ? read.gravity : {}) as Record<string, unknown>;

    return {
        ...common,
        kind: 'particles2d',
        shape: asShape2d(read.shape, src),
        // Straight up by default, which with y growing downwards is a negative quarter turn. A
        // fountain is what somebody who wrote no direction almost certainly meant.
        direction: asNumber(read.direction, -Math.PI / 2),
        gravity: { x: asNumber(gravity.x, 0), y: asNumber(gravity.y, 0) },
    } satisfies TParticlesDoc2d;
};

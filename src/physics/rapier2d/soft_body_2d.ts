import { placementOf } from '../../box';
import { worldPose2d, writeWorldPose2d } from './world_pose';
import type { SoftBody, SoftBodyDesc, World } from '@dimforge/rapier2d-compat';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TRapierModule } from './load_rapier';
import type { TSoftBody2d, TSoftBodyOptions2d } from './t_soft_body_2d';

/**
 * One soft body of the world: what it was asked to be, and the body once the world has made it.
 */
type TSoftEntry = {
    box: TGameObject;
    options: TSoftBodyOptions2d;
    body: SoftBody | null;
    /**
     * Where its corners are now, from the object's place. Rewritten in place every step.
     */
    outline: Array<{ x: number; y: number }>;
    velocity: { x: number; y: number };
    /**
     * The push asked for, and in which frame: a push lasts the frame it was asked in.
     */
    push: { x: number; y: number };
    pushFrame: number;
    pushing: boolean;
    kicks: Array<{ x: number; y: number }>;
    removed: boolean;
};

/**
 * How finely a body's corners collide: thin, so the outline drawn through them is where it touches.
 */
const CORNER_RADIUS = 1;

/**
 * The corners it starts with, in the world, measured from where its object is.
 */
const startingCorners = (options: TSoftBodyOptions2d, at: { x: number; y: number }): number[] => {
    const corners: number[] = [];
    if (options.shape === 'disk') {
        const count = Math.max(3, Math.round(options.corners ?? 16));
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            corners.push(at.x + Math.cos(angle) * options.radius, at.y + Math.sin(angle) * options.radius);
        }
    } else if (options.shape === 'polygon') {
        for (const point of options.points) corners.push(at.x + point.x, at.y + point.y);
    } else {
        const count = Math.max(2, Math.round(options.corners ?? 12));
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            corners.push(at.x + options.to.x * t, at.y + options.to.y * t);
        }
    }
    return corners;
};

/**
 * The soft bodies of one world: made once the simulation has loaded, pushed before each step, and
 * written back onto their objects after it.
 *
 * @internal
 */
export const createSoftBodies = (deps: { rapier: () => TRapierModule | null; world: () => World | null; frame: () => number }) => {
    const entries = new Set<TSoftEntry>();

    const describe = (rapier: TRapierModule, entry: TSoftEntry): SoftBodyDesc | null => {
        const { options } = entry;
        const corners = startingCorners(options, worldPose2d(entry.box));
        let desc: SoftBodyDesc | null;
        if (options.shape === 'rope') {
            desc = rapier.SoftBodyDesc.polyline(new Float32Array(corners));
        } else {
            desc = rapier.SoftBodyDesc.polygon(corners);
        }
        if (desc === null) return null;
        desc = desc
            .setSoftness(options.softness ?? 5, options.damping ?? 1)
            .setMass(options.mass ?? 1)
            .setParticleRadius(CORNER_RADIUS)
            .setSurfaceCollider(rapier.ColliderDesc.ball(CORNER_RADIUS).setFriction(options.friction ?? 0.5).setRestitution(options.bounce ?? 0));
        // A closed body holds the area it started with, as well as its sides.
        if (options.shape !== 'rope') desc = desc.setVolumePreservation(true);
        if (options.shape !== 'rope' && options.keepShape !== false) desc = desc.setShapeMatching(true);
        if (options.pinned !== undefined && options.pinned.length > 0) desc = desc.setPinnedParticles(options.pinned);
        return desc;
    };

    const make = (entry: TSoftEntry): void => {
        const rapier = deps.rapier();
        const world = deps.world();
        if (entry.body !== null || entry.removed || rapier === null || world === null) return;
        const desc = describe(rapier, entry);
        if (desc === null) {
            console.warn(`[NacatamalOn] useSoftBody2d: the shape of '${entry.box.name}' has no corners, so it has no body.`);
            entry.removed = true;
            return;
        }
        entry.body = world.createSoftBody(desc);
        writeBack(entry);
    };

    /**
     * Puts the object at the body's middle, and its corners around it.
     */
    const writeBack = (entry: TSoftEntry): void => {
        const body = entry.body;
        if (body === null || !body.isValid()) return;
        const middle = body.centerOfMass();
        const corners = body.particlePositions();
        const speeds = body.particleVelocities();
        const count = corners.length / 2;
        entry.outline.length = count;
        let vx = 0;
        let vy = 0;
        for (let i = 0; i < count; i++) {
            const point = entry.outline[i] ?? { x: 0, y: 0 };
            point.x = corners[i * 2] - middle.x;
            point.y = corners[i * 2 + 1] - middle.y;
            entry.outline[i] = point;
            vx += speeds[i * 2];
            vy += speeds[i * 2 + 1];
        }
        entry.velocity.x = count > 0 ? vx / count : 0;
        entry.velocity.y = count > 0 ? vy / count : 0;
        writeWorldPose2d(entry.box, middle.x, middle.y, 0);

        const polygon = entry.options.polygon;
        if (polygon !== undefined && !polygon.destroyed) {
            const points = polygon.points;
            points.length = count;
            for (let i = 0; i < count; i++) {
                const point = points[i] ?? { x: 0, y: 0 };
                point.x = entry.outline[i].x;
                point.y = entry.outline[i].y;
                points[i] = point;
            }
        }
    };

    const remove = (entry: TSoftEntry): void => {
        if (entry.removed) return;
        entry.removed = true;
        entries.delete(entry);
        const world = deps.world();
        if (world !== null && entry.body !== null && entry.body.isValid()) world.removeSoftBody(entry.body);
        entry.body = null;
    };

    return {
        add: (box: TGameObject, options: TSoftBodyOptions2d): TSoftBody2d => {
            if (placementOf(box) === null) {
                throw new Error(`[NacatamalOn] useSoftBody2d: '${box.name}' is nowhere: give it a placement, or something to draw, so the body has somewhere to be.`);
            }
            const entry: TSoftEntry = {
                box,
                options,
                body: null,
                outline: [],
                velocity: { x: 0, y: 0 },
                push: { x: 0, y: 0 },
                pushFrame: -1,
                pushing: false,
                kicks: [],
                removed: false,
            };
            entries.add(entry);
            make(entry);
            const destroy = (): void => remove(entry);
            box.cleanups.push(destroy);
            return {
                outline: entry.outline,
                velocity: entry.velocity,
                push: (x, y) => {
                    entry.push = { x, y };
                    entry.pushFrame = deps.frame();
                },
                kick: (x, y) => {
                    entry.kicks.push({ x, y });
                },
                destroy,
            };
        },

        /**
         * Before the world steps: bodies made now that the simulation is here, and the pushes and
         * kicks of the frame just gone handed over.
         */
        beforeStep: (frame: number): void => {
            for (const entry of entries) {
                make(entry);
                const body = entry.body;
                if (body === null || !body.isValid()) continue;
                const asked = entry.pushFrame === frame - 1;
                if (asked || entry.pushing) {
                    body.resetForces(false);
                    // Corner by corner, each by its own weight: what pushes every corner as gravity does.
                    // The body's own `addForce` hands each corner far more than it was asked.
                    if (asked) {
                        const count = body.numParticles();
                        for (let i = 0; i < count; i++) {
                            const mass = body.particleMass(i);
                            body.addParticleForce(i, { x: entry.push.x * mass, y: entry.push.y * mass }, true);
                        }
                    }
                    entry.pushing = asked;
                }
                if (entry.kicks.length > 0) {
                    const count = body.numParticles();
                    for (const kick of entry.kicks) {
                        for (let i = 0; i < count; i++) {
                            if (body.isParticlePinned(i)) continue;
                            const speed = body.particleVelocity(i);
                            body.setParticleVelocity(i, { x: speed.x + kick.x, y: speed.y + kick.y });
                        }
                    }
                    entry.kicks.length = 0;
                    body.wakeUp();
                }
            }
        },

        afterStep: (): void => {
            for (const entry of entries) writeBack(entry);
        },

        clear: (): void => {
            for (const entry of entries) {
                entry.removed = true;
                entry.body = null;
            }
            entries.clear();
        },
    };
};

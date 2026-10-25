import { MAX_LIGHTS } from '../../light/types/t_light';
import type { Mat4 } from '../../math/mat4';
import type { TDrawLight } from '../interface/draw/t_draw_light';

/**
 * A box around a shape in its own space, as its geometry measures it.
 */
type TBounds = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

/**
 * How many bits one light's number takes in a packed list: its place in the scene's block plus one,
 * so that nothing (0) ends the list. Six hold the thirty-two a scene keeps, and four of them, 24 bits,
 * fit a 32-bit float exactly, which is how two numbers carry all eight.
 */
const BITS = 6;
const PER_NUMBER = 4;

/** Ahead of every lamp, however strong: a sun reaches everything, so it is always among the eight. */
const SUN = 1e9;

const chosen: Array<{ index: number; score: number }> = [];

/**
 * How far a point is from a box in the world, zero inside it.
 */
const distanceToBox = (
    x: number, y: number, z: number,
    minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
): number => {
    const dx = Math.max(minX - x, 0, x - maxX);
    const dy = Math.max(minY - y, 0, y - maxY);
    const dz = Math.max(minZ - z, 0, z - maxZ);
    return Math.hypot(dx, dy, dz);
};

/**
 * The eight of a scene's lights that reach a model most, packed in two numbers for its block.
 *
 * A light reaches the model when its reach touches the box around it, measured from the nearest
 * point of that box and not from its middle, so a long floor with a lamp at one end is lit there.
 * One that does not reach it is left out, which changes nothing that is seen: its light would have
 * faded to nothing before getting there. Among those that reach, a sun first, then each lamp by how
 * much of it is left at that nearest point, as the shader fades it. The eight are given in the order
 * the scene holds them, so a model lit by all of them adds them up in the order it always did.
 *
 * A model with no box to measure (one whose shape has none yet) is taken as the point it stands on.
 *
 * @param lights - The scene's lights, as they sit in its block.
 * @param model - Where the model is in the world.
 * @param bounds - The box around its shape, in its own space.
 * @returns Two numbers, four lights' places in each, `0` where the list has ended.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pickMeshLights = (lights: readonly TDrawLight[], model: Mat4, bounds: TBounds | null): [number, number] => {
    // The box in the world: its middle moved, and its half sizes as far as the turn spreads them.
    let minX = model[12];
    let minY = model[13];
    let minZ = model[14];
    let maxX = minX;
    let maxY = minY;
    let maxZ = minZ;
    if (bounds !== null) {
        const cx = (bounds.min.x + bounds.max.x) / 2;
        const cy = (bounds.min.y + bounds.max.y) / 2;
        const cz = (bounds.min.z + bounds.max.z) / 2;
        const ex = (bounds.max.x - bounds.min.x) / 2;
        const ey = (bounds.max.y - bounds.min.y) / 2;
        const ez = (bounds.max.z - bounds.min.z) / 2;
        const wx = model[0] * cx + model[4] * cy + model[8] * cz + model[12];
        const wy = model[1] * cx + model[5] * cy + model[9] * cz + model[13];
        const wz = model[2] * cx + model[6] * cy + model[10] * cz + model[14];
        const hx = Math.abs(model[0]) * ex + Math.abs(model[4]) * ey + Math.abs(model[8]) * ez;
        const hy = Math.abs(model[1]) * ex + Math.abs(model[5]) * ey + Math.abs(model[9]) * ez;
        const hz = Math.abs(model[2]) * ex + Math.abs(model[6]) * ey + Math.abs(model[10]) * ez;
        minX = wx - hx;
        minY = wy - hy;
        minZ = wz - hz;
        maxX = wx + hx;
        maxY = wy + hy;
        maxZ = wz + hz;
    }

    chosen.length = 0;
    for (let index = 0; index < lights.length; index++) {
        const light = lights[index]!;
        const strength = Math.max(light.color.r, light.color.g, light.color.b) * light.intensity;
        if (light.type === 'directional') {
            chosen.push({ index, score: SUN + strength });
            continue;
        }
        const range = light.range ?? 0;
        const place = light.transform;
        // A panel shines from its nearest point, up to its half diagonal away from its middle.
        const spread = light.type === 'rect' ? Math.hypot(light.width ?? 1, light.height ?? 1) / 2 : 0;
        const distance = Math.max(0, distanceToBox(place.x, place.y, place.z, minX, minY, minZ, maxX, maxY, maxZ) - spread);
        if (range <= 0 || distance >= range) {
            continue;
        }
        chosen.push({ index, score: strength * (1 - distance / range) });
    }

    if (chosen.length > MAX_LIGHTS) {
        chosen.sort((a, b) => b.score - a.score || a.index - b.index);
        chosen.length = MAX_LIGHTS;
    }
    chosen.sort((a, b) => a.index - b.index);

    const packed: [number, number] = [0, 0];
    chosen.forEach(({ index }, k) => {
        const slot = Math.floor(k / PER_NUMBER);
        packed[slot]! += (index + 1) * 2 ** (BITS * (k % PER_NUMBER));
    });
    return packed;
};

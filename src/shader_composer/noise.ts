import { newNode } from './new_node';
import { composerVec3 } from './constructors';
import type { TComposerNode, THelperDef } from './types/t_composer_node';

// Noise. Each node carries the functions it needs written at the top of the shader, kept once by
// name, so `composerSimplexNoise` and `composerFbm` share one base noise. They all work in 3D: a
// vec2 is lifted onto the z = 0 plane, so the same node serves a sprite and a model.

// Value noise: a cheap hash, smoothed between the corners of a grid. Not true simplex noise, but a
// clean, coherent noise from 0 to 1 that compiles everywhere, which is all the era asks of it.
// `simplexNoise` is the name people look for when they want that.
const HASH13: THelperDef = {
    name: 'sgHash13',
    wgsl: /* wgsl */ `fn sgHash13(p: vec3<f32>) -> f32 {
    var q = fract(p * 0.3183099 + 0.1);
    q = q * 17.0;
    return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}`,
    glsl: /* glsl */ `float sgHash13(vec3 p) {
    vec3 q = fract(p * 0.3183099 + 0.1);
    q = q * 17.0;
    return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}`,
};

const NOISE3: THelperDef = {
    name: 'sgNoise3',
    wgsl: /* wgsl */ `fn sgNoise3(x: vec3<f32>) -> f32 {
    let i = floor(x);
    let f = fract(x);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sgHash13(i + vec3<f32>(0.0, 0.0, 0.0)), sgHash13(i + vec3<f32>(1.0, 0.0, 0.0)), u.x),
                   mix(sgHash13(i + vec3<f32>(0.0, 1.0, 0.0)), sgHash13(i + vec3<f32>(1.0, 1.0, 0.0)), u.x), u.y),
               mix(mix(sgHash13(i + vec3<f32>(0.0, 0.0, 1.0)), sgHash13(i + vec3<f32>(1.0, 0.0, 1.0)), u.x),
                   mix(sgHash13(i + vec3<f32>(0.0, 1.0, 1.0)), sgHash13(i + vec3<f32>(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}`,
    glsl: /* glsl */ `float sgNoise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sgHash13(i + vec3(0.0, 0.0, 0.0)), sgHash13(i + vec3(1.0, 0.0, 0.0)), u.x),
                   mix(sgHash13(i + vec3(0.0, 1.0, 0.0)), sgHash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
               mix(mix(sgHash13(i + vec3(0.0, 0.0, 1.0)), sgHash13(i + vec3(1.0, 0.0, 1.0)), u.x),
                   mix(sgHash13(i + vec3(0.0, 1.0, 1.0)), sgHash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}`,
};

// Vec3 hash for cellular/worley feature points.
const HASH33: THelperDef = {
    name: 'sgHash33',
    wgsl: /* wgsl */ `fn sgHash33(p: vec3<f32>) -> vec3<f32> {
    let q = vec3<f32>(dot(p, vec3<f32>(127.1, 311.7, 74.7)),
                      dot(p, vec3<f32>(269.5, 183.3, 246.1)),
                      dot(p, vec3<f32>(113.5, 271.9, 124.6)));
    return fract(sin(q) * 43758.5453);
}`,
    glsl: /* glsl */ `vec3 sgHash33(vec3 p) {
    vec3 q = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                  dot(p, vec3(269.5, 183.3, 246.1)),
                  dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(q) * 43758.5453);
}`,
};

const CELLULAR3: THelperDef = {
    name: 'sgCellular3',
    wgsl: /* wgsl */ `fn sgCellular3(p: vec3<f32>) -> f32 {
    let ip = floor(p);
    let fp = fract(p);
    var minDist = 1.0;
    for (var x = -1; x <= 1; x = x + 1) {
        for (var y = -1; y <= 1; y = y + 1) {
            for (var z = -1; z <= 1; z = z + 1) {
                let neighbor = vec3<f32>(f32(x), f32(y), f32(z));
                let point = sgHash33(ip + neighbor);
                let diff = neighbor + point - fp;
                minDist = min(minDist, length(diff));
            }
        }
    }
    return minDist;
}`,
    glsl: /* glsl */ `float sgCellular3(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    float minDist = 1.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                vec3 neighbor = vec3(float(x), float(y), float(z));
                vec3 point = sgHash33(ip + neighbor);
                vec3 diff = neighbor + point - fp;
                minDist = min(minDist, length(diff));
            }
        }
    }
    return minDist;
}`,
};

/**
 * Lifts a 2D position onto the z = 0 plane, so every generator is a single 3D function.
 */
const asPos3 = (pos: TComposerNode, fn: string): TComposerNode => {
    if (pos.type === 'vec3<f32>') {
        return pos;
    }
    if (pos.type === 'vec2<f32>') {
        return composerVec3(pos, 0);
    }
    throw new Error(`[NacatamalOn] shader composer: ${fn} expects a vec2 or vec3 position, got a ${pos.type}.`);
};

/**
 * Smooth noise at a position (`f32`, 0 to 1): the usual source of anything organic, like clouds,
 * flowing water or a dissolve mask. Takes a `vec2` or a `vec3`. Scale the position to change how
 * busy it is, and add `composerTime()` to move it.
 * @param pos - Where to read it: a `vec2` or a `vec3`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSimplexNoise = (pos: TComposerNode): TComposerNode =>
    newNode('call', 'f32', [asPos3(pos, 'simplexNoise')], { params: ['sgNoise3'], helpers: [HASH13, NOISE3] });

/**
 * Layers of noise, each twice as fine and half as strong as the one before (`f32`): the detailed,
 * natural kind, for terrain, smoke or lava. `octaves` is written into the shader, so it is a small
 * fixed number (4 unless you say). Takes a `vec2` or a `vec3`.
 * @param pos - Where to read it: a `vec2` or a `vec3`.
 * @param octaves - How many layers. Default `4`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerFbm = (pos: TComposerNode, octaves = 4): TComposerNode => {
    const n = Math.max(1, Math.floor(octaves));
    const fbmHelper: THelperDef = {
        name: `sgFbm3o${n}`,
        wgsl: /* wgsl */ `fn sgFbm3o${n}(p: vec3<f32>) -> f32 {
    var value = 0.0;
    var amp = 0.5;
    var freq = 1.0;
    for (var i = 0; i < ${n}; i = i + 1) {
        value = value + amp * sgNoise3(p * freq);
        freq = freq * 2.0;
        amp = amp * 0.5;
    }
    return value;
}`,
        glsl: /* glsl */ `float sgFbm3o${n}(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < ${n}; i++) {
        value = value + amp * sgNoise3(p * freq);
        freq = freq * 2.0;
        amp = amp * 0.5;
    }
    return value;
}`,
    };
    return newNode('call', 'f32', [asPos3(pos, 'fbm')], { params: [fbmHelper.name], helpers: [HASH13, NOISE3, fbmHelper] });
};

/**
 * Cell noise (`f32`): the distance to the nearest of a scatter of random points, which gives
 * cells, cracks or scales. Takes a `vec2` or a `vec3`.
 * @param pos - Where to read it: a `vec2` or a `vec3`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerCellularNoise = (pos: TComposerNode): TComposerNode =>
    newNode('call', 'f32', [asPos3(pos, 'cellularNoise')], { params: ['sgCellular3'], helpers: [HASH33, CELLULAR3] });

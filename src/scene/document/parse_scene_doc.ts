import { MAP_NAME, MAX_MATERIAL_MAPS } from '../../render/shared/material_maps';
import { SCENE_FORMAT, SCENE_VERSION } from './types/t_scene_doc';
import { asArray, asBoolean, asColor, asNumber, asOneOf, asRecord, asString } from '../../utils';
import { nanoId } from '../../utils';
import type { TColor } from '../../color';
import type { TAssetEntry, TGeometrySource } from './types/t_asset_entry';
import type { TBoxNode, TDataEntry, TSceneDoc } from './types/t_scene_doc';
import type {
    TComponentDoc,
    TMaterialDoc,
    TMeshMaterialDoc,
    TSpriteAnimationDoc,
    TTilemapLayerOverride,
} from './types/t_component_doc';
import type { TTransform2d } from '../../gameobjects/types/t_transform_2d';
import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';
import type { TUniformValues } from '../../materials/types/t_uniforms';
import type { TScriptProps } from '../../scripts';
import { createPhysicsBody2d, createPhysicsBody3d } from '../../physics';
import type { TCollider2d, TCollider3d, TPhysicsSurface } from '../../physics';
import type { TParticleColliderShape2d, TParticleColliderShape3d } from '../../gameobjects/particles/colliders/t_particle_collider';
import type { TSoundCone, TSoundZone } from '../../audio';
import type { TTextureWrap } from '../../materials/types/t_material';

const WHITE: TColor = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Which keys of a box node the reader consumes. Everything else is somebody else's and is kept.
 */
const BOX_KEYS = new Set(['id', 'name', 'transform', 'components', 'children', 'data', 'visible', 'screenSpace', 'extra']);

/**
 * Where an unknown component is kept, so that writing the document back puts it where it was.
 */
export const UNSUPPORTED_COMPONENTS = 'unsupportedComponents';

/**
 * A place, or `null` for a box that is not anywhere in particular.
 *
 * Every missing part falls back to identity rather than to nothing, so a transform written as
 * `{ "x": 40 }` is a box forty across and otherwise ordinary, which is what somebody typing that
 * meant.
 */
const parseTransform = (value: unknown): TTransform3d | null => {
    const raw = asRecord(value);
    if (raw === null) {
        return null;
    }
    return {
        x: asNumber(raw.x, 0),
        y: asNumber(raw.y, 0),
        z: asNumber(raw.z, 0),
        rotation: asNumber(raw.rotation, 0),
        rotationX: asNumber(raw.rotationX, 0),
        rotationY: asNumber(raw.rotationY, 0),
        scaleX: asNumber(raw.scaleX, 1),
        scaleY: asNumber(raw.scaleY, 1),
        scaleZ: asNumber(raw.scaleZ, 1),
    };
};

const parseTransform2d = (value: unknown): TTransform2d | undefined => {
    const raw = asRecord(value);
    if (raw === null) {
        return undefined;
    }
    return {
        x: asNumber(raw.x, 0),
        y: asNumber(raw.y, 0),
        rotation: asNumber(raw.rotation, 0),
        scaleX: asNumber(raw.scaleX, 1),
        scaleY: asNumber(raw.scaleY, 1),
    };
};

const parsePoint = (value: unknown): { x: number; y: number } | undefined => {
    const raw = asRecord(value);
    return raw === null ? undefined : { x: asNumber(raw.x, 0), y: asNumber(raw.y, 0) };
};

/**
 * The knobs, kept only where each one is a number or a short list of them.
 *
 * Anything else is dropped rather than carried: a knob holding a string or an object would reach the
 * place where the block the card reads is packed, and land there as a hole.
 */
const parseUniforms = (value: unknown): TUniformValues | undefined => {
    const raw = asRecord(value);
    if (raw === null) {
        return undefined;
    }
    const out: TUniformValues = {};
    for (const [name, knob] of Object.entries(raw)) {
        if (typeof knob === 'number' && Number.isFinite(knob)) {
            out[name] = knob;
        } else if (Array.isArray(knob) && knob.length >= 2 && knob.length <= 4 && knob.every((part) => typeof part === 'number' && Number.isFinite(part))) {
            out[name] = knob as number[];
        }
    }
    return out;
};

const parseMaterial = (value: unknown): TMaterialDoc | undefined => {
    const raw = asRecord(value);
    if (raw === null) {
        return undefined;
    }
    const text = (part: unknown): string | null => (typeof part === 'string' && part.length > 0 ? part : null);
    return {
        name: text(raw.name),
        effect: text(raw.effect),
        fragment: text(raw.fragment),
        fragmentGlsl: text(raw.fragmentGlsl),
        vertex: text(raw.vertex),
        vertexGlsl: text(raw.vertexGlsl),
        uniforms: parseUniforms(raw.uniforms) ?? null,
    };
};

const parseMeshMaterial = (value: unknown): TMeshMaterialDoc => {
    const raw = asRecord(value) ?? {};
    const base = parseMaterial(raw) ?? {
        name: null, effect: null, fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null, uniforms: null,
    };
    return {
        ...base,
        texture: typeof raw.texture === 'string' ? raw.texture : null,
        tint: asColor(raw.tint, WHITE),
        emissive: asColor(raw.emissive, BLACK),
        specular: asColor(raw.specular, BLACK),
        shininess: asNumber(raw.shininess, 32),
        alpha: asNumber(raw.alpha, 1),
        ...(typeof raw.smooth === 'boolean' ? { smooth: raw.smooth } : {}),
        ...parseWrap(raw.wrap),
        ...parseMaps(raw.maps),
        // `true`, or a row count above zero; anything else is off, which is the default.
        ...(raw.vertexSnap === true || (typeof raw.vertexSnap === 'number' && Number.isFinite(raw.vertexSnap) && raw.vertexSnap > 0)
            ? { vertexSnap: raw.vertexSnap }
            : {}),
        ...(raw.affine === true ? { affine: true } : {}),
    };
};

const WRAPS: readonly TTextureWrap[] = ['repeat', 'clamp', 'mirror'];
const isWrap = (value: unknown): value is TTextureWrap => WRAPS.includes(value as TTextureWrap);

/**
 * What a picture does past its edge, one word or one per way. Anything else is left out, which is
 * repeating: a file with a word this engine does not know draws the way a file with none does.
 */
const parseWrap = (value: unknown): Pick<TMeshMaterialDoc, 'wrap'> => {
    if (isWrap(value)) {
        return { wrap: value };
    }
    const pair = asRecord(value);
    return pair !== null && isWrap(pair.u) && isWrap(pair.v) ? { wrap: { u: pair.u, v: pair.v } } : {};
};

/**
 * A material's extra maps. A map with no picture key, or a name a shader could not read it by, is
 * left out, and so is any past the fourth: the scene loads with what it can use.
 */
const parseMaps = (value: unknown): Pick<TMeshMaterialDoc, 'maps'> => {
    const raw = asRecord(value);
    if (raw === null) {
        return {};
    }
    const maps: NonNullable<TMeshMaterialDoc['maps']> = {};
    for (const [name, entry] of Object.entries(raw)) {
        const map = asRecord(entry);
        if (!MAP_NAME.test(name) || map === null || typeof map.texture !== 'string' || Object.keys(maps).length >= MAX_MATERIAL_MAPS) {
            continue;
        }
        maps[name] = {
            texture: map.texture,
            ...parseWrap(map.wrap),
            ...(typeof map.smooth === 'boolean' ? { smooth: map.smooth } : {}),
        };
    }
    return Object.keys(maps).length === 0 ? {} : { maps };
};

/**
 * Only writes the key when the file did, so a default never becomes a written-down decision.
 */
const optionalBoolean = <K extends string>(raw: Record<string, unknown>, key: K): Partial<Record<K, boolean>> =>
    (typeof raw[key] === 'boolean' ? { [key]: raw[key] } as Record<K, boolean> : {});

const optionalNumber = <K extends string>(raw: Record<string, unknown>, key: K): Partial<Record<K, number>> =>
    (typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? { [key]: raw[key] } as Record<K, number> : {});

const optionalString = <K extends string>(raw: Record<string, unknown>, key: K): Partial<Record<K, string>> =>
    (typeof raw[key] === 'string' ? { [key]: raw[key] } as Record<K, string> : {});

/**
 * A sprite's run, or nothing. `null` in a file is the old engine's way of saying "a still sprite",
 * and a still sprite simply has no animation here.
 */
const parseSpriteAnimation = (value: unknown): TSpriteAnimationDoc | undefined => {
    const raw = asRecord(value);
    if (raw === null) {
        return undefined;
    }
    return {
        autoplay: typeof raw.autoplay === 'string' && raw.autoplay.length > 0 ? raw.autoplay : null,
        speed: asNumber(raw.speed, 1),
    };
};

const parseLayers = (value: unknown): TTilemapLayerOverride[] | undefined => {
    const list = asArray(value);
    if (list.length === 0) {
        return undefined;
    }
    const out: TTilemapLayerOverride[] = [];
    for (const entry of list) {
        const raw = asRecord(entry);
        if (raw === null || typeof raw.name !== 'string') {
            continue;
        }
        const material = parseMaterial(raw.material);
        out.push({
            name: raw.name,
            ...(raw.tint !== undefined ? { tint: asColor(raw.tint, WHITE) } : {}),
            ...optionalBoolean(raw, 'visible'),
            ...optionalNumber(raw, 'zIndex'),
            ...(material !== undefined ? { material } : {}),
            ...(parseUniforms(raw.uniforms) !== undefined ? { uniforms: parseUniforms(raw.uniforms) } : {}),
        });
    }
    return out.length === 0 ? undefined : out;
};

/**
 * A collider's flat shape, or `null` for one this version cannot make.
 */
/**
 * A particle collider's flat shape, or `null` for one nothing can make, which sends the component to
 * the hole for what this version cannot read, exactly as a physics shape does.
 */
const parseParticleShape2d = (value: unknown): TParticleColliderShape2d | null => {
    const shape = asRecord(value);
    switch (shape?.kind) {
        case 'rect': return { kind: 'rect', width: Math.max(0, asNumber(shape.width, 0)), height: Math.max(0, asNumber(shape.height, 0)) };
        case 'circle': return { kind: 'circle', radius: Math.max(0, asNumber(shape.radius, 0)) };
        case 'plane': return { kind: 'plane' };
        default: return null;
    }
};

/**
 * The same for a collider in three dimensions.
 */
const parseParticleShape3d = (value: unknown): TParticleColliderShape3d | null => {
    const shape = asRecord(value);
    switch (shape?.kind) {
        case 'box': {
            const size = Array.isArray(shape.size) ? shape.size : [];
            return { kind: 'box', size: [0, 1, 2].map((axis) => Math.max(0, asNumber(size[axis], 0))) as [number, number, number] };
        }
        case 'sphere': return { kind: 'sphere', radius: Math.max(0, asNumber(shape.radius, 0)) };
        case 'plane': return { kind: 'plane' };
        default: return null;
    }
};

/**
 * The area a sound fills, or `undefined` when the file names none or one no version can make. Its
 * shapes are the particle colliders', flat and in depth, told apart by their name.
 */
const parseSoundZone = (value: unknown): TSoundZone | undefined => {
    const raw = asRecord(value);
    if (raw === null) {
        return undefined;
    }
    const kind = asRecord(raw.shape)?.kind;
    const shape = kind === 'rect' || kind === 'circle' ? parseParticleShape2d(raw.shape) : parseParticleShape3d(raw.shape);
    return shape === null ? undefined : { shape, fade: Math.max(0, asNumber(raw.fade, 0)) };
};

/**
 * Which way a sound is loudest, or `undefined` when the file gives none.
 */
const parseSoundCone = (value: unknown): TSoundCone | undefined => {
    const raw = asRecord(value);
    if (raw === null) {
        return undefined;
    }
    return {
        inner: asNumber(raw.inner, 360),
        outer: asNumber(raw.outer, 360),
        outerVolume: Math.min(1, Math.max(0, asNumber(raw.outerVolume, 0))),
    };
};

const parseCollider2d = (value: unknown): TCollider2d | null => {
    const raw = asRecord(value);
    if (raw === null) {
        return null;
    }
    if (raw.shape === 'rect') {
        return { shape: 'rect', width: asNumber(raw.width, 0), height: asNumber(raw.height, 0) };
    }
    if (raw.shape === 'circle') {
        return { shape: 'circle', radius: asNumber(raw.radius, 0) };
    }
    if (raw.shape === 'polygon') {
        const points = asArray(raw.vertices)
            .map((point) => asArray(point))
            .filter((point) => point.length >= 2)
            .map((point): [number, number] => [asNumber(point[0], 0), asNumber(point[1], 0)]);
        // Three points or it is not a shape, and a backend handed two would either refuse or
        // make something nobody asked for.
        return points.length < 3 ? null : { shape: 'polygon', vertices: points };
    }
    return null;
};

/**
 * A collider's shape in three dimensions, or `null` for one this version cannot make.
 */
const parseCollider3d = (value: unknown): TCollider3d | null => {
    const raw = asRecord(value);
    if (raw === null) {
        return null;
    }
    if (raw.shape === 'box') {
        const size = asArray(raw.size);
        return { shape: 'box', size: [asNumber(size[0], 0), asNumber(size[1], 0), asNumber(size[2], 0)] };
    }
    if (raw.shape === 'sphere') {
        return { shape: 'sphere', radius: asNumber(raw.radius, 0) };
    }
    if (raw.shape === 'capsule') {
        return { shape: 'capsule', radius: asNumber(raw.radius, 0), height: asNumber(raw.height, 0) };
    }
    if (raw.shape === 'hull' || raw.shape === 'mesh') {
        const geometry = asString(raw.geometry, '');
        return geometry === '' ? null : { shape: raw.shape, geometry };
    }
    return null;
};

/**
 * What a collider is made of, filled in from the defaults for anything the file leaves out.
 */
const parseSurface = (raw: Record<string, unknown>): Partial<TPhysicsSurface> => ({
    ...optionalNumber(raw, 'restitution'),
    ...optionalNumber(raw, 'friction'),
    ...optionalNumber(raw, 'density'),
    ...optionalBoolean(raw, 'sensor'),
    ...optionalNumber(raw, 'layer'),
    ...optionalNumber(raw, 'collidesWith'),
});

/**
 * One component, or `null` when this version has no idea what it is.
 *
 * `null` does **not** mean thrown away: the caller keeps the entry verbatim, so a component from a
 * newer engine survives being opened and saved here. Losing it would quietly rewrite somebody's
 * file, which is a worse outcome than not drawing it.
 */
const parseComponent = (value: unknown): TComponentDoc | null => {
    const raw = asRecord(value);
    if (raw === null || typeof raw.type !== 'string') {
        return null;
    }
    const id = asString(raw.id, nanoId());

    switch (raw.type) {
        case 'sprite': {
            const material = parseMaterial(raw.material);
            const uniforms = parseUniforms(raw.uniforms);
            const place = parseTransform2d(raw.transform);
            return {
                type: 'sprite',
                id,
                ...(place !== undefined ? { transform: place } : {}),
                texture: typeof raw.texture === 'string' ? raw.texture : null,
                ...optionalString(raw, 'atlas'),
                ...optionalNumber(raw, 'frame'),
                ...(parseSpriteAnimation(raw.animation) !== undefined ? { animation: parseSpriteAnimation(raw.animation) } : {}),
                ...optionalNumber(raw, 'width'),
                ...optionalNumber(raw, 'height'),
                tint: asColor(raw.tint, WHITE),
                ...(parsePoint(raw.anchor) !== undefined ? { anchor: parsePoint(raw.anchor) } : {}),
                ...(parsePoint(raw.uvOffset) !== undefined ? { uvOffset: parsePoint(raw.uvOffset) } : {}),
                ...(parsePoint(raw.uvScale) !== undefined ? { uvScale: parsePoint(raw.uvScale) } : {}),
                ...optionalBoolean(raw, 'flipX'),
                ...optionalBoolean(raw, 'flipY'),
                ...optionalBoolean(raw, 'smooth'),
                ...optionalBoolean(raw, 'visible'),
                ...optionalNumber(raw, 'zIndex'),
                ...(material !== undefined ? { material } : {}),
                ...(uniforms !== undefined ? { uniforms } : {}),
            };
        }
        case 'text': {
            const style = asRecord(raw.style) ?? {};
            const material = parseMaterial(raw.material);
            const uniforms = parseUniforms(raw.uniforms);
            const place = parseTransform2d(raw.transform);
            return {
                type: 'text',
                id,
                ...(place !== undefined ? { transform: place } : {}),
                text: asString(raw.text, ''),
                font: asString(raw.font, ''),
                style: {
                    ...optionalNumber(style, 'fontSize'),
                    ...(style.align !== undefined ? { align: asOneOf(style.align, ['left', 'center', 'right'] as const, 'left') } : {}),
                    ...optionalNumber(style, 'letterSpacing'),
                    ...optionalNumber(style, 'lineSpacing'),
                },
                tint: asColor(raw.tint, WHITE),
                ...(parsePoint(raw.anchor) !== undefined ? { anchor: parsePoint(raw.anchor) } : {}),
                ...optionalBoolean(raw, 'smooth'),
                ...optionalBoolean(raw, 'visible'),
                ...optionalNumber(raw, 'zIndex'),
                ...(material !== undefined ? { material } : {}),
                ...(uniforms !== undefined ? { uniforms } : {}),
            };
        }
        case 'mesh': {
            const uniforms = parseUniforms(raw.uniforms);
            const place = raw.transform === undefined ? null : parseTransform(raw.transform);
            return {
                type: 'mesh',
                id,
                ...(place !== null ? { transform: place } : {}),
                geometry: asString(raw.geometry, ''),
                material: parseMeshMaterial(raw.material),
                ...(uniforms !== undefined ? { uniforms } : {}),
                ...optionalBoolean(raw, 'visible'),
                ...optionalNumber(raw, 'zIndex'),
                ...optionalBoolean(raw, 'castShadow'),
            };
        }
        case 'tilemap': {
            const transform = parseTransform2d(raw.transform);
            const layers = parseLayers(raw.layers);
            return {
                type: 'tilemap',
                id,
                map: asString(raw.map, ''),
                ...(transform !== undefined ? { transform } : {}),
                ...(raw.tint !== undefined ? { tint: asColor(raw.tint, WHITE) } : {}),
                ...optionalBoolean(raw, 'smooth'),
                ...(layers !== undefined ? { layers } : {}),
            };
        }
        case 'particles':
        case 'particles3d': {
            const overrides = asRecord(raw.overrides);
            const scales = overrides === null ? undefined : {
                ...optionalNumber(overrides, 'rateScale'),
                ...optionalNumber(overrides, 'sizeScale'),
                ...optionalNumber(overrides, 'speedScale'),
                ...optionalNumber(overrides, 'lifeScale'),
            };
            // Everything but the placement reads the same in both dimensions.
            const emitter = {
                name: asString(raw.name, ''),
                effect: asString(raw.effect, ''),
                tint: asColor(raw.tint, WHITE),
                alpha: asNumber(raw.alpha, 1),
                autoplay: asBoolean(raw.autoplay, true),
                seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : null,
                ...(scales !== undefined && Object.keys(scales).length > 0 ? { overrides: scales } : {}),
                ...optionalBoolean(raw, 'smooth'),
                ...optionalBoolean(raw, 'visible'),
                ...optionalNumber(raw, 'zIndex'),
            };
            if (raw.type === 'particles3d') {
                const place = raw.transform === undefined ? null : parseTransform(raw.transform);
                return { type: 'particles3d', id, ...(place !== null ? { transform: place } : {}), ...emitter };
            }
            const place = parseTransform2d(raw.transform);
            return { type: 'particles', id, ...(place !== undefined ? { transform: place } : {}), ...emitter };
        }
        case 'camera2d': {
            const place = asRecord(raw.transform) ?? {};
            return {
                type: 'camera2d',
                id,
                transform: { x: asNumber(place.x, 0), y: asNumber(place.y, 0), rotation: asNumber(place.rotation, 0) },
                zoom: asNumber(raw.zoom, 1),
            };
        }
        case 'camera3d': {
            return {
                type: 'camera3d',
                id,
                projection: asOneOf(raw.projection, ['perspective', 'orthographic'] as const, 'perspective'),
                transform: parseTransform(raw.transform) ?? parseTransform({})!,
                fov: asNumber(raw.fov, 60),
                near: asNumber(raw.near, 0.1),
                far: asNumber(raw.far, 1000),
                zoom: asNumber(raw.zoom, 1),
            };
        }
        case 'fog': {
            return {
                type: 'fog',
                id,
                color: asColor(raw.color, BLACK),
                near: asNumber(raw.near, 10),
                far: asNumber(raw.far, 100),
                ...(raw.enabled === false ? { enabled: false } : {}),
            };
        }
        case 'light': {
            const kind = asOneOf(raw.kind, ['directional', 'point', 'spot', 'ambient'] as const, 'directional');
            const place = asRecord(raw.transform);
            return {
                type: 'light',
                id,
                kind,
                color: asColor(raw.color, WHITE),
                intensity: asNumber(raw.intensity, 1),
                ...(kind !== 'ambient' && place !== null ? {
                    transform: {
                        x: asNumber(place.x, 0),
                        y: asNumber(place.y, 0),
                        z: asNumber(place.z, 0),
                        rotationX: asNumber(place.rotationX, 0),
                        rotationY: asNumber(place.rotationY, 0),
                    },
                } : {}),
                ...(kind !== 'ambient' ? { ambient: asNumber(raw.ambient, 0) } : {}),
                ...(kind === 'point' || kind === 'spot' ? { range: asNumber(raw.range, 10) } : {}),
                ...(kind === 'spot' ? { angle: asNumber(raw.angle, Math.PI / 6), penumbra: asNumber(raw.penumbra, 0.1) } : {}),
                // Read for every kind, including a bulb that can never cast: what was written is
                // what comes back. Dropping it here would rewrite somebody's file the first time
                // it was opened and saved, which is the one thing this reader must never do.
                ...optionalBoolean(raw, 'castShadow'),
                ...optionalNumber(raw, 'shadowBias'),
                ...optionalNumber(raw, 'shadowStrength'),
                ...(kind === 'directional' ? optionalNumber(raw, 'shadowArea') : {}),
                ...(kind === 'directional' ? optionalNumber(raw, 'shadowDistance') : {}),
            };
        }
        case 'particle-collider-2d': {
            const shape = parseParticleShape2d(raw.shape);
            return shape === null ? null : { type: 'particle-collider-2d', id, shape, ...optionalBoolean(raw, 'enabled') };
        }
        case 'particle-collider-3d': {
            const shape = parseParticleShape3d(raw.shape);
            return shape === null ? null : { type: 'particle-collider-3d', id, shape, ...optionalBoolean(raw, 'enabled') };
        }
        case 'sprite-texture': {
            // Without a name nothing could show it, and without a size there is nothing to draw
            // into: kept aside as unreadable rather than guessed at.
            const key = asString(raw.key, '');
            const width = asNumber(raw.width, 0);
            const height = asNumber(raw.height, 0);
            if (key === '' || width < 1 || height < 1) {
                return null;
            }
            return {
                type: 'sprite-texture',
                id,
                key,
                width,
                height,
                background: asColor(raw.background, BLACK),
                ...(raw.sees === 'scene' ? { sees: 'scene' as const } : {}),
            };
        }
        case 'physics2d': {
            const collider = parseCollider2d(raw.collider);
            // A shape nothing can make goes to the hole for what this version cannot read, so it
            // comes back out of the file untouched instead of being dropped or guessed at.
            if (collider === null) {
                return null;
            }
            // Completed with the same factory a scene in code goes through, so a file written
            // before a field existed opens with that field's default rather than with an
            // `undefined` each adapter would read its own way.
            const { _type, ...rest } = createPhysicsBody2d({
                id,
                name: asString(raw.name, 'Body'),
                body: asOneOf(raw.body, ['static', 'dynamic', 'kinematic'] as const, 'static'),
                collider,
                ...parseSurface(raw),
            });
            return { type: 'physics2d', ...rest };
        }
        case 'physics3d': {
            const collider = parseCollider3d(raw.collider);
            if (collider === null) {
                return null;
            }
            const offset = asArray(raw.offset);
            const { _type, ...rest } = createPhysicsBody3d({
                id,
                name: asString(raw.name, 'Body'),
                body: asOneOf(raw.body, ['static', 'dynamic', 'kinematic'] as const, 'static'),
                collider,
                ...(raw.offset !== undefined
                    ? { offset: [asNumber(offset[0], 0), asNumber(offset[1], 0), asNumber(offset[2], 0)] as [number, number, number] }
                    : {}),
                ...parseSurface(raw),
            });
            return { type: 'physics3d', ...rest };
        }
        case 'physics-world-2d': {
            const gravity = asRecord(raw.gravity) ?? {};
            return {
                type: 'physics-world-2d',
                id,
                gravity: { x: asNumber(gravity.x, 0), y: asNumber(gravity.y, 900) },
            };
        }
        case 'physics-world-3d': {
            const gravity = asRecord(raw.gravity) ?? {};
            return {
                type: 'physics-world-3d',
                id,
                gravity: { x: asNumber(gravity.x, 0), y: asNumber(gravity.y, -9.81), z: asNumber(gravity.z, 0) },
            };
        }
        case 'store': {
            const ref = asString(raw.ref, '');
            // A link naming nothing can never be followed, so it goes to the hole for what this
            // version cannot read rather than coming back as a link to nowhere.
            return ref === '' ? null : { type: 'store', id, ref };
        }
        case 'sound': {
            const audio = asString(raw.audio, '');
            // A sound naming no file is a sound nothing could ever play, so it goes to the hole
            // with the components this version does not understand rather than being restored as
            // silence nobody can see.
            if (audio === '') {
                return null;
            }
            return {
                type: 'sound',
                id,
                audio,
                ...optionalNumber(raw, 'volume'),
                ...optionalBoolean(raw, 'loop'),
                ...optionalNumber(raw, 'rate'),
                ...optionalString(raw, 'channel'),
                ...optionalBoolean(raw, 'autoplay'),
                ...optionalBoolean(raw, 'spatial'),
                ...optionalNumber(raw, 'refDistance'),
                ...optionalNumber(raw, 'maxDistance'),
                ...(parseSoundCone(raw.cone) !== undefined ? { cone: parseSoundCone(raw.cone) } : {}),
                ...(parseSoundZone(raw.zone) !== undefined ? { zone: parseSoundZone(raw.zone) } : {}),
            };
        }
        case 'music': {
            // A layer with no file cannot play and a layer with no name cannot be moved, so either
            // is left out; music left with no layers is music nothing could play, and goes to the
            // hole with the rest of what this version cannot read.
            const layers = asArray(raw.layers).flatMap((entry) => {
                const layer = asRecord(entry);
                const name = asString(layer?.name, '');
                const audio = asString(layer?.audio, '');
                return layer === null || name === '' || audio === '' ? [] : [{ name, audio, ...optionalNumber(layer, 'volume') }];
            });
            if (layers.length === 0) {
                return null;
            }
            return {
                type: 'music',
                id,
                layers,
                ...optionalNumber(raw, 'volume'),
                ...optionalString(raw, 'channel'),
                ...optionalBoolean(raw, 'autoplay'),
            };
        }
        case 'audio-listener':
            return { type: 'audio-listener', id, ...optionalBoolean(raw, 'enabled') };
        case 'script': {
            // A behaviour with no name is not an attachment to anything, so it falls through to the
            // hole where unreadable entries are kept and is written back out untouched.
            if (typeof raw.ref !== 'string' || raw.ref.length === 0) {
                return null;
            }
            const props = parseScriptProps(raw.props);
            return {
                type: 'script',
                id,
                ref: raw.ref,
                ...(Object.keys(props).length > 0 ? { props } : {}),
            };
        }
        default:
            return null;
    }
};

/**
 * The settings one attachment was saved with.
 *
 * Only the three kinds a form can produce survive; anything else in the file is left out rather
 * than passed on, because a behaviour reading it would get something its declared type says cannot
 * happen. Which keys should exist is the behaviour's to say, so a missing one is not a problem
 * here: it is filled from the behaviour's own default when the attachment is made.
 */
const parseScriptProps = (raw: unknown): TScriptProps => {
    const record = asRecord(raw);
    if (record === null) {
        return {};
    }
    const props: TScriptProps = {};
    for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string' || typeof value === 'boolean') {
            props[key] = value;
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            props[key] = value;
        }
    }
    return props;
};

const parseAsset = (value: unknown): TAssetEntry | null => {
    const raw = asRecord(value);
    if (raw === null || typeof raw.type !== 'string' || typeof raw.key !== 'string') {
        return null;
    }
    const key = raw.key;

    if (raw.type === 'geometry') {
        const source = parseGeometrySource(raw.source);
        return source === null ? null : { type: 'geometry', key, source };
    }
    if (raw.type === 'font') {
        return { type: 'font', key, json: asString(raw.json, ''), atlas: asString(raw.atlas, '') };
    }
    if (raw.type === 'texture' || raw.type === 'atlas' || raw.type === 'shader' || raw.type === 'particles' || raw.type === 'tilemap' || raw.type === 'audio') {
        // `src` defaults to the key, because for most of these they are the same string and a file
        // that only said it once meant both.
        return { type: raw.type, key, src: asString(raw.src, key) };
    }
    return null;
};

const parseGeometrySource = (value: unknown): TGeometrySource | null => {
    const raw = asRecord(value);
    if (raw === null || typeof raw.kind !== 'string') {
        return null;
    }
    switch (raw.kind) {
        case 'cube': return { kind: 'cube', ...optionalNumber(raw, 'width'), ...optionalNumber(raw, 'height'), ...optionalNumber(raw, 'depth') };
        case 'plane': return { kind: 'plane', ...optionalNumber(raw, 'width'), ...optionalNumber(raw, 'depth'), ...optionalNumber(raw, 'widthSegments'), ...optionalNumber(raw, 'depthSegments') };
        case 'circle': return { kind: 'circle', ...optionalNumber(raw, 'radius'), ...optionalNumber(raw, 'segments') };
        case 'uvSphere': return { kind: 'uvSphere', ...optionalNumber(raw, 'radius'), ...optionalNumber(raw, 'segments'), ...optionalNumber(raw, 'rings') };
        case 'icoSphere': return { kind: 'icoSphere', ...optionalNumber(raw, 'radius'), ...optionalNumber(raw, 'subdivisions') };
        case 'cylinder': return { kind: 'cylinder', ...optionalNumber(raw, 'radius'), ...optionalNumber(raw, 'height'), ...optionalNumber(raw, 'segments') };
        case 'cone': return { kind: 'cone', ...optionalNumber(raw, 'radius'), ...optionalNumber(raw, 'height'), ...optionalNumber(raw, 'segments') };
        case 'torus': return { kind: 'torus', ...optionalNumber(raw, 'radius'), ...optionalNumber(raw, 'tube'), ...optionalNumber(raw, 'radialSegments'), ...optionalNumber(raw, 'tubularSegments') };
        case 'gltf': return typeof raw.src === 'string' ? { kind: 'gltf', src: raw.src, ...optionalString(raw, 'node') } : null;
        default: return null;
    }
};

/**
 * The state a box was saved with, in the order the file lists it.
 *
 * An entry that is not an object, or has no `value`, is still kept as an entry holding `null`
 * rather than dropped, because **the position is the identity**: skipping a bad one would move
 * every entry after it one place up and hand their values to the wrong `useData`.
 */
const parseData = (raw: unknown): TDataEntry[] =>
    asArray(raw).map((entry) => {
        const record = asRecord(entry);
        return { value: record === null ? null : record.value ?? null };
    });

/**
 * Counts what a document said that this version could not use, so it is reported once and not per field.
 */
type TUnknowns = { components: string[]; assets: string[] };

const parseBox = (value: unknown, unknowns: TUnknowns): TBoxNode => {
    const raw = asRecord(value) ?? {};

    const components: TComponentDoc[] = [];
    const unsupported: unknown[] = [];
    for (const entry of asArray(raw.components)) {
        const component = parseComponent(entry);
        if (component !== null) {
            components.push(component);
            continue;
        }
        // Kept rather than dropped: see `parseComponent`.
        unsupported.push(entry);
        const named = asRecord(entry);
        unknowns.components.push(typeof named?.type === 'string' ? named.type : '(no type)');
    }

    // Everything the file said about this box that is none of this version's business: a field from
    // a newer format, a marker some tool left. Kept whole and written back untouched.
    const extra: Record<string, unknown> = { ...(asRecord(raw.extra) ?? {}) };
    for (const [key, held] of Object.entries(raw)) {
        if (!BOX_KEYS.has(key)) {
            extra[key] = held;
        }
    }
    if (unsupported.length > 0) {
        extra[UNSUPPORTED_COMPONENTS] = unsupported;
    }

    return {
        id: asString(raw.id, nanoId()),
        name: asString(raw.name, 'Box'),
        transform: parseTransform(raw.transform),
        components,
        children: asArray(raw.children).map((child) => parseBox(child, unknowns)),
        ...(Array.isArray(raw.data) && raw.data.length > 0 ? { data: parseData(raw.data) } : {}),
        ...optionalBoolean(raw, 'visible'),
        ...optionalBoolean(raw, 'screenSpace'),
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
    };
};

/**
 * A scene with nothing in it, which is what a file beyond saving comes back as.
 */
const emptyDoc = (name: string): TSceneDoc => ({
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    name,
    assets: [],
    root: { id: nanoId(), name, transform: null, components: [], children: [] },
});

/**
 * Reads a scene document, whatever state it is in.
 *
 * **Total and never throws.** A field that is missing, of the wrong shape or plain nonsense falls
 * back to its default and the scene still opens. A scene is written by tools and edited by hand, so
 * treating it as a promise would mean one typo costs you the level.
 *
 * What it does say out loud, once per document rather than once per field:
 *
 * - a file that is **not a scene of this engine**, which comes back empty, because carrying on would
 *   mean quietly presenting somebody else's file as an empty level;
 * - one written by a **newer version**, which is read anyway: most of it is still readable, and what
 *   is not is kept rather than lost;
 * - **components and assets this version does not know**, which are counted and named.
 *
 * Nothing is deleted on the way in. An unknown component is kept beside its box and an unknown field
 * is kept on it, so a document opened here and written back out again is the document that came in.
 *
 * @param value Whatever `JSON.parse` gave back.
 * @param src Where it came from, named in every warning. A game opens a dozen scenes and they all
 * fail the same way; a message that does not say which one costs you the afternoon.
 *
 * @returns The document. Always one: empty when the file could not be read as a scene at all.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseSceneDoc = (value: unknown, src: string): TSceneDoc => {
    const raw = asRecord(value);
    if (raw === null) {
        console.warn(`[NacatamalOn] scene "${src}": this is not a scene document at all. It opens empty.`);
        return emptyDoc('');
    }

    if (raw.format !== SCENE_FORMAT) {
        console.warn(`[NacatamalOn] scene "${src}": '${String(raw.format)}' is not a scene of this engine. It opens empty.`);
        return emptyDoc('');
    }
    if (typeof raw.version === 'number' && raw.version > SCENE_VERSION) {
        console.warn(`[NacatamalOn] scene "${src}": written by a newer version (${raw.version}). It is read anyway, and anything unknown in it is kept but not used.`);
    }

    const name = asString(raw.name, '');
    if (name === '') {
        console.warn(`[NacatamalOn] scene "${src}": it has no name, so nothing can start it. Give it a "name".`);
    }

    const unknowns: TUnknowns = { components: [], assets: [] };

    const assets: TAssetEntry[] = [];
    for (const entry of asArray(raw.assets)) {
        const asset = parseAsset(entry);
        if (asset === null) {
            const named = asRecord(entry);
            unknowns.assets.push(typeof named?.type === 'string' ? named.type : '(no type)');
            continue;
        }
        assets.push(asset);
    }

    const root = parseBox(raw.root, unknowns);

    if (unknowns.components.length > 0) {
        const kinds = [...new Set(unknowns.components)].join(', ');
        console.warn(`[NacatamalOn] scene "${src}": ${unknowns.components.length} component(s) of a kind this version does not know (${kinds}). They are not drawn, and they are kept so saving the scene does not lose them.`);
    }
    if (unknowns.assets.length > 0) {
        const kinds = [...new Set(unknowns.assets)].join(', ');
        console.warn(`[NacatamalOn] scene "${src}": ${unknowns.assets.length} asset(s) of a kind this version cannot load (${kinds}). Anything pointing at them draws without them.`);
    }

    return { format: SCENE_FORMAT, version: SCENE_VERSION, name, assets, root };
};

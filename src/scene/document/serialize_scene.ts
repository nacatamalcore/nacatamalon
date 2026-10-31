import { SCENE_FORMAT, SCENE_VERSION } from './types/t_scene_doc';
import { isEffectFromCode } from '../../loaders/particles/file_from_effect';
import { isBuiltinFont } from '../../gameobjects/text/default_font';
import { UNSUPPORTED_COMPONENTS } from './parse_scene_doc';
import { DEFAULT_FONT_ATLAS_SIZE, isMadeTexture } from '../../loaders';
import type { TFog } from '../../fog/types/t_fog';
import type { TTexture } from '../../loaders';
import type { TColor } from '../../color';
import { DEFAULT_CHANNEL } from '../../audio';
import { lookKnobs } from '../../shader_composer/surface/compose_surface';
import type { TAssetEntry } from './types/t_asset_entry';
import type { TMusicAttachment, TSongAttachment, TSoundAttachment } from '../../audio';
import type { TBox } from '../../box';
import type { TBoxNode, TSceneDoc } from './types/t_scene_doc';
import type { TCamera2d } from '../../camera';
import type { TCamera3d } from '../../camera/types/t_camera_3d';
import type { TDrawable } from '../../gameobjects/types';
import type { TLight } from '../../light';
import type { TMaterial, TMeshMaterial, TSpriteMaterial } from '../../materials';
import type { TComponentDoc, TMaterialDoc, TMeshMaterialDoc, TTilemapLayerOverride } from './types/t_component_doc';
import type { TMesh } from '../../gameobjects/mesh/types/t_mesh';
import type { TParticles } from '../../gameobjects/particles/types/t_particles';
import type { TParticles3d } from '../../gameobjects/particles/types/t_particles_3d';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TLoadedAtlas } from '../../loaders';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';
import { windowOf } from '../../gameobjects/nine_slice/expand_nine_slice';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TTilemapLayer } from '../../gameobjects/tilemap';
import type { TTransform2d } from '../../gameobjects/types/t_transform_2d';
import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';

/**
 * Everything the walk collects on its way down, so a document comes out of one pass.
 */
type TWriting = {
    /**
     * By key, so two sprites sharing a sheet name it once.
     */
    assets: Map<string, TAssetEntry>;
};

const isDefaultColor = (color: TColor, r: number, g: number, b: number, a: number): boolean =>
    color.r === r && color.g === g && color.b === b && color.a === a;

/**
 * Only writes the key when the value is not what it would have been anyway.
 */
const unless = <K extends string, V>(key: K, value: V, fallback: V): Partial<Record<K, V>> =>
    (value === undefined || value === fallback ? {} : { [key]: value } as Record<K, V>);

const writeTransform = (transform: TTransform3d | null): TTransform3d | null => {
    if (transform === null) {
        return null;
    }
    // Field by field rather than spread, so `worldTransform` and anything else the frame leaves on a
    // record never reaches the file. What is derived is worked out again, never written down.
    return {
        x: transform.x,
        y: transform.y,
        z: transform.z,
        rotation: transform.rotation,
        rotationX: transform.rotationX,
        rotationY: transform.rotationY,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        scaleZ: transform.scaleZ,
        ...(transform.pivot !== undefined && transform.pivot !== null
            ? { pivot: { x: transform.pivot.x, y: transform.pivot.y, z: transform.pivot.z } }
            : {}),
    };
};

/**
 * Nothing to say about where something is: the same answer as never having been placed.
 */
const isOrigin = (place: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }): boolean =>
    place.x === 0 && place.y === 0 && place.rotation === 0 && place.scaleX === 1 && place.scaleY === 1;

/**
 * Where a drawable sits **on its box**, and nothing when that is the box's own corner.
 *
 * A box places the whole object and a drawable places itself within it. Both are real: one box can
 * carry a picture and the shadow under it, each at its own offset, and `createSprite({ transform })`
 * is how almost every scene in this engine is written. So the format has to be able to say both, or
 * a room written down from a running game comes back with everything piled at the origin and
 * nothing whatsoever having failed.
 *
 * Field by field rather than spread, so `worldTransform` and anything else the frame leaves on the
 * record never reaches the file. Left out at the origin, by the rule the whole format keeps: an
 * absent field is its default.
 */
const writeFlatPlace = (place: TTransform2d): TTransform2d | undefined => (isOrigin(place) ? undefined : {
    x: place.x,
    y: place.y,
    rotation: place.rotation,
    scaleX: place.scaleX,
    scaleY: place.scaleY,
});

/**
 * The same for something placed in three dimensions, which today is a model.
 */
const writeDeepPlace = (place: TTransform3d): TTransform3d | undefined => (
    isOrigin(place) && place.z === 0 && place.rotationX === 0 && place.rotationY === 0 && place.scaleZ === 1 && (place.pivot ?? null) === null
        ? undefined
        : writeTransform(place) ?? undefined
);

const point = (value: { x: number; y: number } | undefined): { x: number; y: number } | undefined =>
    (value === undefined ? undefined : { x: value.x, y: value.y });

/**
 * A material as a file name where there is one, and as its own text where there is not.
 *
 * The file wins, and when it does the four hooks come out empty: a copy of a shader's source living
 * in a scene is a copy that goes stale the moment somebody edits the file. The text is only written
 * for a material built in code with its shader typed at the call site, which has no file to name and
 * would otherwise be lost entirely.
 */
const writeMaterial = (material: TMaterial, writing: TWriting): TMaterialDoc => {
    const file = material.effect;
    if (file !== null) {
        writing.assets.set(file.key, { type: 'shader', key: file.key, src: file.src });
    }
    return {
        name: material.name,
        effect: file === null ? null : file.key,
        fragment: file === null ? material.fragment : null,
        fragmentGlsl: file === null ? material.fragmentGlsl : null,
        vertex: file === null ? material.vertex : null,
        vertexGlsl: file === null ? material.vertexGlsl : null,
        uniforms: material.uniforms === null || Object.keys(material.uniforms).length === 0 ? null : { ...material.uniforms },
    };
};

/**
 * Lists an image the scene shows among what it has to load, unless the game made it: a picture drawn
 * into by a component (written by its own object) or one painted in code (which the game makes again
 * before loading the document). Neither has a file to fetch. Listed, the scene would try to load it
 * from nowhere when opened, and take its name before the picture is made.
 */
const listTexture = (texture: TTexture, writing: TWriting): void => {
    if (!isMadeTexture(texture)) {
        writing.assets.set(texture.key, { type: 'texture', key: texture.key, src: texture.src });
    }
};

/**
 * What a picture does past its edge, written only when it does not repeat, which is the default
 * however it is spelled.
 */
const writtenWrap = (wrap: TMeshMaterial['wrap']): Pick<TMeshMaterialDoc, 'wrap'> =>
    (wrap === undefined || wrap === 'repeat' || (typeof wrap === 'object' && wrap.u === 'repeat' && wrap.v === 'repeat')
        ? {}
        : { wrap: typeof wrap === 'string' ? wrap : { u: wrap.u, v: wrap.v } });

/**
 * A material's extra maps, each by the key of its picture, with the pictures listed among what the
 * scene loads (except those the game paints itself, which have no file).
 */
const writeMaps = (maps: TMeshMaterial['maps'], writing: TWriting): Pick<TMeshMaterialDoc, 'maps'> => {
    if (maps === undefined || Object.keys(maps).length === 0) {
        return {};
    }
    const written: NonNullable<TMeshMaterialDoc['maps']> = {};
    for (const [name, map] of Object.entries(maps)) {
        listTexture(map.texture, writing);
        written[name] = {
            texture: map.texture.key,
            ...writtenWrap(map.wrap),
            ...(map.smooth !== undefined ? { smooth: map.smooth } : {}),
        };
    }
    return { maps: written };
};

/**
 * A model's surface, as the document keeps it.
 *
 * `fromFile` is a piece of a model file. **Its picture is not written**: the file brings it back
 * when the scene opens, and only a shader of its own is taken from the document (see
 * `buildModelMesh`). Written, it would name a picture kept inside the file (`car.glb#image:0`) as if
 * it were one of its own, and opening the scene would fetch that name, fail, and leave the error
 * where the file's picture would be looked for, drawing the piece without it.
 */
const writeMeshMaterial = (material: TMeshMaterial, writing: TWriting, fromFile: boolean): TMeshMaterialDoc => {
    const texture = fromFile ? null : material.texture;
    if (texture !== null) {
        listTexture(texture, writing);
    }
    const glow = fromFile ? null : material.emissiveTexture ?? null;
    if (glow !== null) {
        listTexture(glow, writing);
    }
    const occlusion = fromFile ? null : material.occlusion ?? null;
    if (occlusion !== null) {
        listTexture(occlusion.texture, writing);
    }
    // A material made by looks writes the looks and not the colour hook they made: the recipe is
    // the truth, and the shader is made again from it, by whatever version opens the scene.
    const looked = material.lighting !== undefined || material.steps !== undefined;
    const written = writeMaterial(material, writing);
    const lighting = material.lighting === undefined ? undefined : { ...material.lighting } as Record<string, unknown>;
    const steps = material.steps?.map((step) => ({ ...step }) as Record<string, unknown>);
    let uniforms = written.uniforms;
    if (looked && uniforms !== null) {
        // A look's knobs are written in the look, as they are turned now, and not again among the
        // uniforms: one place for each number, so whoever edits the document edits the look.
        const rest = { ...uniforms };
        for (const knob of lookKnobs(material.lighting, material.steps)) {
            if (rest[knob.uniform] === undefined) {
                continue;
            }
            const value = rest[knob.uniform];
            const holder = knob.slot === 'lighting' ? lighting : steps?.[knob.slot];
            if (holder !== undefined) {
                holder[knob.field] = Array.isArray(value) ? [...value] : value;
            }
            delete rest[knob.uniform];
        }
        uniforms = Object.keys(rest).length === 0 ? null : rest;
    }
    return {
        ...written,
        uniforms,
        ...(looked ? { fragment: null, fragmentGlsl: null } : {}),
        texture: texture === null ? null : texture.key,
        tint: { ...material.tint },
        emissive: { ...material.emissive },
        ...(glow !== null ? { emissiveTexture: glow.key } : {}),
        // Only what differs from all of it, laid out by the first coordinate.
        ...(occlusion !== null
            ? {
                occlusion: {
                    texture: occlusion.texture.key,
                    ...(occlusion.strength !== undefined && occlusion.strength !== 1 ? { strength: occlusion.strength } : {}),
                    ...(occlusion.uv === 'uv2' ? { uv: 'uv2' as const } : {}),
                    // Written whenever it says one, repeating included: left out, it is the colour
                    // picture's, which may be something else.
                    ...(occlusion.wrap !== undefined
                        ? { wrap: typeof occlusion.wrap === 'string' ? occlusion.wrap : { u: occlusion.wrap.u, v: occlusion.wrap.v } }
                        : {}),
                },
            }
            : {}),
        specular: { ...material.specular },
        shininess: material.shininess,
        alpha: material.alpha,
        ...unless('smooth', material.smooth, undefined),
        // Repeating is the default, however it is spelled, so it is never written down.
        ...writtenWrap(material.wrap),
        ...writeMaps(material.maps, writing),
        ...(material.vertexSnap === true || (typeof material.vertexSnap === 'number' && material.vertexSnap > 0)
            ? { vertexSnap: material.vertexSnap }
            : {}),
        ...(material.affine === true ? { affine: true } : {}),
        ...(material.cull === 'back' || material.cull === 'front' || material.cull === 'none' ? { cull: material.cull } : {}),
        ...(material.alphaCutoff !== undefined ? { alphaCutoff: material.alphaCutoff } : {}),
        ...(material.transparent !== undefined ? { transparent: material.transparent } : {}),
        ...(lighting !== undefined ? { lighting: lighting as TMeshMaterialDoc['lighting'] } : {}),
        ...(steps !== undefined ? { steps: steps as TMeshMaterialDoc['steps'] } : {}),
    };
};

const writeSprite = (sprite: TSprite, writing: TWriting): TComponentDoc => {
    const atlas = sprite.atlas;
    // A sheet read from a file is written as that file, with the frame and the run: the window into
    // the image follows from them, and writing it as a plain picture would lose the run and every
    // other frame. A sheet made in code has no file to name, so it is written as its picture.
    const file = atlas !== undefined && 'type' in atlas && atlas.type === 'atlas' ? atlas as TLoadedAtlas : undefined;
    if (file !== undefined) {
        writing.assets.set(file.key, { type: 'atlas', key: file.key, src: file.src });
    } else {
        if (sprite.texture !== null) {
            listTexture(sprite.texture, writing);
        }
        if (atlas !== undefined) {
            writing.assets.set(atlas.texture.key, { type: 'texture', key: atlas.texture.key, src: atlas.texture.src });
        }
    }
    const place = writeFlatPlace(sprite.transform);
    return {
        type: 'sprite',
        id: sprite.id,
        ...(place !== undefined ? { transform: place } : {}),
        ...(file !== undefined
            ? {
                texture: null,
                atlas: file.key,
                ...(sprite.frame !== undefined ? { frame: sprite.frame } : {}),
                ...(sprite.animation !== undefined ? { animation: { ...sprite.animation } } : {}),
            }
            : { texture: sprite.texture === null ? null : sprite.texture.key }),
        ...unless('width', sprite.width, undefined),
        ...unless('height', sprite.height, undefined),
        tint: { ...sprite.tint },
        ...(point(sprite.anchor) !== undefined ? { anchor: point(sprite.anchor) } : {}),
        ...(point(sprite.pivot) !== undefined ? { pivot: point(sprite.pivot) } : {}),
        ...(file === undefined && point(sprite.uvOffset) !== undefined ? { uvOffset: point(sprite.uvOffset) } : {}),
        ...(file === undefined && point(sprite.uvScale) !== undefined ? { uvScale: point(sprite.uvScale) } : {}),
        ...unless('flipX', sprite.flipX, false),
        ...unless('flipY', sprite.flipY, false),
        ...unless('smooth', sprite.smooth, undefined),
        ...(sprite.blend === 'additive' ? { blend: 'additive' as const } : {}),
        ...(sprite.repeat === true ? { repeat: true } : {}),
        ...(sprite.repeat === true && sprite.repeatOffset !== undefined && (sprite.repeatOffset.x !== 0 || sprite.repeatOffset.y !== 0)
            ? { repeatOffset: point(sprite.repeatOffset) }
            : {}),
        ...(sprite.parallax !== undefined && (sprite.parallax.x !== 1 || sprite.parallax.y !== 1) ? { parallax: point(sprite.parallax) } : {}),
        ...unless('visible', sprite.visible, true),
        ...unless('zIndex', sprite.zIndex, undefined),
        ...(sprite.material !== undefined ? { material: writeMaterial(sprite.material as TSpriteMaterial, writing) } : {}),
        ...(sprite.uniforms !== undefined ? { uniforms: { ...sprite.uniforms } } : {}),
    };
};

const writeNineSlice = (panel: TNineSlice, writing: TWriting): TComponentDoc => {
    // Named as a sprite's picture is: a sheet read from a file by that file and its frame, anything
    // else by its picture.
    const atlas = panel.atlas;
    const file = atlas !== undefined && 'type' in atlas && atlas.type === 'atlas' ? atlas as TLoadedAtlas : undefined;
    if (file !== undefined) {
        writing.assets.set(file.key, { type: 'atlas', key: file.key, src: file.src });
    } else {
        listTexture(panel.texture, writing);
    }
    const place = writeFlatPlace(panel.transform);
    const mode = panel.mode;
    // A sheet made in code has no file to name, so it is written as its picture and the window into
    // it, as a sprite's is; a window given by hand the same.
    const window = file === undefined && (atlas !== undefined || panel.uvOffset !== undefined || panel.uvScale !== undefined)
        ? windowOf(panel)
        : undefined;
    return {
        type: 'nine-slice',
        id: panel.id,
        ...(place !== undefined ? { transform: place } : {}),
        ...(file !== undefined
            ? { texture: null, atlas: file.key, ...(panel.frame !== undefined ? { frame: panel.frame } : {}) }
            : { texture: panel.texture.key }),
        ...(window !== undefined && (window.uvOffset.x !== 0 || window.uvOffset.y !== 0) ? { uvOffset: point(window.uvOffset) } : {}),
        ...(window !== undefined && (window.uvScale.x !== 1 || window.uvScale.y !== 1) ? { uvScale: point(window.uvScale) } : {}),
        width: panel.width,
        height: panel.height,
        slice: { ...panel.slice },
        ...(typeof mode === 'object' ? { mode: { ...mode } } : mode !== 'stretch' ? { mode } : {}),
        tint: { ...panel.tint },
        ...(point(panel.anchor) !== undefined ? { anchor: point(panel.anchor) } : {}),
        ...(point(panel.pivot) !== undefined ? { pivot: point(panel.pivot) } : {}),
        ...unless('smooth', panel.smooth, undefined),
        ...(panel.blend === 'additive' ? { blend: 'additive' as const } : {}),
        ...(panel.parallax !== undefined && (panel.parallax.x !== 1 || panel.parallax.y !== 1) ? { parallax: point(panel.parallax) } : {}),
        ...unless('visible', panel.visible, true),
        ...unless('zIndex', panel.zIndex, undefined),
        ...(panel.material !== undefined ? { material: writeMaterial(panel.material as TSpriteMaterial, writing) } : {}),
        ...(panel.uniforms !== undefined ? { uniforms: { ...panel.uniforms } } : {}),
    };
};

const writeText = (text: TText, writing: TWriting): TComponentDoc => {
    // One entry and not two: a font is its metrics **and** its sheet, so its sheet is not also
    // registered as a texture of its own. Whoever loads the font loads both.
    // The engine's own fonts are not files: every game has them, so the scene names one and lists nothing.
    const font = text.font;
    if (font.type === 'font') {
        writing.assets.set(font.key, { type: 'font', key: font.key, src: font.src, ...(font.size !== DEFAULT_FONT_ATLAS_SIZE ? { size: font.size } : {}) });
    } else if (!isBuiltinFont(font.key)) {
        writing.assets.set(font.key, { type: 'bitmap-font', key: font.key, json: font.src, atlas: font.texture.src });
    }
    const place = writeFlatPlace(text.transform);
    return {
        type: 'text',
        id: text.id,
        ...(place !== undefined ? { transform: place } : {}),
        text: text.text,
        font: text.font.key,
        style: { ...text.style },
        tint: { ...text.tint },
        ...(point(text.anchor) !== undefined ? { anchor: point(text.anchor) } : {}),
        ...(point(text.pivot) !== undefined ? { pivot: point(text.pivot) } : {}),
        ...unless('smooth', text.smooth, undefined),
        ...(text.blend === 'additive' ? { blend: 'additive' as const } : {}),
        ...(text.parallax !== undefined && (text.parallax.x !== 1 || text.parallax.y !== 1) ? { parallax: point(text.parallax) } : {}),
        ...unless('visible', text.visible, true),
        ...unless('zIndex', text.zIndex, undefined),
        ...(text.material !== undefined ? { material: writeMaterial(text.material as TSpriteMaterial, writing) } : {}),
        ...(text.uniforms !== undefined ? { uniforms: { ...text.uniforms } } : {}),
    };
};

const writeMesh = (mesh: TMesh, writing: TWriting): TComponentDoc | null => {
    const geometry = mesh.geometry;
    if (geometry === null) {
        return null;
    }
    if (geometry.source === null) {
        // Built from raw vertex data, so there is no recipe to write and nothing could make it
        // again. The mesh is left out rather than written pointing at a shape nobody can build.
        console.warn(`[NacatamalOn] serializeScene: the shape "${geometry.key}" was built from raw vertices, so it cannot be written down. The mesh using it is left out of the document.`);
        return null;
    }
    writing.assets.set(geometry.key, { type: 'geometry', key: geometry.key, source: geometry.source });
    const place = writeDeepPlace(mesh.transform);
    return {
        type: 'mesh',
        id: mesh.id,
        ...(place !== undefined ? { transform: place } : {}),
        geometry: geometry.key,
        material: writeMeshMaterial(mesh.material, writing, geometry.source.kind === 'gltf'),
        ...unless('visible', mesh.visible, true),
        ...unless('zIndex', mesh.zIndex, undefined),
        // Only `false` is ever written: absent means it casts, so writing `true` would put a
        // decision nobody took into somebody's file.
        ...unless('castShadow', mesh.castShadow, true),
        ...unless('alwaysDrawn', mesh.alwaysDrawn, false),
        ...unless('boundsMargin', mesh.boundsMargin, undefined),
    };
};

/**
 * A map, written once however many layers it has.
 *
 * `createTilemap` reads the file and puts every layer on the box in one go, so one entry per layer
 * would describe something no call can make. The layers come back only as the handful of things this
 * scene changed about them; a map dropped in and left alone writes none.
 */
const writeTilemap = (layers: TTilemapLayer[], writing: TWriting): TComponentDoc | null => {
    const first = layers[0];
    if (first === undefined) {
        return null;
    }
    const map = first.map;
    writing.assets.set(map.src, { type: 'tilemap', key: map.src, src: map.src });

    const changed: TTilemapLayerOverride[] = [];
    for (const layer of layers) {
        const entry: TTilemapLayerOverride = {
            name: layer.name,
            // `tint` and `smooth` come from the map by reference, so writing them per layer would
            // record the map's answer as if the layer had made it.
            ...unless('visible', layer.visible, true),
            ...(layer.material !== undefined ? { material: writeMaterial(layer.material as TSpriteMaterial, writing) } : {}),
            ...(layer.uniforms !== undefined ? { uniforms: { ...layer.uniforms } } : {}),
        };
        if (Object.keys(entry).length > 1) {
            changed.push(entry);
        }
    }

    return {
        type: 'tilemap',
        id: first.id,
        map: map.src,
        transform: { ...map.transform },
        ...(isDefaultColor(map.tint, 1, 1, 1, 1) ? {} : { tint: { ...map.tint } }),
        ...unless('smooth', map.smooth, undefined),
        ...(changed.length > 0 ? { layers: changed } : {}),
    };
};

const writeParticles = (emitter: TParticles | TParticles3d, writing: TWriting): TComponentDoc | null => {
    if (isEffectFromCode(emitter.file)) {
        // Written in code, so there is no file to name and the game makes it again when it runs.
        // Left out, like a mesh built from raw vertices, rather than written pointing at nothing.
        console.warn(`[NacatamalOn] serializeScene: the emitter "${emitter.name}" follows an effect written in code, so it cannot be written down. It is left out of the document.`);
        return null;
    }
    writing.assets.set(emitter.file.src, { type: 'particles', key: emitter.file.src, src: emitter.file.src });
    const fields = {
        name: emitter.name,
        effect: emitter.file.src,
        tint: { ...emitter.tint },
        alpha: emitter.alpha,
        // The authored intent, never what it happens to be doing: a scene saved while an explosion
        // was mid-burst must not come back permanently mid-burst.
        autoplay: emitter.autoplay,
        seed: emitter.seed,
        ...(emitter.overrides !== undefined ? { overrides: { ...emitter.overrides } } : {}),
        ...unless('smooth', emitter.smooth, undefined),
        ...unless('visible', emitter.visible, true),
        ...unless('zIndex', emitter.zIndex, undefined),
    };
    // Only the placement differs between the two dimensions, and it is written where it always has
    // been, after the id, so a file saved again keeps its order.
    if (emitter.type === 'particles-3d') {
        const place = writeDeepPlace(emitter.transform);
        return { type: 'particles-3d', id: emitter.id, ...(place !== undefined ? { transform: place } : {}), ...fields };
    }
    const place = writeFlatPlace(emitter.transform);
    return { type: 'particles', id: emitter.id, ...(place !== undefined ? { transform: place } : {}), ...fields };
};

/**
 * A sound as the document keeps one: the clip by name, and the intent.
 *
 * Registers the file in the manifest exactly as a sprite registers its texture, so opening the
 * scene again asks for it before anything that wants it exists.
 */
const writeSound = (sound: TSoundAttachment, writing: TWriting): TComponentDoc => {
    // What the scene measures in is not known here, so a distance nobody chose stays unwritten and
    // is worked out again wherever the scene is opened.
    writing.assets.set(sound.clip.key, { type: 'audio', key: sound.clip.key, src: sound.clip.src });
    return {
        type: 'sound',
        id: sound.id,
        audio: sound.clip.key,
        ...unless('volume', sound.volume, 1),
        ...unless('loop', sound.loop, false),
        ...unless('loopStart', sound.loopStart, 0),
        ...unless('loopEnd', sound.loopEnd, 0),
        ...unless('rate', sound.rate, 1),
        ...unless('pan', sound.pan, 0),
        ...unless('channel', sound.channel, DEFAULT_CHANNEL),
        ...unless('autoplay', sound.autoplay, false),
        ...unless('spatial', sound.spatial, false),
        // Only meaningful placed, so an unplaced sound does not carry two numbers nobody reads.
        ...(sound.spatial && sound.refDistance !== null ? { refDistance: sound.refDistance } : {}),
        ...(sound.spatial && sound.maxDistance !== null ? { maxDistance: sound.maxDistance } : {}),
        ...(sound.cone !== null ? { cone: { ...sound.cone } } : {}),
        ...(sound.zone !== null ? { zone: structuredClone(sound.zone) } : {}),
        ...(sound.duck !== null ? { duck: { ...sound.duck } } : {}),
    };
};

/**
 * Music in layers as the document keeps it: each layer's file by name and how loud it is meant to
 * be, every file registered in the manifest as a sound's is.
 */
const writeMusic = (music: TMusicAttachment, writing: TWriting): TComponentDoc => ({
    type: 'music',
    id: music.id,
    layers: music.layers.map((layer) => {
        writing.assets.set(layer.clip.key, { type: 'audio', key: layer.clip.key, src: layer.clip.src });
        return { name: layer.name, audio: layer.clip.key, ...unless('volume', layer.volume, 1) };
    }),
    ...unless('volume', music.volume, 1),
    ...unless('channel', music.channel, 'music'),
    ...unless('autoplay', music.autoplay, false),
    ...unless('fadeIn', music.fadeIn, 0),
    ...unless('fadeOut', music.fadeOut, 0),
    ...unless('loopStart', music.loopStart, 0),
    ...unless('loopEnd', music.loopEnd, 0),
    ...(music.bpm !== null ? { bpm: music.bpm } : {}),
    ...unless('beatsPerBar', music.beatsPerBar, 4),
    ...unless('firstBeat', music.firstBeat, 0),
});

/**
 * A song as the document keeps it: its file by name, registered in the manifest, and how it was
 * asked to play. A song written in code has no file to name, so it is not written down at all.
 */
const writeSong = (song: TSongAttachment, writing: TWriting): TComponentDoc | null => {
    if (song.file.src === '') {
        return null;
    }
    writing.assets.set(song.file.key, { type: 'song', key: song.file.key, src: song.file.src });
    const voices = Object.fromEntries(Object.entries(song.voices).filter(([, volume]) => volume !== 1));
    return {
        type: 'song',
        id: song.id,
        song: song.file.key,
        ...unless('volume', song.volume, 1),
        ...unless('channel', song.channel, 'music'),
        ...unless('autoplay', song.autoplay, false),
        ...unless('fadeIn', song.fadeIn, 0),
        ...unless('fadeOut', song.fadeOut, 0),
        ...(Object.keys(voices).length > 0 ? { voices } : {}),
        ...(Object.keys(song.pan).length > 0 ? { pan: { ...song.pan } } : {}),
        ...(song.tempo !== null ? { tempo: song.tempo } : {}),
        ...unless('transpose', song.transpose, 0),
    };
};

const writeCamera2d = (camera: TCamera2d): TComponentDoc => ({
    type: 'camera-2d',
    id: camera.id,
    transform: { x: camera.transform.x, y: camera.transform.y, rotation: camera.transform.rotation },
    zoom: camera.zoom,
});

const writeCamera3d = (camera: TCamera3d): TComponentDoc => ({
    type: 'camera-3d',
    id: camera.id,
    projection: camera.projection,
    transform: { ...camera.transform },
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    zoom: camera.zoom,
    ...(camera.follow2d === true ? { follow2d: true } : {}),
});

const writeFog = (fog: TFog): TComponentDoc => ({
    type: 'fog',
    id: fog.id,
    color: { ...fog.color },
    near: fog.near,
    far: fog.far,
    ...(fog.distance ? {} : { distance: false }),
    // Written when it is on, or when its heights were set and it was only switched off, so a fog
    // switched off for a moment comes back where it was.
    ...(fog.height.enabled || fog.height.top !== 0 || fog.height.bottom !== -10
        ? { height: { top: fog.height.top, bottom: fog.height.bottom, ...(fog.height.enabled ? {} : { enabled: false }) } }
        : {}),
    ...(fog.enabled ? {} : { enabled: false }),
});

const writeLight = (light: TLight): TComponentDoc => ({
    type: 'light',
    id: light.id,
    kind: light.type,
    color: { ...light.color },
    intensity: light.intensity,
    // Five fields and not nine: a lamp has no scale and no roll, so the rest are structurally
    // fixed and writing them down would be writing four numbers nobody reads.
    ...(light.type !== 'ambient' ? {
        transform: {
            x: light.transform.x,
            y: light.transform.y,
            z: light.transform.z,
            rotationX: light.transform.rotationX,
            rotationY: light.transform.rotationY,
        },
    } : {}),
    ...(light.type !== 'ambient' ? { ambient: light.ambient } : {}),
    ...(light.type === 'point' || light.type === 'spot' || light.type === 'rect' ? { range: light.range } : {}),
    ...(light.type === 'rect' ? { width: light.width, height: light.height } : {}),
    ...(light.type === 'spot' ? { angle: light.angle, penumbra: light.penumbra } : {}),
    // Written for every kind that can carry them, a bulb included: what a light was told is what
    // comes back, and a writer deciding a bulb "cannot mean it" would quietly edit somebody's file.
    // An ambient one is left out because it has nowhere to put them: it is not a light in a place,
    // it is the level everything sits at.
    ...(light.type !== 'ambient' ? {
        ...unless('castShadow', light.castShadow, false),
        ...unless('shadowBias', light.shadowBias, undefined),
        ...unless('shadowStrength', light.shadowStrength, undefined),
    } : {}),
    ...(light.type === 'directional' ? unless('shadowArea', light.shadowArea, undefined) : {}),
    ...(light.type === 'directional' ? unless('shadowDistance', light.shadowDistance, undefined) : {}),
});

/**
 * One drawable, or `null` for one there is nothing to write about.
 *
 * `null` is not a failure: a mesh whose shape has not landed, or an emitter with no file, is a real
 * state a scene can be in, and neither should make a whole level unwritable.
 */
const writeDrawable = (drawable: TDrawable, writing: TWriting): TComponentDoc | null => {
    switch (drawable.type) {
        case 'sprite': return writeSprite(drawable, writing);
        case 'text': return writeText(drawable, writing);
        case 'mesh': return writeMesh(drawable, writing);
        case 'particles':
        case 'particles-3d': return writeParticles(drawable, writing);
        // Handled together, above: a map is one component however many layers it put on the box.
        case 'tilemap': return null;
        case 'nine-slice': return writeNineSlice(drawable, writing);
        // A debug drawing made by a helper in code: it is not part of what the scene is, and a
        // document that kept its corners would keep a picture of one moment of it.
        case 'lines': return null;
        // Its corners are wherever the game's code moved them this frame, and that code makes it again
        // when the scene is opened.
        case 'polygon': return null;
        default: {
            const never: never = drawable;
            return never;
        }
    }
};

const writeBox = (box: TBox, writing: TWriting): TBoxNode => {
    const components: TComponentDoc[] = [];

    // Before even the camera: a camera on an object drawn into a picture is the picture's, and a
    // document read from the top should know that before it meets one.
    if (box.spriteTexture !== null) {
        const picture = box.spriteTexture;
        components.push({
            type: 'sprite-texture',
            id: picture.id,
            key: picture.texture.key,
            width: picture.width,
            height: picture.height,
            background: { ...picture.background },
            ...(picture.sees === '3d' ? { sees: '3d' as const } : {}),
        });
    }

    // The camera and the lamp first, so a document read from the top says how the room is seen and
    // lit before it says what is in it.
    if (box.camera2d !== null) components.push(writeCamera2d(box.camera2d));
    if (box.camera3d !== null) components.push(writeCamera3d(box.camera3d));
    if (box.fog !== null) components.push(writeFog(box.fog));
    for (const light of box.lights) components.push(writeLight(light));

    // The simulation first of all: a scene read from the top says how it falls before it says what
    // is in it.
    if (box.physicsWorld !== null) {
        const { _type, ...rest } = box.physicsWorld;
        components.push({ type: _type, ...rest } as TComponentDoc);
    }
    if (box.particleCollider !== null) {
        const collider = box.particleCollider;
        components.push({
            type: collider.type,
            id: collider.id,
            shape: structuredClone(collider.shape),
            ...unless('enabled', collider.enabled, true),
        } as TComponentDoc);
    }

    const layers = box.drawables.filter((drawable): drawable is TTilemapLayer => drawable.type === 'tilemap');
    if (layers.length > 0) {
        const map = writeTilemap(layers, writing);
        if (map !== null) components.push(map);
    }
    for (const drawable of box.drawables) {
        const component = writeDrawable(drawable, writing);
        if (component !== null) components.push(component);
    }

    // With what the object is made of, and before the behaviours: one that asks the world for this
    // object's body has to find it already there.
    if (box.physics !== null) {
        const { _type, ...rest } = box.physics;
        components.push({ type: _type, ...rest } as TComponentDoc);
    }

    for (const sound of box.sounds) {
        if (sound.type === 'song') {
            const song = writeSong(sound, writing);
            if (song !== null) components.push(song);
            continue;
        }
        // A sound made in code has no file to name, so it is not written down.
        if (sound.type === 'sound' && sound.clip.src === '') continue;
        components.push(sound.type === 'music' ? writeMusic(sound, writing) : writeSound(sound, writing));
    }
    for (const motion of box.motions) {
        // Like a song, a motion written in code has no file to name, so it is not written down.
        if (motion.file.src === '') continue;
        writing.assets.set(motion.file.key, { type: 'motion', key: motion.file.key, src: motion.file.src });
        components.push({
            type: 'motion',
            id: motion.id,
            motion: motion.file.key,
            ...unless('autoplay', motion.autoplay, false),
            ...(motion.loop !== null ? { loop: motion.loop } : {}),
            ...unless('speed', motion.speed, 1),
        });
    }
    if (box.audioListener !== null) {
        components.push({
            type: 'audio-listener',
            id: box.audioListener.id,
            ...unless('enabled', box.audioListener.enabled, true),
        });
    }

    // Before the behaviours too: one that reaches for this object's mask finds it there. What it
    // keeps to is written as it is; a default is left out.
    const mask = box.mask;
    if (mask !== null) {
        components.push({
            type: 'mask',
            id: mask.id,
            ...(mask.rect !== null ? { rect: { ...mask.rect } } : {}),
            ...(mask.by !== null ? { by: mask.by.id } : {}),
            ...(mask.channel === 'luminance' ? { channel: 'luminance' as const } : {}),
            ...unless('soft', mask.soft, false),
            ...unless('invert', mask.invert, false),
            ...unless('showShape', mask.showShape, false),
            ...unless('enabled', mask.enabled, true),
        });
    }

    // Before the behaviours, because that is the order they have to be read back in: a behaviour
    // asking its object for a store has to find the link already there.
    for (const key of box.stores) {
        components.push({ type: 'store', id: `${box.id}:store:${key}`, ref: key });
    }

    // Behaviours last, which is the order they are built in when the scene is opened again and so
    // the order somebody reading the file should meet them in.
    for (const script of box.scripts) {
        // Absent and not empty when the behaviour has nothing to tune, which is the common case:
        // a scene written before behaviours had settings at all still comes back unchanged.
        const hasProps = Object.keys(script.props).length > 0;
        components.push(hasProps
            ? { type: 'script', id: script.id, ref: script.ref, props: { ...script.props } }
            : { type: 'script', id: script.id, ref: script.ref });
    }

    // Whatever was read out of the file and not understood goes back where it was, so a document
    // opened here and written out again is the document that came in.
    const extra = { ...(boxExtra.get(box) ?? {}) };
    const unsupported = extra[UNSUPPORTED_COMPONENTS];
    if (Array.isArray(unsupported)) {
        components.push(...unsupported as TComponentDoc[]);
        delete extra[UNSUPPORTED_COMPONENTS];
    }

    return {
        id: box.id,
        name: box.name,
        ...(box.tags.length > 0 ? { tags: [...box.tags] } : {}),
        transform: writeTransform(box.transform),
        components,
        // A box born after its scene was built is a bullet in flight, not part of the level.
        children: box.children.filter((child) => !child.spawned).map((child) => writeBox(child, writing)),
        // Written only when there is some, and in the order it was asked for, which is what reading
        // it back matches on.
        ...(box.data.length > 0 ? { data: box.data.map((record) => ({ value: record.value })) } : {}),
        ...unless('visible', box.visible, true),
        ...unless('screenSpace', box.screenSpace, false),
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
    };
};

/**
 * What a box was carrying that this version of the format does not understand, kept beside it.
 *
 * Beside rather than on it, for the same reason a layer's corners are: a box is a record, and a
 * record holds what the engine acts on. This is what the *file* said, which is somebody else's
 * business and the engine's only job is not to lose it.
 */
const boxExtra = new WeakMap<TBox, Record<string, unknown>>();

/**
 * Remembers what a document said about a box that this version could not use, so writing the scene
 * back out puts it where it was.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rememberBoxExtra = (box: TBox, extra: Record<string, unknown>): void => {
    boxExtra.set(box, extra);
};

/**
 * Writes a running scene down.
 *
 * **Total and never throws.** Anything it cannot write is left out rather than fatal: a mesh whose
 * shape has not arrived, a map still fetching. A scene is written while somebody is working, and a
 * writer that threw would pick the worst moment to do it.
 *
 * Three rules decide what comes out:
 *
 * - **What is derived is not written.** Where a thing ended up after the tree moved it, the matrices
 *   the card reads, whether a file has arrived: all of it is worked out again on the way back in, so
 *   writing it down would only be a chance for the two to disagree.
 * - **An asset is collapsed to its key**, and the keys gather into one manifest as the walk goes, so
 *   two sprites sharing a sheet name it once.
 * - **A box born after its scene was built is not written.** Saving a level three seconds into
 *   playing it must not write every bullet still in flight into it.
 *
 * @param root What to write down, with everything under it: a scene's root (what
 * `TEditorHandle.loadScene` returns), or any object in it, such as a behaviour's `self`.
 * @returns The document, ready for `JSON.stringify`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeScene = (root: TBox): TSceneDoc => {
    const writing: TWriting = { assets: new Map() };
    const node = writeBox(root, writing);
    return {
        format: SCENE_FORMAT,
        version: SCENE_VERSION,
        // A scene is named by the key it was registered under, which is the name its root was made
        // with. There is nowhere else to read it from.
        name: root.name,
        assets: [...writing.assets.values()],
        root: node,
    };
};

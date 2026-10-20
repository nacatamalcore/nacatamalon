import { createMaterial } from '../../gameobjects/material';
import { createMesh } from '../../gameobjects/mesh/create_mesh';
import { createParticles } from '../../gameobjects/particles/create_particles';
import { createParticles3d } from '../../gameobjects/particles/create_particles_3d';
import { createScene } from '../create_scene';
import { createSprite } from '../../gameobjects/sprite/create_sprite';
import { createText } from '../../gameobjects/text/create_text';
import { isBuiltinFont } from '../../gameobjects/text/default_font';
import { createTilemap } from '../../gameobjects/tilemap/create_tilemap';
import { getActiveBox, getActiveGame } from '../../store';
import { rememberBoxExtra } from './serialize_scene';
import { spawnBox } from '../../box';
import { useAmbientLight, useDirectionalLight, usePointLight, useSpotLight } from '../../hooks/light';
import { useCamera2d } from '../../hooks/camera/use_camera_2d';
import { useData } from '../../hooks/state';
import { useScript } from '../../hooks/script';
import { useAudioListener, useMusic, useSong, useSound } from '../../hooks/audio';
import { useStoreLink } from '../../hooks/store';
import { usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../../hooks/physics';
import { useCamera3d } from '../../hooks/camera/use_camera_3d';
import { useFog } from '../../hooks/fog/use_fog';
import { useSpriteAnimation } from '../../hooks/animation/use_sprite_animation';
import { useParticleCollider2d, useParticleCollider3d } from '../../hooks/particles';
import { newSpriteTexture } from '../../gameobjects/sprite_texture';
import type { TSpriteTexture } from '../../gameobjects/sprite_texture';
import {
    useCircleGeometry, useConeGeometry, useCubeGeometry, useCylinderGeometry,
    useIcoSphereGeometry, usePlaneGeometry, useTorusGeometry, useUvSphereGeometry,
} from '../../hooks/geometry';
import { useLoadAtlas, useLoadAudio, useLoadBitmapFont, useLoadFont, useLoadGltf, useLoadParticles, useLoadShader, useLoadSong, useLoadMotion, useLoadTexture } from '../../hooks/loaders';
import { useMotion } from '../../hooks/motion';
import { useScreenSpace } from '../../hooks/camera/use_screen_space';
import { useTransform } from '../../hooks/transform/use_transform';
import { whenLoaded } from '../../loaders';
import { createRecord } from '../../gameobjects/create_record';
import { nanoId } from '../../utils/nano_id';
import type { TGltfModel } from '../../loaders';
import type { TGeometry } from '../../geometry';
import type { TAssetEntry } from './types/t_asset_entry';
import type { TBox } from '../../box';
import type { TBoxNode, TSceneDoc } from './types/t_scene_doc';
import type { TComponentDoc, TMaterialDoc, TSpriteTextureComponent, TTilemapComponent } from './types/t_component_doc';
import type { TMaterialMap, TMeshMaterial, TSpriteMaterial } from '../../materials';
import type { TRuntimeStore } from '../../store';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TScene } from '../types/t_scene';

/**
 * Asks for everything the manifest names, and nothing else.
 *
 * Walked **before** a single box is built, which is the whole reason the manifest exists. Every
 * loader in this engine registers its slot the moment it is asked and fills it in later, so once
 * this has run, a sprite saying "my texture is `hero`" finds `hero` waiting, possibly still
 * arriving. Without it, the first frame of a scene would be the frame that discovers what it needs.
 */
const loadAssets = (assets: readonly TAssetEntry[], src: string): void => {
    for (const asset of assets) {
        switch (asset.type) {
            case 'texture': useLoadTexture({ src: asset.src, key: asset.key }); break;
            case 'atlas': useLoadAtlas({ src: asset.src, key: asset.key }); break;
            case 'shader': useLoadShader({ src: asset.src, key: asset.key }); break;
            case 'particles': useLoadParticles({ src: asset.src, key: asset.key }); break;
            case 'audio': useLoadAudio({ src: asset.src, key: asset.key }); break;
            case 'song': useLoadSong({ src: asset.src, key: asset.key }); break;
            case 'motion': useLoadMotion({ src: asset.src, key: asset.key }); break;
            case 'bitmapFont': useLoadBitmapFont({ json: asset.json, atlas: asset.atlas, key: asset.key }); break;
            case 'font': useLoadFont({ src: asset.src, key: asset.key, ...(asset.size !== undefined ? { size: asset.size } : {}) }); break;
            // A map is asked for by the thing that shows it, because `createTilemap` is what puts
            // its layers on a box. The entry is here so the manifest still lists the file.
            case 'tilemap': break;
            case 'geometry': loadGeometry(asset, src); break;
            default: {
                const never: never = asset;
                return never;
            }
        }
    }
};

/**
 * Makes a shape again from the recipe that made it the first time.
 *
 * The key is forced to the one the document used, so two meshes naming one shape share it, exactly
 * as they did before the scene was written down.
 */
/**
 * The models a document's shapes are taken from, by the key the document gave each shape, per game.
 *
 * A shape from a model file is not like the others: it only exists once the file is here, and the
 * scene is built before that. So the manifest notes which file and which piece each key means, and a
 * mesh naming one of these keys is built at once and given its piece when the file lands.
 */
const modelShapes = new WeakMap<TRuntimeStore, Map<string, { model: TGltfModel; node: string | undefined }>>();

const modelShapesOf = (store: TRuntimeStore): Map<string, { model: TGltfModel; node: string | undefined }> => {
    let shapes = modelShapes.get(store);
    if (shapes === undefined) {
        shapes = new Map();
        modelShapes.set(store, shapes);
    }
    return shapes;
};

/**
 * A shape that is not here yet: nothing to draw, which the renderer already skips.
 */
const pendingShape = (key: string, source: TGeometry['source']): TGeometry => createRecord('geometry', {
    key,
    status: 'loading' as const,
    source,
    vertexCount: 0,
    indexCount: 0,
    bounds: null,
    positions: null,
    indices: null,
    vertexBuffer: null,
    indexBuffer: null,
    indexType: 'uint16' as const,
    skinBuffer: null,
    colorBuffer: null,
    detailBuffer: null,
});

const loadGeometry = (asset: Extract<TAssetEntry, { type: 'geometry' }>, src: string): void => {
    const { key, source } = asset;
    switch (source.kind) {
        case 'cube': useCubeGeometry({ key, ...source }); break;
        case 'plane': usePlaneGeometry({ key, ...source }); break;
        case 'circle': useCircleGeometry({ key, ...source }); break;
        case 'uvSphere': useUvSphereGeometry({ key, ...source }); break;
        case 'icoSphere': useIcoSphereGeometry({ key, ...source }); break;
        case 'cylinder': useCylinderGeometry({ key, ...source }); break;
        case 'cone': useConeGeometry({ key, ...source }); break;
        case 'torus': useTorusGeometry({ key, ...source }); break;
        case 'gltf': {
            // The whole file, as one call: its parts land in the model cache under keys of their
            // own, and a mesh names the one it wants.
            //
            // By the key the document gave it, which is how a mesh names it: the piece called
            // `node`, or the first piece when there is no `node`. The same rule the old engine had,
            // so a document written by it finds its models.
            const model = useLoadGltf({ src: source.src });
            const store = getActiveGame();
            if (store !== null) modelShapesOf(store).set(key, { model, node: source.node });
            break;
        }
        default: {
            const never: never = source;
            console.warn(`[NacatamalOn] scene "${src}": the shape "${key}" is made a way this version does not know. Anything showing it draws nothing.`);
            return never;
        }
    }
};

/**
 * A material as the engine holds one, from a material as the file wrote one.
 */
const buildMaterial = (doc: TMaterialDoc): TSpriteMaterial => createMaterial({
    ...(doc.name !== null ? { name: doc.name } : {}),
    ...(doc.effect !== null ? { effect: doc.effect } : {}),
    ...(doc.fragment !== null ? { fragment: doc.fragment } : {}),
    ...(doc.fragmentGlsl !== null ? { fragmentGlsl: doc.fragmentGlsl } : {}),
    ...(doc.vertex !== null ? { vertex: doc.vertex } : {}),
    ...(doc.vertexGlsl !== null ? { vertexGlsl: doc.vertexGlsl } : {}),
    ...(doc.uniforms !== null ? { uniforms: doc.uniforms } : {}),
}) as TSpriteMaterial;

/**
 * Anything a scene asked to load, found again by the key the document used.
 */
const found = <T>(cache: Map<string, T>, key: string, what: string, src: string): T | undefined => {
    const asset = cache.get(key);
    if (asset === undefined && key !== '') {
        console.warn(`[NacatamalOn] scene "${src}": nothing in the manifest is called "${key}", so a ${what} that wanted it goes without.`);
    }
    return asset;
};

/**
 * A map, which is one component and as many drawables as the file has layers.
 *
 * `createTilemap` does all of it, so what is left is the handful of things this scene changed about
 * individual layers. They are applied when the file lands, not now: a map comes back empty and fills
 * itself in, so writing into its layers at this moment would be writing into an empty list.
 */
const buildTilemap = (doc: TTilemapComponent): void => {
    const map = createTilemap({
        src: doc.map,
        key: doc.map,
        ...(doc.transform !== undefined ? { transform: doc.transform } : {}),
        ...(doc.tint !== undefined ? { tint: doc.tint } : {}),
        ...(doc.smooth !== undefined ? { smooth: doc.smooth } : {}),
    });

    const changes = doc.layers;
    if (changes === undefined || changes.length === 0) {
        return;
    }
    // `whenLoaded` and not a poll: a loop that re-queues itself as a microtask never yields, and
    // microtasks run to exhaustion before any I/O does, so the very fetch it was waiting on could
    // never complete.
    void whenLoaded(map).then(() => {
        for (const change of changes) {
            const layer = map.layers.find((one) => one.name === change.name);
            if (layer === undefined) {
                continue;
            }
            if (change.tint !== undefined) layer.tint = change.tint;
            if (change.visible !== undefined) layer.visible = change.visible;
            if (change.zIndex !== undefined) layer.zIndex = change.zIndex;
            if (change.material !== undefined) layer.material = buildMaterial(change.material);
            if (change.uniforms !== undefined) layer.uniforms = change.uniforms;
        }
    });
};

/**
 * A mesh whose shape is a piece of a model file, built at once and given its piece when the file lands.
 *
 * **The file decides how it looks**: its picture, its colour, its glow and its bones all come from the
 * piece. From the document only a shader of its own is taken, because a shader exists nowhere in the
 * file and can only have been authored. It is the old engine's rule, kept so a scene it wrote looks
 * the same here.
 *
 * The mesh is on its box from the start, with its identity, so a tool that selected it or a link that
 * names it finds it before the file has arrived. It simply draws nothing until then.
 */
const buildModelMesh = (
    component: Extract<TComponentDoc, { type: 'mesh' }>,
    { model, node }: { model: TGltfModel; node: string | undefined },
    store: TRuntimeStore,
    src: string,
): void => {
    const surface = component.material;
    const mesh = createMesh({
        ...(component.transform !== undefined ? { transform: component.transform } : {}),
        geometry: pendingShape(component.geometry, { kind: 'gltf', src: model.src, ...(node !== undefined ? { node } : {}) }),
        material: createMaterial({
            shader: 'mesh3d',
            ...(surface.effect !== null ? { effect: surface.effect } : {}),
            ...(surface.fragment !== null ? { fragment: surface.fragment } : {}),
            ...(surface.fragmentGlsl !== null ? { fragmentGlsl: surface.fragmentGlsl } : {}),
            ...(surface.vertex !== null ? { vertex: surface.vertex } : {}),
            ...(surface.vertexGlsl !== null ? { vertexGlsl: surface.vertexGlsl } : {}),
            ...(surface.uniforms !== null ? { uniforms: surface.uniforms } : {}),
            ...(surface.wrap !== undefined ? { wrap: surface.wrap } : {}),
            ...(surface.vertexSnap !== undefined ? { vertexSnap: surface.vertexSnap } : {}),
            ...(surface.affine === true ? { affine: true } : {}),
            // The looks as written, which make the colour again: a document keeps the recipe, not the shader.
            ...(surface.lighting !== undefined ? { lighting: surface.lighting } : {}),
            ...(surface.steps !== undefined ? { steps: surface.steps } : {}),
        }) as TMeshMaterial,
        ...(component.visible !== undefined ? { visible: component.visible } : {}),
        ...(component.zIndex !== undefined ? { zIndex: component.zIndex } : {}),
        ...(component.castShadow !== undefined ? { castShadow: component.castShadow } : {}),
    });
    mesh.id = component.id;

    void whenLoaded(model).then(() => {
        if (store.get('loop').destroyed || mesh.destroyed || model.status !== 'ready') {
            return;
        }
        const part = node === undefined ? model.parts[0] : model.parts.find((one) => one.name === node);
        if (part === undefined) {
            const names = model.parts.map((one) => `"${one.name}"`).join(', ');
            console.warn(`[NacatamalOn] scene "${src}": the model "${model.src}" has no piece called "${node ?? ''}", so the mesh that wanted it stays empty. Its pieces are: ${names}.`);
            return;
        }
        mesh.geometry = part.geometry;
        mesh.skeleton = part.skeleton;
        mesh.material.texture = part.texture;
        mesh.material.tint = part.tint;
        mesh.material.emissive = part.emissive;
        // Only ever switched on: a document has no word for it, so a file saying so is the only say.
        if (part.transparent) {
            mesh.material.transparent = true;
        }
        // The file's word unless the scene has one of its own.
        if (surface.wrap === undefined) {
            mesh.material.wrap = part.wrap;
        }
    });
};

/**
 * Builds one component on whatever box is being filled, keeping the identity the document gave it.
 *
 * The identity is put back by hand because the constructors mint a fresh one, which is right for a
 * thing being made and wrong for a thing being restored: an id is the only address anything outside
 * the engine has, so a tool's remembered selection, a link between two boxes and an undo step all
 * break quietly if it changes on every load.
 */
const buildComponent = (component: TComponentDoc, store: TRuntimeStore, src: string): void => {
    const assets = store.get('assets');

    switch (component.type) {
        case 'sprite': {
            const texture = component.texture === null ? undefined : found(assets.textures, component.texture, 'sprite', src);
            const sheet = component.atlas === undefined ? undefined : found(assets.atlases, component.atlas, 'sprite', src);
            const sprite = createSprite({
                // Its own offset within the box, which the box's placement then composes over.
                ...(component.transform !== undefined ? { transform: component.transform } : {}),
                ...(texture !== undefined ? { texture } : {}),
                ...(sheet !== undefined ? { atlas: sheet } : {}),
                ...(component.frame !== undefined ? { frame: component.frame } : {}),
                ...(component.width !== undefined ? { width: component.width } : {}),
                ...(component.height !== undefined ? { height: component.height } : {}),
                tint: component.tint,
                ...(component.anchor !== undefined ? { anchor: component.anchor } : {}),
                ...(component.pivot !== undefined ? { pivot: component.pivot } : {}),
                ...(component.uvOffset !== undefined ? { uvOffset: component.uvOffset } : {}),
                ...(component.uvScale !== undefined ? { uvScale: component.uvScale } : {}),
                ...(component.flipX !== undefined ? { flipX: component.flipX } : {}),
                ...(component.flipY !== undefined ? { flipY: component.flipY } : {}),
                ...(component.smooth !== undefined ? { smooth: component.smooth } : {}),
                ...(component.blend !== undefined ? { blend: component.blend } : {}),
                ...(component.repeat !== undefined ? { repeat: component.repeat } : {}),
                ...(component.repeatOffset !== undefined ? { repeatOffset: { ...component.repeatOffset } } : {}),
                ...(component.parallax !== undefined ? { parallax: { ...component.parallax } } : {}),
                ...(component.visible !== undefined ? { visible: component.visible } : {}),
                ...(component.zIndex !== undefined ? { zIndex: component.zIndex } : {}),
                ...(component.material !== undefined ? { material: buildMaterial(component.material) } : {}),
                ...(component.uniforms !== undefined ? { uniforms: component.uniforms } : {}),
            });
            sprite.id = component.id;
            // A run is the sheet's, so it needs one. It is kept on the record to be written back,
            // and started through the hook a game would use, from the sheet's own runs: that table
            // is filled in when the file lands, and the hook waits for the run it was asked for.
            if (component.animation !== undefined && sheet !== undefined) {
                (sprite as TSprite).animation = { ...component.animation };
                if (component.animation.autoplay !== null) {
                    useSpriteAnimation(sprite as TSprite, { clips: sheet.sequences, play: component.animation.autoplay, speed: component.animation.speed });
                }
            }
            break;
        }
        case 'text': {
            // The engine's own fonts are in no manifest: `createText` finds them by their keys.
            const own = isBuiltinFont(component.font);
            // Either kind of font, by the one key the text names: a scene keeps one manifest.
            const font = own
                ? undefined
                : assets.fonts.get(component.font) ?? found(assets.bitmapFonts, component.font, 'text', src);
            if (font === undefined && !own) {
                break;
            }
            const label = createText({
                ...(component.transform !== undefined ? { transform: component.transform } : {}),
                text: component.text,
                font: own ? component.font : font,
                style: component.style,
                tint: component.tint,
                ...(component.anchor !== undefined ? { anchor: component.anchor } : {}),
                ...(component.pivot !== undefined ? { pivot: component.pivot } : {}),
                ...(component.smooth !== undefined ? { smooth: component.smooth } : {}),
                ...(component.blend !== undefined ? { blend: component.blend } : {}),
                ...(component.parallax !== undefined ? { parallax: { ...component.parallax } } : {}),
                ...(component.visible !== undefined ? { visible: component.visible } : {}),
                ...(component.zIndex !== undefined ? { zIndex: component.zIndex } : {}),
                ...(component.material !== undefined ? { material: buildMaterial(component.material) } : {}),
                ...(component.uniforms !== undefined ? { uniforms: component.uniforms } : {}),
            });
            label.id = component.id;
            break;
        }
        case 'mesh': {
            const fromModel = modelShapesOf(store).get(component.geometry);
            if (fromModel !== undefined) {
                buildModelMesh(component, fromModel, store, src);
                break;
            }
            const geometry = found(assets.geometries, component.geometry, 'model', src);
            if (geometry === undefined) {
                break;
            }
            const surface = component.material;
            const texture = surface.texture === null ? undefined : found(assets.textures, surface.texture, 'model', src);
            // Each map by its picture's key; one whose picture is not there is left out and reads white.
            const maps: Record<string, TMaterialMap> = {};
            for (const [name, map] of Object.entries(surface.maps ?? {})) {
                const picture = found(assets.textures, map.texture, 'model', src);
                if (picture !== undefined) {
                    maps[name] = {
                        texture: picture,
                        ...(map.wrap !== undefined ? { wrap: map.wrap } : {}),
                        ...(map.smooth !== undefined ? { smooth: map.smooth } : {}),
                    };
                }
            }
            const model = createMesh({
                ...(component.transform !== undefined ? { transform: component.transform } : {}),
                geometry,
                material: createMaterial({
                    shader: 'mesh3d',
                    ...(surface.name !== null ? { name: surface.name } : {}),
                    ...(surface.effect !== null ? { effect: surface.effect } : {}),
                    ...(surface.fragment !== null ? { fragment: surface.fragment } : {}),
                    ...(surface.fragmentGlsl !== null ? { fragmentGlsl: surface.fragmentGlsl } : {}),
                    ...(surface.vertex !== null ? { vertex: surface.vertex } : {}),
                    ...(surface.vertexGlsl !== null ? { vertexGlsl: surface.vertexGlsl } : {}),
                    ...(surface.uniforms !== null ? { uniforms: surface.uniforms } : {}),
                    ...(texture !== undefined ? { texture } : {}),
                    tint: surface.tint,
                    emissive: surface.emissive,
                    specular: surface.specular,
                    shininess: surface.shininess,
                    alpha: surface.alpha,
                    ...(surface.smooth !== undefined ? { smooth: surface.smooth } : {}),
                    ...(surface.wrap !== undefined ? { wrap: surface.wrap } : {}),
                    ...(Object.keys(maps).length > 0 ? { maps } : {}),
                    ...(surface.vertexSnap !== undefined ? { vertexSnap: surface.vertexSnap } : {}),
                    ...(surface.affine === true ? { affine: true } : {}),
                    // The looks as written, which make the colour again: a document keeps the recipe, not the shader.
                    ...(surface.lighting !== undefined ? { lighting: surface.lighting } : {}),
                    ...(surface.steps !== undefined ? { steps: surface.steps } : {}),
                }) as TMeshMaterial,
                ...(component.visible !== undefined ? { visible: component.visible } : {}),
                ...(component.zIndex !== undefined ? { zIndex: component.zIndex } : {}),
                ...(component.castShadow !== undefined ? { castShadow: component.castShadow } : {}),
            });
            model.id = component.id;
            break;
        }
        case 'tilemap':
            buildTilemap(component);
            break;
        case 'particles':
        case 'particles3d': {
            const file = found(assets.particles, component.effect, 'effect', src);
            if (file === undefined) {
                break;
            }
            const options = {
                effect: file,
                name: component.name,
                tint: component.tint,
                alpha: component.alpha,
                autoplay: component.autoplay,
                ...(component.seed !== null ? { seed: component.seed } : {}),
                ...(component.overrides !== undefined ? { overrides: component.overrides } : {}),
                ...(component.smooth !== undefined ? { smooth: component.smooth } : {}),
                ...(component.visible !== undefined ? { visible: component.visible } : {}),
                ...(component.zIndex !== undefined ? { zIndex: component.zIndex } : {}),
            };
            const emitter = component.type === 'particles3d'
                ? createParticles3d({ ...(component.transform !== undefined ? { transform: component.transform } : {}), ...options })
                : createParticles({ ...(component.transform !== undefined ? { transform: component.transform } : {}), ...options });
            emitter.id = component.id;
            break;
        }
        case 'camera2d':
            useCamera2d({ transform: component.transform, zoom: component.zoom }).id = component.id;
            break;
        case 'camera3d': {
            const place = component.transform;
            useCamera3d({
                projection: component.projection,
                transform: { x: place.x, y: place.y, z: place.z, rotation: place.rotation, rotationX: place.rotationX, rotationY: place.rotationY },
                fov: component.fov, near: component.near, far: component.far, zoom: component.zoom,
                ...(component.follow2d === true ? { follow2d: true } : {}),
            }).id = component.id;
            break;
        }
        case 'fog':
            useFog({
                color: component.color,
                near: component.near,
                far: component.far,
                distance: component.distance !== false,
                ...(component.height === undefined ? {} : {
                    height: { top: component.height.top, bottom: component.height.bottom, enabled: component.height.enabled !== false },
                }),
                enabled: component.enabled !== false,
            }).id = component.id;
            break;
        case 'light': {
            const shared = { color: component.color, intensity: component.intensity };
            if (component.kind === 'ambient') {
                useAmbientLight(shared).id = component.id;
                break;
            }
            // Everything the document had, put back by hand, because each of these is a decision
            // somebody took and a light that came back without them still lights the scene exactly
            // as before: the only thing missing would be every shadow in the level.
            const shadowing = {
                ...(component.castShadow !== undefined ? { castShadow: component.castShadow } : {}),
                ...(component.shadowBias !== undefined ? { shadowBias: component.shadowBias } : {}),
                ...(component.shadowStrength !== undefined ? { shadowStrength: component.shadowStrength } : {}),
            };
            const aimed = { ...shared, ...shadowing, ambient: component.ambient ?? 0, ...(component.transform !== undefined ? { transform: component.transform } : {}) };
            const lamp = component.kind === 'point' ? usePointLight({ ...aimed, range: component.range ?? 10 })
                : component.kind === 'spot' ? useSpotLight({ ...aimed, range: component.range ?? 10, angle: component.angle ?? Math.PI / 6, penumbra: component.penumbra ?? 0.1 })
                : useDirectionalLight({
                    ...aimed,
                    ...(component.shadowArea !== undefined ? { shadowArea: component.shadowArea } : {}),
                    ...(component.shadowDistance !== undefined ? { shadowDistance: component.shadowDistance } : {}),
                });
            lamp.id = component.id;
            break;
        }
        case 'physics2d': {
            const { type, ...rest } = component;
            usePhysicsBody2d(rest);
            break;
        }
        case 'physics3d': {
            const { type, ...rest } = component;
            usePhysicsBody3d(rest);
            break;
        }
        case 'particle-collider-2d':
            useParticleCollider2d({ shape: component.shape, ...(component.enabled !== undefined ? { enabled: component.enabled } : {}) }).id = component.id;
            break;
        case 'particle-collider-3d':
            useParticleCollider3d({ shape: component.shape, ...(component.enabled !== undefined ? { enabled: component.enabled } : {}) }).id = component.id;
            break;
        case 'sprite-texture':
            // Put on the box by `buildBox`, ahead of everything else on it.
            break;
        case 'physics-world-2d': {
            usePhysicsWorld2d({ id: component.id, gravity: component.gravity });
            break;
        }
        case 'physics-world-3d': {
            usePhysicsWorld3d({ id: component.id, gravity: component.gravity });
            break;
        }
        case 'store': {
            useStoreLink(component.ref);
            break;
        }
        case 'sound': {
            const clip = found(assets.sounds, component.audio, 'sound', src);
            if (clip === undefined) {
                break;
            }
            useSound(clip, {
                id: component.id,
                ...(component.volume !== undefined ? { volume: component.volume } : {}),
                ...(component.loop !== undefined ? { loop: component.loop } : {}),
                ...(component.loopStart !== undefined ? { loopStart: component.loopStart } : {}),
                ...(component.loopEnd !== undefined ? { loopEnd: component.loopEnd } : {}),
                ...(component.rate !== undefined ? { rate: component.rate } : {}),
                ...(component.channel !== undefined ? { channel: component.channel } : {}),
                ...(component.autoplay !== undefined ? { autoplay: component.autoplay } : {}),
                ...(component.spatial !== undefined ? { spatial: component.spatial } : {}),
                ...(component.refDistance !== undefined ? { refDistance: component.refDistance } : {}),
                ...(component.maxDistance !== undefined ? { maxDistance: component.maxDistance } : {}),
                ...(component.cone !== undefined ? { cone: { ...component.cone } } : {}),
                ...(component.zone !== undefined ? { zone: structuredClone(component.zone) } : {}),
                ...(component.duck !== undefined ? { duck: { ...component.duck } } : {}),
            });
            break;
        }
        case 'music': {
            // A layer whose file is missing is said and left out; the rest still play in time.
            const layers: Record<string, { clip: NonNullable<ReturnType<typeof assets.sounds.get>>; volume?: number }> = {};
            for (const layer of component.layers) {
                const clip = found(assets.sounds, layer.audio, 'music', src);
                if (clip !== undefined) {
                    layers[layer.name] = { clip, ...(layer.volume !== undefined ? { volume: layer.volume } : {}) };
                }
            }
            if (Object.keys(layers).length === 0) {
                break;
            }
            useMusic({
                id: component.id,
                layers,
                ...(component.volume !== undefined ? { volume: component.volume } : {}),
                ...(component.channel !== undefined ? { channel: component.channel } : {}),
                ...(component.autoplay !== undefined ? { autoplay: component.autoplay } : {}),
                ...(component.loopStart !== undefined ? { loopStart: component.loopStart } : {}),
                ...(component.loopEnd !== undefined ? { loopEnd: component.loopEnd } : {}),
                ...(component.bpm !== undefined ? { bpm: component.bpm } : {}),
                ...(component.beatsPerBar !== undefined ? { beatsPerBar: component.beatsPerBar } : {}),
                ...(component.firstBeat !== undefined ? { firstBeat: component.firstBeat } : {}),
            });
            break;
        }
        case 'song': {
            const file = found(assets.songs, component.song, 'song', src);
            if (file === undefined) {
                break;
            }
            useSong(file, {
                id: component.id,
                ...(component.volume !== undefined ? { volume: component.volume } : {}),
                ...(component.channel !== undefined ? { channel: component.channel } : {}),
                ...(component.autoplay !== undefined ? { autoplay: component.autoplay } : {}),
                ...(component.voices !== undefined ? { voices: { ...component.voices } } : {}),
                ...(component.tempo !== undefined ? { tempo: component.tempo } : {}),
                ...(component.transpose !== undefined ? { transpose: component.transpose } : {}),
            });
            break;
        }
        case 'motion': {
            const file = found(assets.motions, component.motion, 'motion', src);
            if (file === undefined) {
                break;
            }
            useMotion(file, {
                id: component.id,
                ...(component.autoplay !== undefined ? { autoplay: component.autoplay } : {}),
                ...(component.loop !== undefined ? { loop: component.loop } : {}),
                ...(component.speed !== undefined ? { speed: component.speed } : {}),
            });
            break;
        }
        case 'audio-listener':
            useAudioListener(component.enabled !== undefined ? { enabled: component.enabled } : {}).id = component.id;
            break;
        case 'script': {
            useScript(component.ref, component.props, { id: component.id });
            break;
        }
        default: {
            const never: never = component;
            return never;
        }
    }
};

/**
 * The pictures a document asks for, made before any box so a model finds the one it shows.
 */
const madePictures = new WeakMap<TSpriteTextureComponent, TSpriteTexture>();

/**
 * Makes every picture in the document and lists it in the game's textures, before a single box is
 * built. A model earlier in the file than the screen it shows would otherwise ask for a name that
 * does not exist yet, and go without.
 */
const makePictures = (node: TBoxNode, store: TRuntimeStore): void => {
    for (const component of node.components) {
        if (component.type === 'sprite-texture') {
            madePictures.set(component, newSpriteTexture(store, {
                key: component.key,
                width: component.width,
                height: component.height,
                background: component.background,
                ...(component.sees !== undefined ? { sees: component.sees } : {}),
            }, component.id));
        }
    }
    for (const child of node.children) {
        makePictures(child, store);
    }
};

/**
 * Fills the box that is currently being built from one node, and goes down.
 *
 * Its own identity first, then its place, then what it is, then its children. The order matters for
 * one of them: the placement has to exist before anything is created on the box, because a drawable
 * made on a box with no place would be put at the origin and stay there.
 */
/**
 * The node of the document each box was built from, and where that document came from: what
 * `copyBox` makes another of. Weak, so a box that goes away takes its entry with it.
 */
const builtFrom = new WeakMap<TBox, { node: TBoxNode; src: string }>();

const buildBox = (node: TBoxNode, store: TRuntimeStore, src: string): void => {
    const box = getActiveBox();
    if (box === null) {
        return;
    }
    builtFrom.set(box, { node, src });

    // Kept, so a tool that remembers a selection or a link still finds what it remembered.
    box.id = node.id;
    box.name = node.name;
    if (node.tags !== undefined) box.tags = [...node.tags];
    if (node.visible === false) box.visible = false;
    if (node.screenSpace === true) useScreenSpace();
    if (node.transform !== null) useTransform(node.transform);
    if (node.extra !== undefined) rememberBoxExtra(box, node.extra);

    // Before any component, a camera above all: a camera on a box drawn into a picture belongs to the
    // picture, and it can only tell once the picture is there.
    for (const component of node.components) {
        if (component.type === 'sprite-texture') {
            box.spriteTexture = madePictures.get(component) ?? null;
        }
    }

    // Before the components, so the box carries the state it was saved with by the time anything
    // on it exists. Asked for in file order, because that order is what identifies each one.
    for (const entry of node.data ?? []) {
        useData(entry.value);
    }

    // Behaviours are held back to the end of the box, whatever order the file lists them in: an
    // object has to **be** itself before anything can behave like it. A behaviour reaches for what
    // the object carries, its sprite or its placement, and in plain file order it could just as
    // easily run first and find an empty object, which would make correctness an invisible property
    // of the order somebody happened to add things in.
    //
    // Among themselves the file's order is kept, because that is the order they run in.
    for (const component of node.components) {
        if (component.type !== 'script') buildComponent(component, store, src);
    }
    for (const component of node.components) {
        if (component.type === 'script') buildComponent(component, store, src);
    }
    for (const child of node.children) {
        spawnBox(store, box, child.name, () => buildBox(child, store, src), []);
    }
};

/**
 * What `sceneFromDoc` can be told besides the document.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneFromDocOptions = {
    /**
     * Whether the objects' behaviours **run**, or are only recorded as attached.
     *
     * `'run'` is the default and is what a game is. `'attach'` is for showing a scene rather than
     * playing it: each object still carries its behaviours and still saves them, and none of them
     * is called, so nothing walks away from where it was put. A behaviour that asked to be seen
     * while building runs in both.
     */
    scripts?: 'run' | 'attach';
};

/**
 * Turns a scene document into an ordinary scene function.
 *
 * **That is the whole design, and it is what keeps this to one code path.** A scene from a file is
 * handed to `createGame` like any other, and from then on `change`, a transition, a pause and a
 * destroy all work on it without knowing where it came from. The body it
 * returns calls the same `createSprite`, `createText` and `createMesh` a person would have written,
 * so **the format cannot express anything the engine's own API cannot build**. A second path that
 * assembled records by hand would be a second path free to drift from the first.
 *
 * Nothing is thrown. A missing asset costs you that asset and not the scene, because a level that
 * refused to open over one broken path is a level nobody can fix.
 *
 * @example
 * ```ts
 * const response = await fetch('/scenes/level1.scene.json');
 * const doc = parseSceneDoc(await response.json(), '/scenes/level1.scene.json');
 *
 * createGame('#app', { width: 320, height: 240 })({ Level1: sceneFromDoc(doc) });
 * ```
 *
 * @param doc The document, as `parseSceneDoc` gave it back.
 * @param src Where it came from, named in any warning it causes later.
 * @param options How its behaviours are treated: see {@link TSceneFromDocOptions}.
 * @returns A scene function, to give to `createGame` or to change to by name.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sceneFromDoc = (doc: TSceneDoc, src = doc.name, options: TSceneFromDocOptions = {}): (() => TScene) => () => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error('[NacatamalOn] sceneFromDoc: the body it returns is a scene body, and only the engine may run it.');
    }

    // Put back in a `finally` and never handed out, so it cannot be left turned on: the two ends
    // are both here, and building a scene is one unbroken run with nothing awaited in the middle.
    const before = store.get('world').buildScripts;
    store.setState('world', { buildScripts: options.scripts ?? 'run' });
    try {
        // Everything the scene needs fetched, before anything that will want it exists.
        loadAssets(doc.assets, src);
        makePictures(doc.root, store);
        buildBox(doc.root, store, src);
    } finally {
        store.setState('world', { buildScripts: before });
    }

    return createScene();
};

/** A node put somewhere other than its document says, on the axes given. */
const placeNode = (node: TBoxNode, place: { x?: number; y?: number; z?: number }): void => {
    if (place.x === undefined && place.y === undefined && place.z === undefined) return;
    node.transform = {
        x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
        ...node.transform,
        ...(place.x !== undefined ? { x: place.x } : {}),
        ...(place.y !== undefined ? { y: place.y } : {}),
        ...(place.z !== undefined ? { z: place.z } : {}),
    };
};

/**
 * A node and everything under it, with ids of their own: a copy must not answer to the ids of the
 * box it was copied from, or a tool remembering one would find two.
 */
const withNewIds = (node: TBoxNode): TBoxNode => {
    const copy = structuredClone(node);
    const renew = (box: TBoxNode): void => {
        box.id = nanoId();
        box.children.forEach(renew);
    };
    renew(copy);
    return copy;
};

/**
 * Builds the box a document describes, while the game runs: a reusable box (a `.box` file, whose
 * document holds the one box) made again and again, a coin a level drops, an enemy a door lets out.
 * Give it to `useSpawn`, which says where it goes and builds it at the moment it is called.
 *
 * Built exactly as a scene builds its boxes: its pictures and sounds loaded, its components and its
 * children made, and its behaviours running. Each copy gets ids of its own, and `place` puts it
 * somewhere other than where the document says.
 *
 * @example
 * ```ts
 * registerScript('coin-shower', () => {
 *     const spawn = useSpawn(boxFromDoc, { parent: 'scene' });
 *     const timer = useTimer();
 *     void fetch('boxes/Coin.box').then(async (response) => {
 *         const coin = parseSceneDoc(await response.json(), 'boxes/Coin.box');
 *         timer.every(1, () => spawn(coin, { x: Math.random() * 320, y: 0 }));
 *     });
 * });
 * ```
 *
 * @param doc The document, as `parseSceneDoc` gave it back: of a reusable box (its root holding
 * the one box), or any whose root is the box to make.
 * @param place Where it goes instead (`x`, `y`, `z`), each one left out staying as the document says.
 * @param src Where the document came from, named in any warning it causes.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const boxFromDoc = (doc: TSceneDoc, place: { x?: number; y?: number; z?: number } = {}, src = doc.name): void => {
    const store = getActiveGame();
    if (store === null || getActiveBox() === null) {
        throw new Error('[NacatamalOn] boxFromDoc: hand it to useSpawn, which builds what it describes: useSpawn(boxFromDoc)(doc).');
    }
    // A reusable box's document holds the box as the only thing in its root.
    const node = withNewIds(doc.root.children.length === 1 ? doc.root.children[0]! : doc.root);
    placeNode(node, place);
    loadAssets(doc.assets, src);
    makePictures(node, store);
    buildBox(node, store, src);
};

/**
 * Builds another of a box of the scene while the game runs, as the document described it: the same
 * components, children and behaviours, with ids of its own, where `place` says (or where the
 * document put the first). Give it to `useSpawn`, as `boxFromDoc`: `useSpawn(copyBox)(enemy)`. What
 * the first has done since (moved, been hit) is not copied: the copy starts as it was written.
 *
 * Only a box a scene document built can be copied this way; a box made in code is made again by
 * calling what made it.
 *
 * @example
 * ```ts
 * registerScript('door', (self) => {
 *     const spawn = useSpawn(copyBox, { parent: 'scene' });
 *     const enemy = findObject(self.parent!, 'Enemy');
 *     useTimer().every(3, () => { if (enemy !== null) spawn(enemy, { x: self.transform!.x }); });
 * });
 * ```
 *
 * @param box The box to make another of.
 * @param place Where it goes instead (`x`, `y`, `z`), each one left out staying as the document says.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const copyBox = (box: TBox, place: { x?: number; y?: number; z?: number } = {}): void => {
    const from = builtFrom.get(box);
    if (from === undefined) {
        throw new Error(`[NacatamalOn] copyBox: '${box.name}' was not built from a scene document, so there is nothing to make another of. Call again what made it.`);
    }
    const store = getActiveGame();
    if (store === null || getActiveBox() === null) {
        throw new Error('[NacatamalOn] copyBox: hand it to useSpawn, which builds the copy: useSpawn(copyBox)(box).');
    }
    const node = withNewIds(from.node);
    placeNode(node, place);
    makePictures(node, store);
    buildBox(node, store, from.src);
};

export type { TBox };

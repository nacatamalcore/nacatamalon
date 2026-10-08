import type { TScriptProps } from '../../../scripts';
import type { TColor } from '../../../color';
import type { TTransform2d } from '../../../gameobjects/types/t_transform_2d';
import type { TPhysicsBody2d, TPhysicsBody3d, TPhysicsWorld2d, TPhysicsWorld3d } from '../../../physics';
import type { TTransform3d } from '../../../gameobjects/types/t_transform_3d';
import type { TTextStyle } from '../../../gameobjects/text/types/t_text_style';
import type { TUniformValues } from '../../../materials/types/t_uniforms';
import type { TTextureWrap } from '../../../materials/types/t_material';
import type { TParticleOverrides } from '../../../gameobjects/particles/types/t_particles';
import type { TParticleColliderShape2d, TParticleColliderShape3d } from '../../../gameobjects/particles/colliders/t_particle_collider';
import type { TSoundCone, TSoundZone } from '../../../audio';

/**
 * What a material is, written down.
 *
 * Two ways in, and the first is the one to use: **`effect` names a `.wgsl` file**, and the hooks
 * below are left empty. The source itself is only written when there is no file to name, which
 * happens for a material built in code with its shader typed at the call site.
 *
 * That preference is the same one a script gets: the file is the truth, and a copy of its contents
 * living in a scene is a copy that goes stale the moment somebody edits the file. A document that
 * carried compiled shader source would be as wrong as one carrying a compiled script.
 *
 * There is no signature here. Which kind each knob is, is worked out from the values themselves on
 * the way back in, so writing it down would be saying the same thing twice, and two statements of
 * one fact are two statements that can disagree.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialDoc = {
    name: string | null;
    /**
     * The `.wgsl` it came from, by asset key. When this is set, the four hooks below are `null`.
     */
    effect: string | null;
    fragment: string | null;
    fragmentGlsl: string | null;
    vertex: string | null;
    vertexGlsl: string | null;
    /**
     * What its knobs are set to. `null` when it has none.
     */
    uniforms: TUniformValues | null;
};

/**
 * One extra map of a model's material, as a document writes it: the picture by asset key, and how
 * it is read when that differs from the defaults.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialMapDoc = {
    texture: string;
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
    smooth?: boolean;
};

/**
 * A model's material, which is a material **plus a surface**: what the light finds when it gets
 * there.
 *
 * A sprite's has none of this, and that asymmetry is deliberate rather than an omission. In the
 * plane, the colour, the sheet and how it is read belong to the object: two sprites of one character
 * tinted differently are two sprites, not two materials. In three dimensions they belong to the
 * surface, because that is what a light is asking about.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshMaterialDoc = TMaterialDoc & {
    /**
     * The sheet, by asset key.
     */
    texture: string | null;
    tint: TColor;
    emissive: TColor;
    specular: TColor;
    shininess: number;
    alpha: number;
    smooth?: boolean;
    /**
     * What the picture does past its edge, one word for both ways or one each. Left out when it
     * repeats, which is the default; a model from a file does what the file says unless this does.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
    /**
     * Extra pictures its shader reads by name, each by asset key. Left out when there are none.
     */
    maps?: Record<string, TMaterialMapDoc>;
    /**
     * Corners on a coarse grid of the screen: `true` for the game's own rows, or how many rows. Left
     * out when off, which is the default.
     */
    vertexSnap?: boolean | number;
    /**
     * The picture stretched across the screen without correcting for depth. Left out when off, which
     * is the default.
     */
    affine?: boolean;
};

/**
 * One thing a box **is**: its picture, its shape, its camera, its lamp.
 *
 * Three rules hold across every member here, and each one is a format migration avoided:
 *
 * - **A drawable carries no placement.** Where a picture is belongs to its box, so a sprite and the
 *   shadow under it move together by saying it once. A camera and a lamp are the exception and for
 *   one reason: composition deliberately does not reach them. Nothing moves a camera, because it is
 *   what everything else is measured against; and a lamp is moved but never turned, so that a
 *   lantern held by someone who spins does not sweep the room. What the tree cannot decide, the
 *   component has to carry.
 * - **A file is named, never inlined.** Shader source, atlas tables, map cells and effect numbers
 *   all stay in their own file and appear here as an asset key.
 * - **A field left out is a field at its default.** There is no second convention: `visible` absent
 *   means visible and `flipX` absent means not flipped, because those are what they start at.
 *
 * The list is uniform even though the runtime keeps typed slots for a camera and a light. A second
 * light on one box is not an error anywhere in the engine (the last one wins, quietly), and a format
 * that could not write that would be a format that cannot describe what the engine allows.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TComponentDoc =
    | TSpriteComponent
    | TTextComponent
    | TMeshComponent
    | TTilemapComponent
    | TParticlesComponent
    | TParticles3dComponent
    | TCamera2dComponent
    | TCamera3dComponent
    | TFogComponent
    | TLightComponent
    | TScriptComponent
    | TSoundComponent
    | TMusicComponent
    | TAudioListenerComponent
    | TStoreComponent
    | TPhysicsBody2dComponent
    | TPhysicsBody3dComponent
    | TPhysicsWorld2dComponent
    | TPhysicsWorld3dComponent
    | TParticleCollider2dComponent
    | TParticleCollider3dComponent
    | TSpriteTextureComponent;

/**
 * A flat picture.
 *
 * `width` and `height` may be left out, and leaving them out is not the same as writing the numbers
 * the texture happens to have: it means **take the texture's size**, decided when the texture lands.
 * Writing today's numbers down would freeze a sprite at the size of the art it had when it was saved.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteComponent = {
    type: 'sprite';
    id: string;
    /**
     * Where it sits **on its box**, left out when that is the box's own corner.
     *
     * A box places the whole object and a drawable places itself inside it, and both are real: a
     * box can carry a picture and the shadow under it, each at its own offset. It is also what
     * `createSprite({ transform })` writes into, which is how nearly every scene in this engine is
     * written, so without this field a room saved from a running game comes back with everything
     * piled at the origin, having failed at nothing.
     */
    transform?: TTransform2d;
    /**
     * The sheet, by asset key.
     */
    texture: string | null;
    /**
     * A sheet cut into a grid, by asset key, and which cell of it to show.
     */
    atlas?: string;
    frame?: number;
    /**
     * The run of `atlas` it plays from the start, if any. Needs `atlas`: the runs are the sheet's.
     */
    animation?: TSpriteAnimationDoc;
    width?: number;
    height?: number;
    tint: TColor;
    anchor?: { x: number; y: number };
    /**
     * Which part of the sheet to show, when it is not cut by an atlas.
     */
    uvOffset?: { x: number; y: number };
    uvScale?: { x: number; y: number };
    flipX?: boolean;
    flipY?: boolean;
    smooth?: boolean;
    visible?: boolean;
    zIndex?: number;
    material?: TMaterialDoc;
    /**
     * This sprite's own values for that material's knobs, laid over the material's own.
     */
    uniforms?: TUniformValues;
};

/**
 * A sprite's animation as a document keeps it: which run of its sheet it starts on and how fast.
 * The runs themselves are in the `.atlas` file and are never copied here.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteAnimationDoc = {
    /**
     * The run to start on, or `null` to rest on the sprite's `frame`.
     */
    autoplay: string | null;
    /**
     * How fast, where `1` is the run's own `fps`.
     */
    speed: number;
};

/**
 * Words drawn with a bitmap font.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextComponent = {
    type: 'text';
    id: string;
    /**
     * Where it sits on its box, left out when that is the box's own corner.
     */
    transform?: TTransform2d;
    text: string;
    /**
     * The font, by asset key.
     */
    font: string;
    style: TTextStyle;
    tint: TColor;
    anchor?: { x: number; y: number };
    smooth?: boolean;
    visible?: boolean;
    zIndex?: number;
    material?: TMaterialDoc;
    uniforms?: TUniformValues;
};

/**
 * A shape in three dimensions.
 *
 * There is no skeleton here. A rig belongs to the model file it was read out of, and it is adopted
 * from there when the file lands: writing it into a scene would be writing down a copy of something
 * the artist owns, in a place they will never look for it.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshComponent = {
    type: 'mesh';
    id: string;
    /**
     * Where it sits on its box, in three dimensions, left out when that is the box's own origin.
     */
    transform?: TTransform3d;
    /**
     * The shape, by asset key.
     */
    geometry: string;
    material: TMeshMaterialDoc;
    uniforms?: TUniformValues;
    visible?: boolean;
    zIndex?: number;
    /**
     * Whether it is drawn into the shadow map. Left out casts, which is what nearly everything
     * should do; `false` is the floor, a decal, a blob shadow's own disc.
     *
     * Only `false` is ever written, by the rule this whole format keeps: a field that is absent is
     * its default, so writing `true` would record a decision nobody took.
     */
    castShadow?: boolean;
};

/**
 * A map.
 *
 * **One of these per map, not per layer**, and that is what the engine can actually be asked for:
 * `createTilemap` reads the file and puts *every* layer of it on the box in one go. A document with
 * one entry per layer would describe something no call can make.
 *
 * The cells are not here either: they live in the `.tilemap`, which is the file a person edits and a
 * map editor writes. What a scene decides is where the map sits, how it is tinted, how its sheet is
 * read, and then whatever it changed about individual layers.
 *
 * `transform` is the map's own and is here rather than on the box, for a reason worth knowing: a map
 * is **cached and shared**, so its placement is shared too, and two scenes showing one level are
 * looking at the same object. Writing it as the box's placement would say each scene had its own.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapComponent = {
    type: 'tilemap';
    id: string;
    /**
     * The map, by asset key.
     */
    map: string;
    /**
     * Where the map's top-left corner sits. Shared by its layers: they sort apart, not move apart.
     */
    transform?: TTransform2d;
    /**
     * Multiplies the colour of every layer.
     */
    tint?: TColor;
    smooth?: boolean;
    /**
     * What this scene changed about individual layers, by the name the file gave them.
     *
     * Absent, and absent for a layer, means the layer is exactly as the file has it. So a map
     * dropped into a scene and left alone is four fields, not one entry per layer of description
     * repeating what the file already says.
     */
    layers?: TTilemapLayerOverride[];
};

/**
 * What one scene changed about one layer of a map. Everything optional, because everything left out
 * is the file's own answer.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapLayerOverride = {
    /**
     * Which layer, by the name the file gave it.
     */
    name: string;
    tint?: TColor;
    visible?: boolean;
    zIndex?: number;
    material?: TMaterialDoc;
    uniforms?: TUniformValues;
};

/**
 * An emitter.
 *
 * Nothing about **how the effect behaves** is here: the rate, the lifetimes, the curves and the
 * shape of the emission are all in the `.particles` file, which is what makes three torches one
 * document and one picture. What a scene decides is where it is, what colour it is laid in, whether
 * it starts lit, and how this one differs in size or speed from the file's own.
 *
 * `emitting` and `paused` are deliberately absent. They are what the effect is doing right now, and
 * a document records what was authored: `autoplay` is the authored intent, and a scene saved while
 * an explosion happened to be mid-burst must not come back permanently mid-burst.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesComponent = {
    type: 'particles';
    id: string;
    /**
     * Where the emitter sits on its box, left out when that is the box's own corner.
     */
    transform?: TTransform2d;
    name: string;
    /**
     * The effect, by asset key.
     */
    effect: string;
    tint: TColor;
    alpha: number;
    /**
     * Whether it starts lit. The authored intent, never what it is doing at the moment of saving.
     */
    autoplay: boolean;
    /**
     * Fixed, so the same cloud comes back every time. `null` takes it from the clock.
     */
    seed: number | null;
    overrides?: TParticleOverrides;
    smooth?: boolean;
    visible?: boolean;
    zIndex?: number;
};

/**
 * An emitter in three dimensions: the flat one's fields, placed in space.
 *
 * Its own type rather than a flag on the flat one, for the reason the two physics bodies are apart:
 * the file it names is a different kind of thing, and a component that could name either would make
 * pointing it at the wrong one impossible to report.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticles3dComponent = Omit<TParticlesComponent, 'type' | 'transform'> & {
    type: 'particles3d';
    /**
     * Where the emitter sits on its box, in three dimensions, left out when that is the box's own origin.
     */
    transform?: TTransform3d;
};

/**
 * The camera the flat half of a scene is seen through.
 *
 * **This one carries its own placement, and it is the exception to the rule above.** A camera is
 * what everything else is measured against, so nothing above it in the tree moves it; putting its
 * position on its box would claim otherwise, and the claim would come true the moment somebody gave
 * that box a parent with a transform of its own.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCamera2dComponent = {
    type: 'camera2d';
    id: string;
    transform: { x: number; y: number; rotation: number };
    zoom: number;
};

/**
 * The camera the three-dimensional half is seen through. Carries its own placement, for the reason
 * given on its flat twin.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCamera3dComponent = {
    type: 'camera3d';
    id: string;
    projection: 'perspective' | 'orthographic';
    transform: TTransform3d;
    fov: number;
    near: number;
    far: number;
    zoom: number;
};

/**
 * The fog a scene is seen through. It belongs to the view the way the camera does, so it is written
 * on the box the camera is: the scene's root, or a box drawn into a picture.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFogComponent = {
    type: 'fog';
    id: string;
    color: TColor;
    near: number;
    far: number;
    /**
     * Left out when on, which is the default.
     */
    enabled?: boolean;
};

/**
 * A lamp.
 *
 * **Its own placement, and five fields of it rather than nine.** A lamp is moved by the tree and
 * never turned by it, so where it ends up is its own place composed with its box's, while which way
 * it faces stays exactly what is written here. A lamp has no scale and no roll, so writing those
 * would be writing down three numbers that are structurally always one and one that is always zero.
 *
 * An ambient light is the whole room at once: no place, no direction, no reach.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLightComponent = {
    type: 'light';
    id: string;
    kind: 'directional' | 'point' | 'spot' | 'ambient';
    color: TColor;
    intensity: number;
    /**
     * Where it is and which way it shines. Not on an ambient one, which is everywhere at once.
     */
    transform?: { x: number; y: number; z: number; rotationX: number; rotationY: number };
    /**
     * How much of this light reaches a surface facing away from it. Not on an ambient one.
     */
    ambient?: number;
    /**
     * How far it reaches. Point and spot only.
     */
    range?: number;
    /**
     * How wide the cone is, and how soft its edge. Spot only.
     */
    angle?: number;
    penumbra?: number;
    /**
     * Whether the scene's shadows are drawn from this one. Left out is no.
     *
     * Written down because it is a decision somebody took, and because it is the kind of decision
     * that disappears quietly: a light that came back without it still lights the scene exactly as
     * before, and the only thing missing is every shadow in the level.
     */
    castShadow?: boolean;
    /**
     * How far the shadow test is pushed off the surface, against a surface striping itself.
     */
    shadowBias?: number;
    /**
     * How dark what the light cannot see goes, `0` to `1`.
     */
    shadowStrength?: number;
    /**
     * How far the shadows reach in front of the camera. Directional only.
     */
    shadowArea?: number;
    /**
     * How far back the light stands to look at that square. Directional only.
     */
    shadowDistance?: number;
};

/**
 * A behaviour this object carries: which one, and what it was set to.
 *
 * It holds a **name and not code**, for the same reason a sprite holds the name of its picture: a
 * file cannot carry a function, and the behaviour lives in the project's own source where somebody
 * can read and change it. What is written down is the link.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScriptComponent = {
    type: 'script';
    id: string;
    /**
     * The behaviour's name, as `registerScript` was given it.
     */
    ref: string;
    /**
     * What this attachment was set to, which is what turns a fixed behaviour into a configurable
     * one: two objects can carry the same `patrol` at different speeds.
     *
     * **Absent when the behaviour declares no settings**, rather than an empty object. A behaviour
     * with nothing to tune is the common case and its entry should stay as narrow as it ever was.
     *
     * Only the values are written. Which keys exist is the behaviour's to say, and it says so in
     * code, so a setting it gains later is filled from its own default rather than from here.
     */
    props?: TScriptProps;
};

/**
 * A sound this object carries.
 *
 * Unlike everything else on the list there is nothing to look at, and that is exactly why it has
 * to be written down: a torch that crackles and a level with music are things the objects **are**,
 * and a format that could only describe what is drawn would leave half of a game unauthorable.
 *
 * **What is written is how it was asked to play, never what it is playing.** A scene saved while
 * the music was halfway through opens ready to start it, because where a voice had got to is a
 * fact about one run and a level is not. The knobs go the other way: a volume an options screen
 * turned down is written down turned down, the same as a sprite is written with the tint it has
 * rather than the one it was made with.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundComponent = {
    type: 'sound';
    id: string;
    /**
     * The clip, by asset key.
     */
    audio: string;
    volume?: number;
    loop?: boolean;
    /**
     * How fast it plays, which also changes the pitch.
     */
    rate?: number;
    /**
     * Which volume group it belongs to, so an options screen can move all the music at once
     * without knowing what is in the level.
     *
     * Core's format has no such field and it should: which group a sound belongs to is a decision
     * somebody took while authoring, not a detail of playing it back.
     */
    channel?: string;
    /**
     * Starts as soon as the file is there, with nothing having to ask.
     */
    autoplay?: boolean;
    /**
     * Comes from a side and fades with distance, following the object it hangs off.
     */
    spatial?: boolean;
    /**
     * How far it is heard at full volume. Placed sounds only. In the scene's measure (pixels, or
     * units under a perspective camera), and absent to take that measure's own default.
     */
    refDistance?: number;
    /**
     * Past this distance it is not heard. Placed sounds only, and absent for the default.
     */
    maxDistance?: number;
    /**
     * Louder ahead of the object than behind it. Placed sounds only.
     */
    cone?: TSoundCone;
    /**
     * Fills an area around the object instead of coming from a point. Wins over `spatial`.
     */
    zone?: TSoundZone;
};

/**
 * A piece of music in layers this object carries: the same tune in several files, played together,
 * each at its own volume.
 *
 * Written like a sound: the files by asset key and how loud each layer is meant to be, never how far
 * into the tune it was.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMusicComponent = {
    type: 'music';
    id: string;
    /**
     * In the order they were given. A layer's name is what the game moves it by.
     */
    layers: Array<{ name: string; audio: string; volume?: number }>;
    volume?: number;
    /**
     * Absent for `'music'`.
     */
    channel?: string;
    autoplay?: boolean;
};

/**
 * The game's ears, on this object rather than on the camera.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAudioListenerComponent = {
    type: 'audio-listener';
    id: string;
    /**
     * Absent for on.
     */
    enabled?: boolean;
};

/**
 * An object saying that it **uses** one of the game's stores.
 *
 * The important word is *uses*. A store is not in the object and cannot be: it outlives every
 * scene, and one living inside an object would die with its scene and be two the moment a second
 * object named it. So this carries a name and nothing else, exactly as a behaviour does, and the
 * store itself lives in its own file and in the engine's index.
 *
 * It buys two things an ordinary import cannot. A behaviour attached in an editor can be handed the
 * state through the scene (`storeOf(self)`), so a scene put together by hand can wire behaviour to
 * state with no file to write. And the tree becomes able to answer "what touches this state?",
 * which nothing else could.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreComponent = {
    type: 'store';
    /**
     * Worked out from the object and the name rather than kept, which is the one identity in this
     * format that is not: a link has exactly one field, so two links to one store on one object
     * **are** the same link, and deriving it keeps a file identical through a round trip instead of
     * issuing a fresh id on every save. The object's own id is part of it so that duplicating an
     * object does not give two components the same name.
     */
    id: string;
    /**
     * The store's name: what its file is called, and the key `createGameStore` was given.
     */
    ref: string;
};

/**
 * A flat collider, written down: what this object is made of, physically.
 *
 * A **component and not a child object**, because it is something the object *is*, the same as its
 * picture and its sound. Where it is comes from the object, by the standing rule that a component
 * carries no placement of its own, which is also why moving the object moves its collider.
 *
 * The engine can keep this, write it and read it back while being completely unable to move it: a
 * scene with physics opens and saves losslessly with nothing installed to simulate, and a tool can
 * draw a collider's outline without loading a physics engine.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody2dComponent = { type: 'physics2d' } & Omit<TPhysicsBody2d, '_type'>;

/**
 * A collider in three dimensions, written down: the sibling of {@link TPhysicsBody2dComponent},
 * differing only in the shapes it can name (a sphere is not a circle).
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody3dComponent = { type: 'physics3d' } & Omit<TPhysicsBody3d, '_type'>;

/**
 * The flat simulation's settings, written down. Lives on the scene's **root**: gravity belongs to
 * the scene rather than to anything in it, and the root is an object like any other, so it needs no
 * new home in the file.
 *
 * Only the root's is read, the same way only one camera is.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorld2dComponent = { type: 'physics-world-2d' } & Omit<TPhysicsWorld2d, '_type'>;

/**
 * The simulation's settings in three dimensions, written down. See
 * {@link TPhysicsWorld2dComponent} for why it lives on the root, and {@link TPhysicsWorld2d} for
 * why its gravity is in metres with +y up while the flat one is in pixels with +y down.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorld3dComponent = { type: 'physics-world-3d' } & Omit<TPhysicsWorld3d, '_type'>;

export type { TTransform2d, TTransform3d };

/**
 * Something solid to particles in a flat scene. Its shape is measured on its object, which places it.
 *
 * `enabled` is written only when it is off, the way every field at its default is left out.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleCollider2dComponent = {
    type: 'particle-collider-2d';
    id: string;
    shape: TParticleColliderShape2d;
    enabled?: boolean;
};

/**
 * Something solid to particles in a scene in three dimensions. The same as the flat one.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleCollider3dComponent = {
    type: 'particle-collider-3d';
    id: string;
    shape: TParticleColliderShape3d;
    enabled?: boolean;
};

/**
 * A picture the object and everything under it is drawn into, instead of the screen.
 *
 * The picture is named by `key`, and that is how a model shows it: its surface asks for `key` the
 * way it asks for a loaded image. It is made before any object in the scene, so a model that comes
 * earlier in the file than the screen it shows still finds it.
 *
 * `sees` is written only when it is `'scene'`, the way every field at its default is left out.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteTextureComponent = {
    type: 'sprite-texture';
    id: string;
    key: string;
    width: number;
    height: number;
    background: TColor;
    sees?: 'scene';
};

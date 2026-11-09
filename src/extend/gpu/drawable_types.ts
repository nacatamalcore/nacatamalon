import type { TTexture } from '../../loaders';
import type { TCustomDrawable } from '../../gameobjects/custom/types/t_custom_drawable';

/**
 * A kind of drawing the engine does not know itself, as a plugin teaches it one: how one of its
 * drawings is got ready each frame, and what draws it on each backend.
 *
 * The engine does the rest, as it does for a model: it places each drawing inside whatever it
 * belongs to, orders it in its scene, leaves it out when it is hidden, hands the backend each
 * scene's camera, lights, fog and shadow, and lets it cast into the shadow maps.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawableKind<TPayload = unknown> = {
    /**
     * Its name: what its drawings say in `kind`, and what the warnings call it. Start it with the
     * plugin's own name (`'nacatamalon-blobs'`), so two plugins never pick the same.
     */
    readonly name: string;
    /**
     * Where its drawings live. `'3d'` (the default): in a scene's depth, placed, ordered, lit and
     * shadowed like a model. `'2d'`: flat, with the sprites, placed like one (`x`, `y`, `rotation`,
     * `scaleX`, `scaleY` in the game's pixels, `y` down, with its parallax), drawn in its place among
     * them through its scene's 2D camera, and lit by the scene's 2D lights. A flat one is never
     * shadowed and never casts.
     */
    readonly space?: '2d' | '3d';
    /**
     * What the backend draws for `drawable` this frame, once the engine has placed it: `world` is
     * where it is in the world, every parent applied, as a matrix in both spaces (a flat one's turns
     * about `z` and leaves `z` alone). In a scene whose 3D camera follows the 2D one (`follow2d`),
     * where the world's `y` goes down, a drawing in depth comes already turned over in its own frame,
     * as the engine's models are, so it stands the right way. Called every frame for each of its drawings
     * being drawn, and nothing but the backend reads what it gives. It may give the same object every
     * frame.
     *
     * It must not depend on the camera, and must change nothing but what it gives back: it can run
     * several times in one frame (once for each view of the world that shows the drawing: the
     * screen, a picture of the world, a capture), and what it gave last is what every camera draws.
     * Where the drawing is in each of them reaches `draw` as its `world`, so it is read there.
     */
    prepare(drawable: TCustomDrawable, world: Float32Array): TPayload;
    /**
     * How much of its own space `drawable` takes this frame, before its placement (a flat one's `z`
     * is not read): the box the
     * engine judges it by, to leave it out of a camera or a shadow map that cannot see any of it.
     * It holds everything the drawing reaches, what its shader moves included (a sway in the wind,
     * a bone). Called every frame for each of its drawings being drawn, after `prepare`. Left out,
     * or `null`, the drawing is always drawn.
     *
     * The engine leaves out whole drawings. A drawing spread over a large area (a field, a forest)
     * is best made as several, so the parts out of sight are left out.
     */
    bounds?(drawable: TCustomDrawable): TDrawableBounds | null;
    /**
     * Makes what draws the kind on WebGPU. It runs once per game, the first frame that draws one of
     * its drawings. Left out, the kind is drawn as nothing on WebGPU, with a warning.
     */
    readonly webgpu?: (context: TWebGpuDrawableContext) => TWebGpuDrawables<TPayload>;
    /**
     * Makes what draws the kind on WebGL2. It runs once per game, the first frame that draws one of
     * its drawings, and again after the context is lost and comes back. Left out, the kind is drawn
     * as nothing on WebGL2, with a warning.
     */
    readonly webgl2?: (context: TWebGl2DrawableContext) => TWebGl2Drawables<TPayload>;
    /**
     * Lets go of whatever the kind keeps beside `drawable`, when it is destroyed.
     */
    dispose?(drawable: TCustomDrawable): void;
};

/**
 * A box in a drawing's own space, from its smallest corner to its largest.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawableBounds = {
    readonly min: { readonly x: number; readonly y: number; readonly z: number };
    readonly max: { readonly x: number; readonly y: number; readonly z: number };
};

/**
 * What a kind's WebGPU half is given when it is made. Everything in it belongs to the engine: the
 * kind uses it and never destroys it.
 *
 * @experimental A plugin that names it needs the WebGPU types: TypeScript 6 has them, and on
 * TypeScript 5 the plugin adds `@webgpu/types`. TypeScript 6 does not have WebGPU's constants
 * (`GPUBufferUsage`, `GPUShaderStage`, `GPUTextureUsage`), which a pipeline needs: a plugin that makes
 * one adds `@webgpu/types` either way.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuDrawableContext = {
    readonly backend: 'WEBGPU';
    readonly device: GPUDevice;
    /**
     * What the screen's colour is written in: every pipeline that draws in a pass targets it.
     */
    readonly format: GPUTextureFormat;
    /**
     * How many samples a pixel has (`multisample.count`): 4 with `msaa`, 1 without.
     */
    readonly samples: number;
    /**
     * The depth and stencil every pipeline in a pass draws with: the format, and the stencil test a
     * mask works through. A pipeline spreads it and says its own `depthWriteEnabled` and
     * `depthCompare`: `{ ...context.depthStencil, depthWriteEnabled: true, depthCompare: 'less' }`.
     */
    readonly depthStencil: GPUDepthStencilState;
    /**
     * What a shadow map is: the format of the pipelines that draw into one in `drawShadow`, and of
     * the map a view hands over.
     */
    readonly shadowFormat: GPUTextureFormat;
    /**
     * The lights of a scene as a model reads them. `wgsl` declares the structs `LightItem` and
     * `Lights`, the same a model is lit by; `floats` is how many numbers one block of them is. Each
     * view hands its block already filled (`TWebGpuDrawableView.lights`): the kind writes it into a
     * uniform buffer of its own and reads it as `var<uniform> lights: Lights`.
     */
    readonly lights: { readonly wgsl: string; readonly floats: number };
    /**
     * The 2D lights of a view as a sprite is lit by them, for a flat kind. `wgsl` declares the
     * structs `Lamp2d` and `Lighting2d` and `illuminate2d(lighting, color, pixel)`, which lights a
     * colour at a point in the world's pixels the way a sprite is lit; `floats` is how many numbers
     * one block is. Each camera hands its block filled (`TDrawableCamera.lights`).
     */
    readonly lights2d: { readonly wgsl: string; readonly floats: number };
    /**
     * The GPU side of one of the game's pictures, or `null` while it is still loading or after it
     * was let go of. Ask again each frame rather than keeping it: when the picture is loaded again,
     * the one kept is gone. Never read a picture the pass is drawing into (a view of the world that
     * shows the drawing itself): WebGPU refuses the whole frame.
     */
    texture(texture: TTexture): GPUTexture | null;
};

/**
 * One scene seen in depth, as a pass hands it to a kind: how it is seen and how it is lit.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuDrawableView = {
    /**
     * The projection times the view, as a model is drawn with in this pass.
     */
    readonly viewProjection: Float32Array;
    /**
     * Where the camera is in the world.
     */
    readonly eye: { readonly x: number; readonly y: number; readonly z: number };
    /**
     * The scene's lights, ambient, fog and shadow, in the block `context.lights.wgsl` declares.
     */
    readonly lights: Float32Array;
    /**
     * The shadow map this scene's lights read, or `null` when it casts none. Its matrix is in
     * `lights`.
     */
    readonly shadowMap: GPUTextureView | null;
};

/**
 * One of a pass's 2D views, as a flat kind is handed it: the screen first, then each scene's 2D
 * camera. A flat drawing is drawn through the one its `draw` is told, as a sprite in its place would
 * be.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawableCamera = {
    /**
     * Takes a point in the world's pixels (`y` down) to clip space, through the camera: moved to it,
     * turned against it, magnified by its zoom. `z` goes through as it is; a flat kind draws at any
     * `z` inside the clip range and tests no depth, like a sprite.
     */
    readonly viewProjection: Float32Array;
    /**
     * The view's 2D lights, in the block `context.lights2d` declares: no lamps and a white base for a
     * view with none, so `illuminate2d` hands the colour back as it came.
     */
    readonly lights: Float32Array;
};

/**
 * What a kind is told before a pass draws anything: every one of its drawings in it, and the
 * scenes they are seen in.
 *
 * The same object is handed over every pass: a kind that wants to keep a value copies it.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuDrawablePass<TPayload> = {
    /**
     * What `prepare` gave for each of the kind's drawings in the pass, in the order they are drawn.
     */
    readonly items: readonly TPayload[];
    /**
     * The scenes of the pass seen in depth, by the number `draw` is told, for a kind in depth.
     */
    readonly views: readonly TWebGpuDrawableView[];
    /**
     * The pass's 2D views, by the number `draw` is told, for a flat kind.
     */
    readonly cameras: readonly TDrawableCamera[];
    /**
     * Seconds of game time, as `useUpdate` counts them.
     */
    readonly time: number;
    /**
     * The size of what the pass draws on, in the game's pixels.
     */
    readonly width: number;
    readonly height: number;
};

/**
 * One shadow map a frame draws, as a kind is told about it: its drawings in that map's scene, and
 * the light's matrix it is drawn through.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuDrawableShadow<TPayload> = {
    /**
     * What `prepare` gave for each of the kind's drawings in the scene that casts. Which of them
     * cast is the kind's to decide.
     */
    readonly items: readonly TPayload[];
    /**
     * The light's projection times its view.
     */
    readonly matrix: Float32Array;
};

/**
 * What draws a kind on WebGPU: the kind's half of each frame.
 *
 * Told about each pass before anything in it is drawn (`beginPass`), asked to draw each drawing
 * where it falls in the order (`draw`), and, if it casts, told about the frame's shadow maps
 * (`beginShadows`) and handed each one's pass (`drawShadow`).
 *
 * The rules a pipeline inside the engine keeps are the kind's too:
 *
 * - Room in any buffer is made in `beginPass` and `beginShadows`, never in `draw` or `drawShadow`:
 *   a buffer replaced while a pass is being recorded leaves the draws already recorded pointing at
 *   nothing.
 * - What the shadows read is kept apart from what the passes read. The shadows are drawn first, but
 *   sent to the GPU with the first pass, so a pass that writes where a shadow did leaves the shadow
 *   drawn with the pass's numbers.
 * - Each pass is sent before the next one begins, so what one pass wrote can be written over by the
 *   next.
 * - It never begins, ends or submits a pass or an encoder of its own here; the engine does.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuDrawables<TPayload> = {
    beginPass(pass: TWebGpuDrawablePass<TPayload>): void;
    /**
     * Draws one drawing, seen and lit through view `view` of the pass: one of `views` for a kind in
     * depth (`-1` for a drawing in no scene seen in depth, which the kind may leave out), one of
     * `cameras` for a flat one.
     *
     * `world` is where the drawing is in this pass, the matrix `prepare` was given. It can differ
     * from one pass to another in the same frame: a flat drawing with parallax is somewhere else
     * through a picture of the world (`sees: 'world'`) than on the screen, and `prepare` runs once
     * for each, the last one's payload drawn by all. A kind draws from this one rather than keeping
     * `prepare`'s in its payload.
     */
    draw(encoder: GPURenderPassEncoder, item: TPayload, view: number, world: Float32Array): void;
    /**
     * Every shadow map the frame draws, before the first is drawn, so the kind can make room for
     * all of them. Called only in a frame where one of its drawings is in a scene that casts.
     */
    beginShadows?(shadows: readonly TWebGpuDrawableShadow<TPayload>[], time: number): void;
    /**
     * Draws shadow `shadow` of the ones `beginShadows` was told, into its pass: depth only, in
     * `context.shadowFormat`.
     */
    drawShadow?(encoder: GPURenderPassEncoder, shadow: number): void;
    /**
     * Lets go of what it made, when the game ends.
     */
    destroy?(): void;
};

/**
 * What a kind's WebGL2 half is given when it is made. The context belongs to the engine: the kind
 * uses it and only changes what it made itself.
 *
 * `gl` notes what the kind changes, so it is put back after each call, or after a run of its
 * drawings drawn one after another: it is the kind's way to the context. Each call runs inside the
 * engine's own pass, with its framebuffer, depth and stencil bound: the kind draws into what is bound
 * and leaves the framebuffer, the viewport, the scissor and the stencil as they are, which is how a
 * mask reaches its drawings. It sets every other state it draws with itself (blend, depth test,
 * culling), as it finds what the engine or its own last drawing left. It binds its own vertex array
 * before setting any attribute, and any texture unit or uniform buffer binding it likes: they are put
 * back when it returns.
 *
 * WebGL2 keeps depth from -1 to 1 where WebGPU keeps it from 0 to 1: every matrix handed over is
 * already in WebGL2's range, and a shader that writes `gl_FragDepth` writes `ndc.z * 0.5 + 0.5`.
 *
 * A uniform block laid out `std140` is there in every program that declares it, read or not: a draw
 * with one of them unbound fails (`INVALID_OPERATION`), so a program that declares the lights block
 * and does not read it (a shadow's) still has a buffer bound to it.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGl2DrawableContext = {
    readonly backend: 'WEBGL2';
    readonly gl: WebGL2RenderingContext;
    /**
     * The lights of a scene as a model reads them. `glsl` declares the struct `LightItem` and the
     * block `Lights` (read as `lights`), the same a model is lit by; `floats` is how many numbers one
     * block is. Each view hands its block already filled: the kind writes it into a uniform buffer of
     * its own, bound to the block with `uniformBlockBinding`.
     */
    readonly lights: { readonly glsl: string; readonly floats: number };
    /**
     * The 2D lights of a view, for a flat kind: the GLSL twin of `TWebGpuDrawableContext.lights2d`.
     */
    readonly lights2d: { readonly glsl: string; readonly floats: number };
    /**
     * The GL side of one of the game's pictures, or `null` while it is still loading or after it was
     * let go of. Ask again each frame rather than keeping it.
     */
    texture(texture: TTexture): WebGLTexture | null;
};

/**
 * One scene seen in depth, as a WebGL2 pass hands it to a kind. See `TWebGpuDrawableView`.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGl2DrawableView = {
    /**
     * The projection times the view, in WebGL2's depth range.
     */
    readonly viewProjection: Float32Array;
    readonly eye: { readonly x: number; readonly y: number; readonly z: number };
    /**
     * The scene's lights, ambient, fog and shadow, in the block `context.lights.glsl` declares. The
     * shadow's matrix in it is the one the map is read with (depth from 0 to 1, as the map keeps it).
     */
    readonly lights: Float32Array;
    /**
     * The shadow map this scene's lights read, a depth texture compared on reading
     * (`sampler2DShadow`), or `null` when it casts none.
     */
    readonly shadowMap: WebGLTexture | null;
};

/**
 * What a WebGL2 kind is told before a pass draws anything. See `TWebGpuDrawablePass`.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGl2DrawablePass<TPayload> = {
    readonly items: readonly TPayload[];
    readonly views: readonly TWebGl2DrawableView[];
    readonly cameras: readonly TDrawableCamera[];
    readonly time: number;
    readonly width: number;
    readonly height: number;
};

/**
 * What draws a kind on WebGL2: the same moments as on WebGPU (`TWebGpuDrawables`), with no encoder
 * to record into, since WebGL2 draws as it is told. `drawShadow` draws into the shadow map already
 * bound, through `matrix` (in WebGL2's depth range), depth only.
 *
 * @experimental It can change from one version to the next.
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGl2Drawables<TPayload> = {
    beginPass(pass: TWebGl2DrawablePass<TPayload>): void;
    /**
     * See `TWebGpuDrawables.draw`, `world` included.
     */
    draw(item: TPayload, view: number, world: Float32Array): void;
    beginShadows?(shadows: readonly TWebGpuDrawableShadow<TPayload>[], time: number): void;
    drawShadow?(shadow: number): void;
    destroy?(): void;
};

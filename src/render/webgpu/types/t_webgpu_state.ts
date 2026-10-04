import type { TColor } from "../../../color";
import type { TSpritePipeline } from "../sprite/types/t_sprite_pipeline";
import type { TTilemapPipeline } from "../tilemap/types/t_tilemap_pipeline";
import type { TMeshPipeline } from "../mesh/types/t_mesh_pipeline";
import type { TPostPipelines } from "../post/post_pipeline";
import type { TParticlesPipeline } from "../particles/create_particles_pipeline";
import type { TLinesPipeline } from "../lines/create_lines_pipeline";
import type { TShadowMap } from "../shadow/shadow_map";
import type { TShadowPipeline } from "../shadow/shadow_pipeline";

// render/webgpu/types/t_webgpu_state.ts
export type TWebGPUState = {
    device: GPUDevice;
    context: GPUCanvasContext;
    /**
     * The contexts of the other canvases a pass has drawn on (see `canvasContextFor`), by canvas.
     * Weak, so a canvas that leaves the page takes its context with it.
     */
    canvases: WeakMap<HTMLCanvasElement, GPUCanvasContext>;
    clearColor: TColor;
    /**
     * Shared by every pipeline and written once per frame: the game's resolution and the views
     * sprites are drawn through (the screen, then each scene's camera).
     */
    frameUniforms: { data: Float32Array; buffer: GPUBuffer };
    /**
     * One entry per kind of drawable. Text or tilemaps add a field here, not a parameter.
     */
    sprites: TSpritePipeline;
    /**
     * Maps: whole layers with their corners already in place, one draw each.
     */
    tilemaps: TTilemapPipeline;
    /**
     * Models: a shape, a placement and a surface, lit by the scene's own lights.
     */
    meshes: TMeshPipeline;
    /**
     * The depth picture each size draws against, kept between frames. What lets a mesh in front
     * hide one behind it whatever order they were drawn in.
     */
    depths: Map<string, GPUTexture>;
    /**
     * The sizes of `depths` asked for this frame. The rest are let go when the frame is over: a
     * capture of an odd size, or the old size after a resize, would otherwise stay on the card for as
     * long as the game runs.
     */
    depthsUsed: Set<string>;
    /**
     * How many samples per pixel every pass draws with: 1, or 4 when the game asked for `msaa`. Every
     * drawing pipeline is built for this number and every depth picture has it.
     */
    samples: number;
    /**
     * With more than one sample, the picture each size is drawn into before it is resolved into
     * where the pass really draws. Kept and let go by size, like `depths`.
     */
    multisampled: Map<string, GPUTexture>;
    /**
     * What the canvas was made with, which every picture the chain passes between has to match.
     */
    format: GPUTextureFormat;
    /**
     * Particles, or `null` for a game that has never had an emitter.
     *
     * Built on the first frame that draws one. It borrows the sprite pipeline's groups and quad, so
     * there is nothing here a game without particles should be holding.
     */
    particles: TParticlesPipeline | null;
    /**
     * Lines, or `null` for a game that has never drawn one. Built on the first frame that does, like
     * the particles.
     */
    lines: TLinesPipeline | null;
    /**
     * The screen-wide effects, or `null` for a game that has never had one.
     *
     * Null until the first frame that actually runs one, and that is the point: it owns pictures
     * the size of the canvas, and a game with no effects must not keep two of those for its life.
     */
    post: TPostPipelines | null;
    /**
     * The one depth picture drawn from a light, or `null` for a game whose scenes have never had a
     * light asking to cast.
     *
     * Null until the first frame that actually needs it, and that is the point: it is 16 MB, and
     * nothing about a scene lit by eight ordinary lamps should be paying for it.
     */
    shadow: TShadowMap | null;
    /**
     * What draws into it: two pipelines and a slot per caster. Made with the map and dies with it.
     */
    shadowPipeline: TShadowPipeline | null;
};

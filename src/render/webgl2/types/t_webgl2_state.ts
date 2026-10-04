import type { TColor } from '../../../color';
import type { ITexture } from '../../interface';
import type { TSpritePipeline } from '../sprite/types/t_sprite_pipeline';
import type { TTilemapPipeline } from '../tilemap/types/t_tilemap_pipeline';
import type { TMeshPipeline } from '../mesh/types/t_mesh_pipeline';
import type { TWebGL2Texture } from '../texture';
import type { TPostPipelines } from '../post/post_pipeline';
import type { TParticlesPipeline } from '../particles/create_particles_pipeline';
import type { TLinesPipeline } from '../lines/create_lines_pipeline';
import type { TShadowMap } from '../shadow/shadow_map';
import type { TShadowPipeline } from '../shadow/shadow_pipeline';

/**
 * Everything the WebGL2 backend holds between frames.
 *
 * The GL objects (`frameUniforms.buffer`, `sprites`) die with the context and are built again on a
 * restore. `textures` is what survives it: every handle given to the game, with its image, so each
 * one can be uploaded again.
 *
 * @internal
 */
export type TWebGL2State = {
    gl: WebGL2RenderingContext;
    clearColor: TColor;
    /**
     * Shared by every pipeline and written once per frame: the game's resolution and the views
     * sprites are drawn through (the screen, then each scene's camera).
     */
    frameUniforms: { data: Float32Array; buffer: WebGLBuffer };
    /**
     * One entry per kind of drawable, like the WebGPU state.
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
     * The framebuffer each picture drawn into gets, made the first time it is drawn into and kept:
     * a game drawing into the same one every frame should not make one per frame.
     */
    framebuffers: Map<TWebGL2Texture, WebGLFramebuffer>;
    /**
     * Where a picture is drawn before it is copied into its texture the right way up, one per size.
     * GL keeps a framebuffer's bottom row first, and an image anything else shows is top row first.
     */
    upright: Map<string, WebGLFramebuffer>;
    /**
     * The sizes of `upright` drawn at this frame; the rest are let go when it is over.
     */
    uprightUsed: Set<string>;
    /**
     * The picture each other canvas is drawn into first, with the 2D context its pixels are pasted
     * through (see `canvasTargetFor`). A GL context can only draw on its own canvas.
     */
    canvases: Map<HTMLCanvasElement, { texture: ITexture; context: CanvasRenderingContext2D; image: ImageData }>;
    /**
     * The canvases a pass drew for at this frame; the pictures of the rest are let go.
     */
    canvasesUsed: Set<HTMLCanvasElement>;
    /**
     * How many samples per pixel every pass draws with: 1, or up to 4 when the game asked for `msaa`
     * and the card has them. With more than one, a pass is drawn in `multisampled` and resolved.
     */
    samples: number;
    /**
     * The places a pass with several samples is drawn in, one per size and kind (see `bindMultisampled`).
     */
    multisampled: Map<string, WebGLFramebuffer>;
    /**
     * The keys of `multisampled` drawn at this frame; the rest are let go.
     */
    multisampledUsed: Set<string>;
    /**
     * Every texture this backend handed out, kept so a restore can upload them again.
     */
    textures: Set<TWebGL2Texture>;
    /**
     * True between `webglcontextlost` and `webglcontextrestored`: nothing on the GPU can be touched.
     */
    lost: boolean;
    /**
     * Particles, or `null` for a game that has never had an emitter. Built on the first frame that
     * draws one, and it borrows the sprite pipeline's quad and samplers.
     */
    particles: TParticlesPipeline | null;
    /**
     * Lines, or `null` for a game that has never drawn one. Built on the first frame that does.
     */
    lines: TLinesPipeline | null;
    /**
     * The screen-wide effects, or `null` for a game that has never had one.
     *
     * Null until the first frame that runs one: it owns pictures the size of the canvas, and a game
     * with no effects must not keep them.
     */
    post: TPostPipelines | null;
    /**
     * The one depth picture drawn from a light, or `null` for a game whose scenes have never had a
     * light asking to cast.
     *
     * Null until the first frame that actually needs it: it is 16 MB. It dies with the context like
     * everything else on the card here, and is made again on the next frame that wants it.
     */
    shadow: TShadowMap | null;
    /**
     * What draws into it: two programs. Made with the map and goes with it when the context does.
     */
    shadowPipeline: TShadowPipeline | null;
};

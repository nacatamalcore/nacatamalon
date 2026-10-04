import { beginSprites, drawSpriteRun } from '../sprite/draw_sprites';
import { drawTilemapLayer } from '../tilemap/draw_tilemaps';
import { toGlTexture, textureSize } from '../texture';
import { writeSpriteInstances } from '../sprite/write_sprite_instances';
import { countParticles, drawParticles, drawParticles3d } from '../particles/draw_particles';
import { createParticlesPipeline } from '../particles/create_particles_pipeline';
import { countLineCorners, drawLines } from '../lines/draw_lines';
import { createLinesPipeline } from '../lines/create_lines_pipeline';
import { createPostPipelines } from '../post/post_pipeline';
import { canvasTargetFor, presentToCanvas, releaseUnusedCanvasTargets } from './canvas_target';
import { bindMultisampled, releaseUnusedMultisampled, resolveMultisampled } from './multisample';
import { writeFrameUniforms } from './write_frame_uniforms';
import { drawMesh, writeMeshLights } from '../mesh/draw_meshes';
import { createShadowMap } from '../shadow/shadow_map';
import { createShadowPipeline } from '../shadow/shadow_pipeline';
import { computeModelMatrix } from '../../shared/compute_mvp_3d';
import { findShadowSource, lightSpaceMatrix, reportCastersOutside } from '../../shared/light_space';
import { cameraSpacesFor, fillCameraSpace, newCameraSpace } from '../../shared/compute_mvp_3d';
import { toGlClip } from '../mesh/depth_range';
import type { TFrameContext, TRenderPass } from '../../interface';
import type { TShadowUniforms } from '../../shared/fill_light_uniforms';
import type { TWebGL2State } from '../types/t_webgl2_state';
import type { TWebGL2Texture } from '../texture';

/**
 * Points the context at what this pass draws on: the canvas, or a picture it was told to draw into.
 *
 * A picture is drawn into by hanging it off a framebuffer, which is WebGL2's whole answer to render
 * targets. The framebuffer is kept with the texture handle so a game that draws into the same one
 * every frame does not make one per frame.
 */
const bindTarget = (state: TWebGL2State, pass: TRenderPass): { width: number; height: number } => {
    const { gl } = state;
    if (pass.renderTarget === undefined) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
    }

    const handle = pass.renderTarget as TWebGL2Texture;
    const size = textureSize(handle);
    let framebuffer = state.framebuffers.get(handle);
    const glTexture = toGlTexture(handle);
    if (framebuffer === undefined && glTexture !== null) {
        framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTexture, 0);
        // Its own depth, because the canvas's belongs to the canvas: a picture drawn into without
        // one would draw meshes in whatever order they happened to come in.
        const depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size.width, size.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        state.framebuffers.set(handle, framebuffer);
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer ?? null);
    }
    return size;
};

/**
 * Points the context at a place of `width` by `height` to draw a picture in first, made once per size
 * and kept, with a depth of its own for the same reason a picture has one.
 */
const bindUpright = (state: TWebGL2State, width: number, height: number): void => {
    const { gl } = state;
    const key = `${width}x${height}`;
    state.uprightUsed.add(key);
    let framebuffer = state.upright.get(key);
    if (framebuffer === undefined) {
        framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const color = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, color);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
        const depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        state.upright.set(key, framebuffer);
        return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
};

/**
 * Lets go of every place of that kind this frame did not draw at, with the two buffers it is made
 * of, and starts counting the next frame. The screen's size and the pictures drawn every frame are
 * never touched; a capture of an odd size, or the old size after a resize, would otherwise stay.
 */
export const releaseUnusedUpright = (state: TWebGL2State): void => {
    const { gl } = state;
    for (const [key, framebuffer] of state.upright) {
        if (state.uprightUsed.has(key)) {
            continue;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const color = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLRenderbuffer | null;
        const depth = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLRenderbuffer | null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteRenderbuffer(color);
        gl.deleteRenderbuffer(depth);
        gl.deleteFramebuffer(framebuffer);
        state.upright.delete(key);
    }
    state.uprightUsed.clear();
};

/**
 * Copies what was drawn into the place above into the picture itself, turned over on the way.
 *
 * **Why a picture needs this and the screen does not.** GL keeps a framebuffer's bottom row first, so
 * a picture drawn straight into its texture is stored upside down next to a loaded image, and a model
 * showing it shows it upside down: the interface promises a picture anything can show like any other
 * image, and WebGPU keeps it the right way round without being asked. Turning it over here, once,
 * keeps every shader that reads a texture exactly as it is. The copy is one small blit per picture.
 */
const copyUpright = (state: TWebGL2State, pass: TRenderPass, width: number, height: number): void => {
    const { gl } = state;
    const source = state.upright.get(`${width}x${height}`) ?? null;
    bindTarget(state, pass);
    const destination = state.framebuffers.get(pass.renderTarget as TWebGL2Texture) ?? null;
    if (source === null || destination === null) {
        return;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination);
    // The destination's rows given top to bottom, which is what turns it over.
    gl.blitFramebuffer(0, 0, width, height, 0, height, width, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

/**
 * Draws one frame: for each pass, clears what it draws on and draws what it holds.
 *
 * Sprites and maps come out **interleaved**, in the order they were given, so a ground layer is under
 * the characters and the treetops over them. Each batch of sprites remembers where it started in
 * that list, which is what lets the two be walked together.
 *
 * There is no encoder and no submit: every call acts at once, and the browser shows the canvas when
 * the frame's work ends. A lost context draws nothing until it is restored.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * Where the light's matrix is worked out, once a frame and into the same place every time.
 *
 * At module level rather than inside the frame because it is one matrix for the whole frame however
 * many models cast into it: what changes per model is its own placement.
 */
const lightMatrix = new Float32Array(16);

/**
 * What a model belonging to no scene is looked at through: flat on, in the game's own pixels.
 *
 * Filled again every pass from that pass's own size, because drawn flat on means drawn in the
 * pixels of whatever is being drawn on.
 */
const flatSpace = newCameraSpace();

export const renderFrame = (state: TWebGL2State, ctx: TFrameContext): void => {
    if (state.lost) {
        return;
    }
    const { gl } = state;
    // Said once here rather than by each draw: a set of bones is filled once however many models
    // wear it and however many passes they are drawn in.
    state.meshes.joints.beginFrame();

    // None of this happens for a frame with no effects: see `TFrameContext.post`.
    const chain = ctx.post ?? null;
    if (chain !== null) {
        state.post ??= createPostPipelines(gl);
    }

    // Drawn before anything that reads it, once for the whole frame. `null` is the ordinary answer
    // and costs one walk of the passes: no map is made, no pass is drawn, and a game that never
    // asks for a shadow never pays for one.
    const source = findShadowSource(ctx);
    let shadowUniforms: TShadowUniforms | null = null;
    if (source !== null) {
        state.shadow ??= createShadowMap(gl);
        // A card that would not give a depth picture said so when it was asked. The scene is lit
        // without shadows rather than not lit at all.
        if (state.shadow !== null) {
            state.shadowPipeline ??= createShadowPipeline(gl);
            lightSpaceMatrix(source.light, source.camera, lightMatrix);
            reportCastersOutside(source.casters, source.light, lightMatrix);
            state.shadowPipeline.begin(state.shadow, lightMatrix);
            for (const caster of source.casters) {
                state.shadowPipeline.draw(state.meshes, caster, caster.worldMatrix ?? computeModelMatrix(caster.transform));
            }
            state.shadowPipeline.end();

            shadowUniforms = {
                view: source.view,
                matrix: lightMatrix,
                light: source.light,
                lightIndex: source.lightIndex,
                mapSize: state.shadow.size,
            };
        }
    }

    for (const asked of ctx.passes) {
        // A pass for another canvas is a pass into a picture here, carried over at the end.
        const canvas = asked.renderTarget === undefined ? asked.targetCanvas ?? null : null;
        const own = canvas === null ? null : canvasTargetFor(state, canvas);
        if (canvas !== null && own === null) {
            continue;
        }
        const pass = own === null ? asked : { ...asked, renderTarget: own };
        // The pass a person looks at goes into a picture instead. Its own copy, so redirecting it
        // is not something the caller can see, and it goes through the ordinary render-target path
        // so it gets a depth buffer of its own: without one a 3D scene would fall back to draw
        // order the moment a single effect was switched on.
        //
        // A capture asks for the effects too, and is drawn into a picture of its own size.
        const redirected = chain !== null && pass.postProcess === true;
        const size = pass.renderTarget === undefined
            ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }
            : textureSize(pass.renderTarget as TWebGL2Texture);
        const drawn = redirected
            ? { ...pass, renderTarget: state.post!.sceneTarget(size.width, size.height) }
            : pass;
        // A picture the game asked for is drawn somewhere else first, and copied in the right way up
        // at the end of the pass. The effects' own picture is not: they read it knowing which way up
        // GL keeps it.
        const upright = drawn === pass && pass.renderTarget !== undefined;
        const target = bindTarget(state, drawn);
        if (upright) {
            bindUpright(state, target.width, target.height);
        }
        // With `msaa`, drawn in a place with several samples per pixel and resolved into whatever was
        // bound above when the drawing is done.
        const into = state.samples > 1 ? bindMultisampled(state, target.width, target.height) : null;
        gl.viewport(0, 0, target.width, target.height);
        // With a `pixelRatio` the screen's buffer holds more real pixels than the game has. The
        // viewport, depth, samples and pictures above are the buffer's size; everything placed in
        // it (cameras, sprites, maps, a material's `resolution`) measures in the game's. Only the
        // screen's pass: a texture or another canvas is its own size.
        const ratio = asked.renderTarget === undefined && canvas === null ? ctx.pixelRatio ?? 1 : 1;
        const width = target.width / ratio;
        const height = target.height / ratio;

        const clear = drawn.clearColor ?? state.clearColor;
        gl.clearColor(clear.r, clear.g, clear.b, clear.a);
        // Depth clears to the far plane, and writing has to be on for a clear to reach it: a mesh
        // draw turns it off again when it is done, and a clear with it off does nothing at all.
        gl.clearDepth(1);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        writeFrameUniforms(state, width, height, drawn.cameras ?? []);

        const drawables = drawn.drawables ?? [];
        const cameraIndex = drawn.cameraIndex ?? [];
        const views3d = drawn.views3d ?? [];
        const viewIndex = drawn.viewIndex ?? [];
        // Once for the whole pass, not once per model. The depth fix goes in here too: it is a
        // multiplication from the left, so folding it into the camera gives the same matrix as
        // applying it to every model afterwards, which is what used to happen.
        const spaces = cameraSpacesFor(views3d, width, height);
        for (const space of spaces) {
            toGlClip(space.viewProjection);
        }
        fillCameraSpace(flatSpace, null, width, height);
        toGlClip(flatSpace.viewProjection);

        writeSpriteInstances(gl, state.sprites, drawables, cameraIndex);

        // Counted and reserved before anything is drawn, so the buffer cannot be swapped out from
        // under a draw that was already pointed at it.
        const particleCount = countParticles(drawables);
        if (particleCount > 0) {
            state.particles ??= createParticlesPipeline(gl, state.sprites.quad);
            state.particles.beginFrame(particleCount);
        }

        // The same for lines, and for the same reason.
        const lineCorners = countLineCorners(drawables);
        if (lineCorners > 0) {
            state.lines ??= createLinesPipeline(gl);
            state.lines.beginFrame(lineCorners);
        }

        let run = 0;
        let spritesReady = false;
        // Which scene's lights are on the card right now, so a frame of one scene sends them once.
        let litView = -1;
        for (let i = 0; i < drawables.length; i++) {
            const item = drawables[i];
            if (item.type === 'mesh') {
                const index = viewIndex[i] ?? -1;
                const view = views3d[index] ?? null;
                if (view !== null && index !== litView) {
                    writeMeshLights(gl, state.meshes, view, shadowUniforms);
                    litView = index;
                }
                drawMesh(gl, state.meshes, item, spaces[index] ?? flatSpace, width, height, ctx.time, state.shadow?.texture ?? null);
                // Its program left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            if (item.type === 'particles') {
                drawParticles(gl, state.particles!, state.sprites, item);
                // Its program left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            if (item.type === 'particles3d') {
                drawParticles3d(gl, state.particles!, state.sprites, item, spaces[viewIndex[i] ?? -1] ?? null);
                spritesReady = false;
                continue;
            }
            if (item.type === 'lines') {
                drawLines(gl, state.lines!, item, spaces[viewIndex[i] ?? -1] ?? null);
                // Its program left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            if (item.type === 'tilemap') {
                drawTilemapLayer(gl, state.tilemaps, item, cameraIndex[i] ?? -1, ctx.time, width, height);
                // The layer's program left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            // Only the sprite that opens a batch draws it; the rest of the batch went with it.
            if (run >= state.sprites.runCount || state.sprites.runs[run].firstDrawable !== i) {
                continue;
            }
            if (!spritesReady) {
                beginSprites(gl, state.sprites);
                spritesReady = true;
            }
            spritesReady = drawSpriteRun(
                gl, state.sprites, state.sprites.runs[run], ctx.time, width, height,
            );
            run++;
        }

        if (spritesReady) {
            gl.bindVertexArray(null);
        }
        if (state.samples > 1) {
            resolveMultisampled(state, into, target.width, target.height);
        }
        if (upright) {
            copyUpright(state, drawn, target.width, target.height);
        }

        // The chain, straight after the pass it reads. To the canvas for the screen; for a capture,
        // into the place a picture is drawn in first, and turned over from there like any other.
        if (redirected && pass.renderTarget === undefined) {
            state.post!.run(chain!, null, ctx.time, ctx.progress, ctx.phase, ratio);
        } else if (redirected) {
            bindUpright(state, size.width, size.height);
            state.post!.run(chain!, state.upright.get(`${size.width}x${size.height}`) ?? null, ctx.time, ctx.progress, ctx.phase);
            copyUpright(state, pass, size.width, size.height);
        }

        if (canvas !== null) {
            presentToCanvas(state, canvas);
        }
    }

    releaseUnusedUpright(state);
    releaseUnusedCanvasTargets(state);
    releaseUnusedMultisampled(state);

    // Back to the canvas, so anything asking questions afterwards (a readback, a resize) is not
    // looking at whatever the last pass drew into.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

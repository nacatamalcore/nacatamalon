import { beginSprites, drawSpriteRun } from '../sprite/draw_sprites';
import { drawTilemapLayer } from '../tilemap/draw_tilemaps';
import { toGpuTexture } from '../texture';
import { writeSpriteInstances } from '../sprite/write_sprite_instance';
import { writeFrameUniforms } from './write_frame_uniforms';
import { countParticles, drawParticles, drawParticles3d } from '../particles/draw_particles';
import { createParticlesPipeline } from '../particles/create_particles_pipeline';
import { countLineCorners, drawLines } from '../lines/draw_lines';
import { createLinesPipeline } from '../lines/create_lines_pipeline';
import { createPostPipelines } from '../post/post_pipeline';
import { countPostSteps } from '../../shared/post_steps';
import { depthViewFor, multisampledViewFor, releaseUnusedDepths } from './depth';
import { canvasContextFor } from './canvas_context';
import { createShadowMap } from '../shadow/shadow_map';
import { createShadowPipeline } from '../shadow/shadow_pipeline';
import { computeModelMatrix } from '../../shared/compute_mvp_3d';
import { findShadowSource, lightSpaceMatrix, reportCastersOutside } from '../../shared/light_space';
import { cameraSpacesFor, fillCameraSpace, newCameraSpace } from '../../shared/compute_mvp_3d';
import { drawMesh, reserveMeshSlots, writeMeshLights } from '../mesh/draw_meshes';
import type { TFrameContext, TRenderPass } from '../../interface';
import type { TShadowUniforms } from '../../shared/fill_light_uniforms';
import type { TWebGPUState } from '../types/t_webgpu_state';

/**
 * Where a pass draws and how big that is: the screen, a picture it was told to draw into, or another
 * canvas. `null` for a canvas that will not draw with this device, whose pass is left out.
 *
 * The screen's picture has to be asked for **every frame** and never kept, which is why this is
 * worked out per pass rather than once. Another canvas's too.
 */
const targetOf = (gpu: TWebGPUState, pass: TRenderPass): { view: GPUTextureView; width: number; height: number } | null => {
    if (pass.renderTarget !== undefined) {
        const texture = toGpuTexture(pass.renderTarget);
        return { view: texture.createView(), width: texture.width, height: texture.height };
    }
    const context = pass.targetCanvas === undefined ? gpu.context : canvasContextFor(gpu, pass.targetCanvas);
    if (context === null) {
        return null;
    }
    const texture = context.getCurrentTexture();
    return { view: texture.createView(), width: texture.width, height: texture.height };
};

/**
 * Draws one frame: for each pass, clears what it draws on, draws what it holds, and submits once.
 *
 * Sprites and maps are drawn **interleaved**, in the order they were given: the ground layer, the
 * characters, the treetops. Each batch of sprites knows where it started in that list, so the two
 * lists are walked together instead of drawing every sprite and then every layer, which would put
 * the whole map either behind or in front of everything.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * Where the light's matrix is worked out, once a frame and into the same place every time.
 *
 * At module level rather than inside the frame because it is one matrix for the whole frame however
 * many models cast into it: what changes per model is its own placement, and that is multiplied in
 * by the shader.
 */
const lightMatrix = new Float32Array(16);

/**
 * What a model belonging to no scene is looked at through: flat on, in the game's own pixels.
 *
 * **It is filled again every pass, from that pass's own size**, and that is not a detail. Drawn flat
 * on means drawn in the pixels of whatever is being drawn on, so a fixed one would put those models
 * at the scale of some other frame. Nothing would report it: they would simply be the wrong size.
 */
const flatSpace = newCameraSpace();

export const renderFrame = (gpu: TWebGPUState, ctx: TFrameContext): void => {
    let encoder = gpu.device.createCommandEncoder();
    // Said once here rather than by each draw: a set of bones is written once however many models
    // wear it and however many passes they are drawn in.
    gpu.meshes.joints.beginFrame();

    // Nothing below this line happens for a frame with no effects, which is the promise
    // `TFrameContext.post` makes. Every pass draws where it always did.
    const chain = ctx.post ?? null;
    if (chain !== null) {
        gpu.post ??= createPostPipelines(gpu.device, gpu.format);
        gpu.post.beginFrame(countPostSteps(chain));
    }

    // Drawn before anything that reads it, once for the whole frame. `null` is the ordinary answer
    // and costs one walk of the passes: no map is made, no pass is recorded, and a game that never
    // asks for a shadow never pays for one.
    const source = findShadowSource(ctx);
    let shadowUniforms: TShadowUniforms | null = null;
    if (source !== null) {
        gpu.shadow ??= createShadowMap(gpu.device);
        gpu.shadowPipeline ??= createShadowPipeline(gpu.device);
        lightSpaceMatrix(source.light, source.camera, lightMatrix);
        reportCastersOutside(source.casters, source.light, lightMatrix);
        gpu.shadowPipeline.beginFrame(source.casters.length);

        const shadowPass = encoder.beginRenderPass({
            label: 'shadow',
            colorAttachments: [],
            depthStencilAttachment: {
                view: gpu.shadow.view,
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
        let casterSlot = 0;
        for (const caster of source.casters) {
            const model = caster.worldMatrix ?? computeModelMatrix(caster.transform);
            if (gpu.shadowPipeline.draw(shadowPass, gpu.meshes, caster, lightMatrix, model, casterSlot)) {
                casterSlot++;
            }
        }
        shadowPass.end();

        shadowUniforms = {
            view: source.view,
            matrix: lightMatrix,
            light: source.light,
            lightIndex: source.lightIndex,
            mapSize: gpu.shadow.size,
        };
    }

    for (let p = 0; p < ctx.passes.length; p++) {
        const pass = ctx.passes[p];
        // The pass a person looks at is sent into a picture instead, and the chain takes it from
        // there. Its own copy, so redirecting it is not something the caller can see. The screen's
        // pass, or a capture of it: `destination` is where the chain writes at the end.
        const destination = chain !== null && pass.postProcess === true ? targetOf(gpu, pass) : null;
        if (chain !== null && pass.postProcess === true && destination === null) {
            continue;
        }
        const drawn = destination !== null
            ? { ...pass, renderTarget: gpu.post!.sceneTarget(destination.width, destination.height) }
            : pass;
        const target = targetOf(gpu, drawn);
        if (target === null) {
            continue;
        }
        // With a `pixelRatio` the screen's buffer holds more real pixels than the game has. The
        // depth, the samples and the effects' pictures are the buffer's size; everything placed in
        // it (cameras, sprites, maps, a material's `resolution`) measures in the game's. Only the
        // screen's pass: a texture or another canvas is its own size.
        const ratio = pass.renderTarget === undefined && pass.targetCanvas === undefined ? ctx.pixelRatio ?? 1 : 1;
        const width = target.width / ratio;
        const height = target.height / ratio;
        // With `msaa`, drawn into a picture with several samples per pixel and resolved into the
        // target as the pass ends. The samples themselves are not kept: only the resolved pixel is.
        const multisampled = multisampledViewFor(gpu, target.width, target.height);
        const gpuPass = encoder.beginRenderPass({
            colorAttachments: [multisampled === null ? {
                view: target.view,
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: drawn.clearColor ?? gpu.clearColor,
            } : {
                view: multisampled,
                resolveTarget: target.view,
                loadOp: 'clear',
                storeOp: 'discard',
                clearValue: drawn.clearColor ?? gpu.clearColor,
            }],
            // Cleared to the far plane: everything is in front of nothing.
            depthStencilAttachment: {
                view: depthViewFor(gpu, target.width, target.height),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        // The game's size, which is the resolution (the buffer's only at a `pixelRatio` of 1).
        // One uniform buffer for every pass: fine while a frame has a single pass, and the first
        // thing to split when a second one (split screen, a capture) needs its own cameras.
        // Not split: each pass is submitted on its own instead, at the end of this loop.
        writeFrameUniforms(gpu, width, height, drawn.cameras ?? []);

        const drawables = drawn.drawables ?? [];
        const cameraIndex = drawn.cameraIndex ?? [];
        const views3d = drawn.views3d ?? [];
        const viewIndex = drawn.viewIndex ?? [];
        // Once for the whole pass, not once per model: the view and the projection are the same
        // for everything in a scene, and working them out per model was the same arithmetic done
        // as many times as there were models.
        const spaces = cameraSpacesFor(views3d, width, height);
        fillCameraSpace(flatSpace, null, width, height);
        const spriteCount = writeSpriteInstances(gpu.device, gpu.sprites, drawables, cameraIndex);

        // All three before anything is drawn: growing any of these buffers throws away the slots
        // already written, so the room has to be there first.
        writeMeshLights(gpu.device, gpu.meshes, views3d, shadowUniforms, gpu.shadow?.view ?? null);
        const meshCount = drawables.reduce((n, item) => n + (item.type === 'mesh' ? 1 : 0), 0);
        reserveMeshSlots(gpu.device, gpu.meshes, meshCount);
        gpu.meshes.materials.beginFrame(meshCount);
        let withEffect = 0;
        let fieldsWithEffect = 0;
        for (let r = 0; r < gpu.sprites.runCount; r++) {
            if (gpu.sprites.runs[r].material !== null) {
                if (gpu.sprites.runs[r].distanceField) {
                    fieldsWithEffect++;
                } else {
                    withEffect++;
                }
            }
        }
        gpu.sprites.materials.beginFrame(withEffect);
        gpu.sprites.distanceFieldMaterials.beginFrame(fieldsWithEffect);
        gpu.tilemaps.materials.beginFrame(
            drawables.reduce((n, item) => n + (item.type === 'tilemap' ? 1 : 0), 0),
        );

        // Counted and reserved before a single draw is recorded, or a buffer that grew in the middle
        // would leave the draws already recorded pointing at nothing.
        const particleCount = countParticles(drawables);
        if (particleCount > 0) {
            gpu.particles ??= createParticlesPipeline(gpu.device, gpu.format, gpu.samples, gpu.sprites.layouts);
            gpu.particles.beginFrame(particleCount);
            gpu.particles.writeViews(spaces);
        }

        // The same for lines, and for the same reason.
        const lineCorners = countLineCorners(drawables);
        if (lineCorners > 0) {
            gpu.lines ??= createLinesPipeline(gpu.device, gpu.format, gpu.samples);
            gpu.lines.beginFrame(lineCorners);
            gpu.lines.writeViews(spaces);
        }

        let run = 0;
        let layerSlot = 0;
        let meshSlot = 0;
        let spritesReady = false;
        for (let i = 0; i < drawables.length; i++) {
            const item = drawables[i];
            if (item.type === 'mesh') {
                const view = viewIndex[i] ?? -1;
                if (drawMesh(gpu.device, gpuPass, gpu.meshes, item, spaces[view] ?? flatSpace, view, meshSlot, width, height, ctx.time)) {
                    meshSlot++;
                }
                // Its pipeline left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            if (item.type === 'particles') {
                drawParticles(gpu.device, gpuPass, gpu.particles!, gpu.sprites, item);
                // Its pipeline left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            if (item.type === 'particles3d') {
                drawParticles3d(gpu.device, gpuPass, gpu.particles!, gpu.sprites, item, viewIndex[i] ?? -1);
                spritesReady = false;
                continue;
            }
            if (item.type === 'lines') {
                drawLines(gpuPass, gpu.lines!, item, viewIndex[i] ?? -1);
                // Its pipeline left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            if (item.type === 'tilemap') {
                drawTilemapLayer(gpu.device, gpuPass, gpu.tilemaps, item, cameraIndex[i] ?? -1, layerSlot, ctx.time, width, height);
                layerSlot++;
                // The layer's pipeline left none of the sprite state set.
                spritesReady = false;
                continue;
            }
            // Only the sprite that opens a batch draws it; the rest of the batch went with it.
            if (run >= gpu.sprites.runCount || gpu.sprites.runs[run].firstDrawable !== i) {
                continue;
            }
            if (!spritesReady) {
                beginSprites(gpuPass, gpu.sprites);
                spritesReady = true;
            }
            spritesReady = drawSpriteRun(
                gpuPass, gpu.sprites, gpu.sprites.runs[run], ctx.time, width, height,
            );
            run++;
        }
        // Nothing in the list and something written can only mean a bug upstream, but a frame that
        // draws nothing is better than one that draws rubbish.
        void spriteCount;

        gpuPass.end();

        // Recorded before this pass is sent, so it reads the picture this pass drew. Each effect
        // writes its parameters into a slot of its own, so two of them inside one submit cannot run
        // against each other's numbers: the reason the slots exist rather than a buffer per effect.
        if (destination !== null) {
            gpu.post!.run(encoder, chain!, destination.view, ctx.time, ctx.progress, ctx.phase, ratio);
        }

        // Every buffer this pass read (the frame's numbers, the sprites, the models' slots, the
        // particles) is written again by the next one from the start. The queue runs writes and
        // submits in the order they were made, so sending this pass now is what lets the next one
        // write over them: in a single submit every pass would draw with the last one's numbers.
        // The screen is the last pass and goes out below.
        if (p < ctx.passes.length - 1) {
            gpu.device.queue.submit([encoder.finish()]);
            encoder = gpu.device.createCommandEncoder();
        }
    }

    gpu.device.queue.submit([encoder.finish()]);
    releaseUnusedDepths(gpu);
};

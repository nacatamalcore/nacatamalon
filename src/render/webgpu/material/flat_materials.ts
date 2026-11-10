
import { failWithLines } from './fail_with_lines';
import { buildUniformLayout, MAX_MATERIAL_FLOATS, writeUniformValues } from '../../shared/material_uniforms';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { toGpuTexture } from '../texture';
import { FLAT_DEPTH } from '../frame/depth';
import { ADDITIVE_BLEND, ALPHA_BLEND } from '../frame/blend';
import { withoutLights2d } from '../../shared/lighting_2d_shader';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TTextureWrap, TUniformSignature, TUniformValues } from '../../../materials';

/**
 * What tells one flat pipeline from another: the groups it already binds, the corners it reads, how
 * they are joined up, and which builder writes its shader.
 *
 * A sprite and a map's layer differ in those four and in nothing else, so they share everything
 * below rather than having one of these apiece.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFlatMaterialKind = {
    label: string;
    format: GPUTextureFormat;
    /**
     * How many samples per pixel the passes it draws in have, as the built-in pipeline.
     */
    samples: number;
    /**
     * The groups the built-in pipeline already binds. The uniforms go in the one after them.
     */
    shared: GPUBindGroupLayout[];
    vertexBuffers: GPUVertexBufferLayout[];
    topology: GPUPrimitiveTopology;
    build: (fragment: string, sig: TUniformSignature, mapNames: readonly string[]) => string;
};

/**
 * The card's name for each thing a picture can do past its edge.
 */
const ADDRESS_MODE: Record<TTextureWrap, GPUAddressMode> = {
    repeat: 'repeat',
    clamp: 'clamp-to-edge',
    mirror: 'mirror-repeat',
};

/**
 * Bytes between one batch's parameters and the next.
 *
 * Not chosen: the card will only point at an offset that is a multiple of this. Sixty-four numbers
 * fit exactly, which is far more uniforms than an effect has, and the same number the models already
 * use for theirs.
 */
export const FLAT_MATERIAL_STRIDE = 256;

/**
 * One compiled effect, or the record that it would not compile.
 */
type TCompiled = {
    pipeline: GPURenderPipeline | null;
    layout: TUniformLayout;
    /**
     * Once true, this material is drawn with the built-in shader and nothing is tried again.
     */
    failed: boolean;
    /**
     * Still being compiled and checked, apart from the frame. Until it is, what wears it is not
     * drawn, as a sprite is not drawn until its sheet is there.
     */
    pending: boolean;
    /**
     * The maps the shader reads, in the order of their slots.
     */
    mapNames: string[];
};

/**
 * Every sprite effect this game has compiled, and the numbers they are drawn with.
 *
 * **Compiled effects are kept by their source, not by the material that carried it.** Two materials
 * running the same shader are then one compile rather than two, which is the point of an effect
 * being shareable at all. Keeping them by material would be simpler and would quietly compile the
 * identical text once per material that used it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFlatMaterials = (device: GPUDevice, kind: TFlatMaterialKind) => {
    // The uniforms, then a sampler and a picture for each of the four maps, used or not, so every flat
    // material has one layout.
    const mapEntries: GPUBindGroupLayoutEntry[] = [];
    for (let i = 0; i < MAX_MATERIAL_MAPS; i++) {
        mapEntries.push(
            { binding: 1 + i * 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 2 + i * 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        );
    }
    const materialLayout = device.createBindGroupLayout({
        label: `${kind.label} material layout`,
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, ...mapEntries],
    });
    const pipelineLayout = device.createPipelineLayout({
        label: `${kind.label} material pipeline layout`,
        // The shared ones first, exactly as the built-in pipeline binds them, and the uniforms last.
        bindGroupLayouts: [...kind.shared, materialLayout],
    });

    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(MAX_MATERIAL_FLOATS);

    let slots: GPUBuffer | null = null;
    /**
     * Each slot's group, with the pictures and samplers it was made for: made again only when those
     * change, which for a sprite that keeps its maps is never.
     */
    let slotBindGroups: Array<{ key: string; group: GPUBindGroup } | undefined> = [];

    /**
     * A white pixel, read by a map the material does not carry or one still loading: a map is a
     * second picture, and what wears it should not vanish while one is on its way.
     */
    let white: GPUTexture | null = null;
    const whiteTexture = (): GPUTexture => {
        if (white === null) {
            white = device.createTexture({
                label: `${kind.label} material white`,
                size: [1, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
            device.queue.writeTexture({ texture: white }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
        }
        return white;
    };
    /**
     * Every way a map can be read, made the first time it is asked for.
     */
    const samplers = new Map<string, GPUSampler>();
    const samplerOf = (filter: 'nearest' | 'linear', u: TTextureWrap, v: TTextureWrap): GPUSampler => {
        const key = wrapKey(filter, u, v);
        let sampler = samplers.get(key);
        if (sampler === undefined) {
            sampler = device.createSampler({
                label: `${kind.label} map ${key}`,
                magFilter: filter,
                minFilter: filter,
                addressModeU: ADDRESS_MODE[u],
                addressModeV: ADDRESS_MODE[v],
            });
            samplers.set(key, sampler);
        }
        return sampler;
    };
    /**
     * A number for each picture, so a slot's group can tell whether it still binds the same ones.
     */
    const ids = new WeakMap<GPUTexture, number>();
    let nextId = 0;
    const idOf = (texture: GPUTexture): number => {
        let id = ids.get(texture);
        if (id === undefined) {
            id = nextId++;
            ids.set(texture, id);
        }
        return id;
    };
    /**
     * Which materials have been said to read a map they do not carry, by material and name.
     */
    const warned = new Set<string>();
    let capacity = 0;
    let used = 0;

    const grow = (needed: number): void => {
        let size = Math.max(capacity === 0 ? 8 : capacity, 1);
        while (size < needed) {
            size *= 2;
        }
        slots?.destroy();
        slots = device.createBuffer({
            label: 'flat material parameters',
            size: size * FLAT_MATERIAL_STRIDE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Every group pinned to the old buffer now points at nothing, so they all go.
        slotBindGroups = [];
        capacity = size;
    };

    // `said` is shared by the two compiles of one effect, lit and not, so what is wrong with it is
    // said once and not twice: they differ in a line the effect never touches.
    const build = (material: TDrawShader, additive: boolean, lit: boolean, said: { done: boolean }): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const source = material.fragment as string;
        const mapNames = mapNamesOf(source);

        // Too many numbers for its slot. Said once where it was made (`checkParameterRoom`).
        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            return { pipeline: null, layout, failed: true, pending: false, mapNames };
        }
        if (mapNames.length > MAX_MATERIAL_MAPS) {
            if (said.done) {
                return { pipeline: null, layout, failed: true, pending: false, mapNames };
            }
            said.done = true;
            console.warn(
                `[NacatamalOn] createMaterial: the material "${material.name ?? 'flat material'}" reads ${mapNames.length} maps ` +
                `(${mapNames.join(', ')}) and a material has ${MAX_MATERIAL_MAPS}. It is drawing with the built-in shader instead.`,
            );
            return { pipeline: null, layout, failed: true, pending: false, mapNames };
        }

        const entry: TCompiled = { pipeline: null, layout, failed: false, pending: true, mapNames };
        const fail = (reason: unknown): void => {
            if (entry.failed) {
                return;
            }
            entry.failed = true;
            entry.pending = false;
            entry.pipeline = null;
            // The lit one says it, with its lines: the two compile apart, and the unlit one's lines
            // would be off by the lights it leaves out. They differ only in engine code, so when one
            // fails both do.
            if (!lit || said.done) {
                return;
            }
            said.done = true;
            console.warn(
                `[NacatamalOn] createMaterial: the material "${material.name ?? 'flat material'}" did not compile. ` +
                'It is drawing with the built-in shader instead.',
                reason,
            );
        };

        // Caught here: what is wrong is said once below, in this engine's words and with its lines.
        device.pushErrorScope('validation');
        const code = kind.build(source, material.uniformSig ?? {}, mapNames);
        const module = device.createShaderModule({
            label: `flat material ${material.name ?? material.id}${lit ? '' : ' unlit'}`,
            code: lit ? code : withoutLights2d(code),
        });
        void device.popErrorScope();

        // On this card a shader that will not compile is not an exception thrown here: it is
        // reported later. So the pipeline is built and checked apart from the frame, and only used
        // once the card says it is good: used before, a broken one takes the whole pass with it.
        void device.createRenderPipelineAsync({
            label: `flat material pipeline ${material.name ?? material.id}${lit ? '' : ' unlit'}`,
            layout: pipelineLayout,
            vertex: { module, entryPoint: 'vs', buffers: kind.vertexBuffers },
            fragment: {
                module,
                entryPoint: 'fs',
                targets: [{
                    format: kind.format,
                    blend: additive ? ADDITIVE_BLEND : ALPHA_BLEND,
                }],
            },
            primitive: { topology: kind.topology },
            depthStencil: FLAT_DEPTH,
            multisample: { count: kind.samples },
        }).then((made) => {
            if (entry.failed) {
                return;
            }
            entry.pipeline = made;
            entry.pending = false;
        }, (error: unknown) => failWithLines(module, error, fail));

        return entry;
    };

    return {
        /**
         * Frees every batch's slot and makes room for this frame's, **before anything is drawn**.
         *
         * Growing is what makes the order matter: it throws the old buffer away, and a draw already
         * recorded against it would be pointing at nothing by the time the frame is submitted. So
         * the count is asked for up front rather than grown into.
         */
        beginFrame: (batches: number): void => {
            used = 0;
            if (batches > capacity) {
                grow(batches);
            }
        },
        /**
         * The compiled effect for this material, compiling it the first time it is seen.
         *
         * A material with no WGSL of its own never reaches here: the caller checks that first,
         * because that is the ordinary case and it should cost nothing.
         *
         * How it blends is fixed in the pipeline, so the same effect adding light is a second compile,
         * made the first time a sprite asks for it.
         *
         * Lit by the 2D lights or not (`lit`, whether the pass has any) is two compiles too, and both
         * are made the first time the effect is seen, so a scene that lights up later finds its
         * effects ready rather than waiting a few frames without them.
         */
        get: (material: TDrawShader, additive = false, lit = true): TCompiled => {
            const key = `${additive ? '+' : ''}${JSON.stringify(material.uniformSig ?? {})} ${material.fragment ?? ''}`;
            let entry = compiled.get((lit ? 'lit ' : 'unlit ') + key);
            if (entry === undefined) {
                const said = { done: false };
                const litEntry = build(material, additive, true, said);
                const unlitEntry = build(material, additive, false, said);
                compiled.set('lit ' + key, litEntry);
                compiled.set('unlit ' + key, unlitEntry);
                entry = lit ? litEntry : unlitEntry;
            }
            return entry;
        },
        /**
         * Takes a slot, fills it with this batch's numbers, and hands back the group that reads them
         * and the material's maps.
         *
         * The numbers are the material's, with the one sprite's own laid over them when it brought
         * any, which is what a property block is. A map is read as smoothly as it says, or as the
         * sheet it is drawn over (`smooth`) when it says nothing.
         */
        bind: (
            entry: TCompiled,
            material: TDrawShader,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
            smooth: boolean,
        ): GPUBindGroup => {
            const uniforms = material.uniforms ?? {};
            // `beginFrame` made room for every batch this frame has, so this cannot run out. If it
            // ever did, the last slot is reused rather than the buffer replaced mid-frame.
            const slot = Math.min(used, capacity - 1);
            used += 1;

            values.fill(0, 0, entry.layout.floatCount);
            writeUniformValues(values, entry.layout, uniforms, time, width, height, overrides);
            device.queue.writeBuffer(
                slots as GPUBuffer,
                slot * FLAT_MATERIAL_STRIDE,
                values.buffer,
                values.byteOffset,
                entry.layout.floatCount * 4,
            );

            const views: GPUTexture[] = [];
            const readers: GPUSampler[] = [];
            const keys: string[] = [];
            // A shader that reads none still has the four slots to fill, with the same white each
            // frame, so there is nothing to look up for it.
            const reads = entry.mapNames.length > 0;
            const kept = slotBindGroups[slot];
            if (!reads && kept !== undefined && kept.key === 'none') {
                return kept.group;
            }
            for (let i = 0; i < MAX_MATERIAL_MAPS; i++) {
                const name = entry.mapNames[i];
                const map = name === undefined ? undefined : material.maps?.[name];
                if (name !== undefined && map === undefined) {
                    const said = `${material.name ?? material.id} ${name}`;
                    if (!warned.has(said)) {
                        warned.add(said);
                        console.warn(`[NacatamalOn] createMaterial: the material "${material.name ?? 'flat material'}" reads the map '${name}' and has none by that name, so it reads as white. Add it to the material's maps.`);
                    }
                }
                const ready = map !== undefined && map.texture.status === 'ready' && map.texture.gpu !== null;
                const view = ready ? toGpuTexture(map.texture.gpu!) : whiteTexture();
                const filter = (map?.smooth ?? smooth) ? 'linear' : 'nearest';
                const { u, v } = textureWrapOf(map ?? {});
                views.push(view);
                readers.push(samplerOf(filter, u, v));
                keys.push(`${idOf(view)} ${wrapKey(filter, u, v)}`);
            }
            const key = reads ? keys.join('|') : 'none';

            let held = slotBindGroups[slot];
            if (held === undefined || held.key !== key) {
                const entries: GPUBindGroupEntry[] = [{
                    binding: 0,
                    resource: {
                        buffer: slots as GPUBuffer,
                        offset: slot * FLAT_MATERIAL_STRIDE,
                        size: FLAT_MATERIAL_STRIDE,
                    },
                }];
                for (let i = 0; i < MAX_MATERIAL_MAPS; i++) {
                    entries.push(
                        { binding: 1 + i * 2, resource: readers[i]! },
                        { binding: 2 + i * 2, resource: views[i]!.createView() },
                    );
                }
                held = {
                    key,
                    group: device.createBindGroup({ label: `flat material slot ${slot}`, layout: materialLayout, entries }),
                };
                slotBindGroups[slot] = held;
            }
            return held.group;
        },
        /**
         * Which group number the parameters are bound at, so the draw and the shader agree.
         */
        group: kind.shared.length,
        destroy: (): void => {
            slots?.destroy();
            slots = null;
            slotBindGroups = [];
            capacity = 0;
            white?.destroy();
            white = null;
            samplers.clear();
        },
    };
};

/**
 * Everything a game keeps for its sprite effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFlatMaterials = ReturnType<typeof createFlatMaterials>;

export type { TCompiled as TCompiledFlatMaterial };

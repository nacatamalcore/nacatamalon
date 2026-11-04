import { spriteSize } from '../../render/shared/sprite_size';
import { spriteUvWindow } from '../../render/shared/sprite_uv';
import { spriteRepeat } from '../../render/shared/sprite_repeat';
import { pivotPlace } from '../../render/shared/pivot_place';
import { worldOf } from '../../render/shared/world_of';
import { TILE_CORNER_FLOATS } from '../../render/shared/tile_corner';
import { PARTICLE_FLOATS, PARTICLE_OFFSET } from '../../render/shared/particle_instance';
import { DISTANCE_FIELD_RANGE } from '../../render/shared/distance_field';
import { isAway } from '../../loaders/texture/is_away';
import { blend, coverTriangle, offTheSeam, sample } from './raster';
import type { TBlend, TBounds, TCorner, TPicture, TRgba } from './raster';
import type { TColor } from '../../color';
import type { IBuffer } from '../../render/interface/i_buffer';
import type { ITexture } from '../../render/interface/i_texture';
import type { TFrameContext, TRenderPass } from '../../render/interface/t_frame_context';
import type { TDrawCamera2d } from '../../render/interface/draw/t_draw_camera_2d';
import type { TDrawParticles } from '../../render/interface/draw/t_draw_particles';
import type { TDrawSprite } from '../../render/interface/draw/t_draw_sprite';
import type { TDrawStencil } from '../../render/interface/draw/t_draw_stencil';
import type { TDrawTexture } from '../../render/interface/draw/t_draw_texture';
import type { TDrawTilemapLayer } from '../../render/interface/draw/t_draw_tilemap_layer';

/**
 * What a frame is painted from: the pictures and the buffers the game handed the renderer, by the
 * handle it was given back, and what a sprite reads as smooth when it does not say.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPaintStore = {
    pictures: WeakMap<ITexture, TPicture>;
    buffers: WeakMap<IBuffer, Float32Array | Uint16Array | Uint32Array>;
    smooth: boolean;
    background: TColor;
};

/**
 * Painting a frame, what it left out and the picture of the screen.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPainted = {
    screen: TPicture;
    /** What the card would have drawn and this did not, said once in words. */
    notDrawn: Set<string>;
};

/** Slots a pass's cameras sit in, as the cards keep them: 0 is the screen, the rest one camera each. */
const MOST_VIEWS = 16;
const CENTRE = { x: 0.5, y: 0.5 };
const WHITE: TPicture = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const;

/**
 * Where a point of the world lands on the target through the camera in `slot`, as the cards' vertex
 * step places it: turned against the camera, then grown by its zoom. Slot 0 is the screen itself.
 */
const toTarget = (cameras: readonly TDrawCamera2d[], slot: number, x: number, y: number): TCorner => {
    const camera = slot > 0 ? cameras[slot - 1] : undefined;
    if (camera === undefined) {
        return { x, y };
    }
    const dx = x - camera.transform.x;
    const dy = y - camera.transform.y;
    const c = Math.cos(-camera.transform.rotation);
    const s = Math.sin(-camera.transform.rotation);
    return { x: (dx * c - dy * s) * camera.zoom, y: (dx * s + dy * c) * camera.zoom };
};

const slotOf = (camera: number): number => (camera >= 0 && camera < MOST_VIEWS - 1 ? camera + 1 : 0);

/**
 * One pass being painted: where it goes, its stencil and its box, and what each pixel test asks.
 */
type TTarget = {
    picture: TPicture;
    stencil: Uint8Array | null;
    bounds: TBounds;
    cameras: readonly TDrawCamera2d[];
    /** The state of the entry being drawn: `null` for a pass where nothing is masked. */
    state: TDrawStencil | null;
};

const boundsFor = (picture: TPicture, state: TDrawStencil | null): TBounds => {
    const box = state?.scissor ?? null;
    if (box === null) {
        return { left: 0, top: 0, right: picture.width, bottom: picture.height };
    }
    const left = Math.min(picture.width, Math.max(0, Math.round(box.x)));
    const top = Math.min(picture.height, Math.max(0, Math.round(box.y)));
    return {
        left,
        top,
        right: Math.min(picture.width, Math.max(left, Math.round(box.x + box.width))),
        bottom: Math.min(picture.height, Math.max(top, Math.round(box.y + box.height))),
    };
};

/**
 * Whether the pixel at `index` may be drawn on under the entry's state, the stencil test a card
 * runs: equal to `ref` to draw or to write a mask's shape, above it for a reset.
 */
const passes = (target: TTarget, index: number): boolean => {
    const { stencil, state } = target;
    if (stencil === null || state === null) {
        return true;
    }
    return state.write === 'reset' ? state.ref < stencil[index]! : stencil[index] === state.ref;
};

/**
 * What a mask's shape does to the stencil where it covers, by its state: one more mask letting the
 * pixel through, one fewer, or back to the level it is reset to.
 */
const writeStencil = (target: TTarget, index: number): void => {
    const { stencil, state } = target;
    if (stencil === null || state === null) {
        return;
    }
    if (state.write === 'add') {
        stencil[index] = Math.min(255, stencil[index]! + 1);
    } else if (state.write === 'sub') {
        stencil[index] = Math.max(0, stencil[index]! - 1);
    } else if (state.write === 'reset') {
        stencil[index] = state.ref;
    }
};

const writesMask = (target: TTarget): boolean => target.state !== null && target.state.write !== 'none';

/**
 * Lays `color` over a pixel, or, when the entry is a mask's shape, counts the pixel into the
 * stencil when `value` says the shape covers it (at least half there).
 */
const put = (target: TTarget, x: number, y: number, color: TRgba, how: TBlend, value: number): void => {
    const index = y * target.picture.width + x;
    if (!passes(target, index)) {
        return;
    }
    if (writesMask(target)) {
        if (value >= 0.5) {
            writeStencil(target, index);
        }
        return;
    }
    blend(target.picture.data, index * 4, color, how);
};

/**
 * The picture a draw reads from: the one behind the texture, white for one with no picture yet (as
 * the cards draw it), or `undefined` for one that is on its way or let go, which is not drawn.
 */
const pictureOf = (texture: TDrawTexture | null, store: TPaintStore, notDrawn: Set<string>): TPicture | undefined => {
    if (isAway(texture)) {
        return undefined;
    }
    if (texture === null || texture.status !== 'ready' || texture.gpu === null) {
        return WHITE;
    }
    const picture = store.pictures.get(texture.gpu);
    if (picture === undefined) {
        notDrawn.add('a picture that is not a PNG (only PNG pictures are read without a browser)');
    }
    return picture;
};

const coverageOfField = (sampled: TRgba, picture: TPicture, fwidthU: number, fwidthV: number): number => {
    const [r, g, b] = sampled;
    const distance = Math.max(Math.min(r, g), Math.min(Math.max(r, g), b)) - 0.5;
    const unitU = DISTANCE_FIELD_RANGE / picture.width;
    const unitV = DISTANCE_FIELD_RANGE / picture.height;
    // A letter drawn at no size at all moves its read by nothing from one pixel to the next: its
    // edge is then as sharp as it can be.
    const across = (fwidthU > 0 ? unitU / fwidthU : 1e6) + (fwidthV > 0 ? unitV / fwidthV : 1e6);
    const range = Math.max(0.5 * across, 1);
    return Math.min(1, Math.max(0, distance * range + 0.5));
};

const texel: TRgba = [0, 0, 0, 0];
const color: TRgba = [0, 0, 0, 0];

/**
 * A sprite, as the cards place it (the corner step of their sprite shader) and read it (its window,
 * its repeat, the nudge off a seam): a text's letters and a panel's pieces come here too.
 */
const paintSprite = (target: TTarget, item: TDrawSprite, camera: number, store: TPaintStore, notDrawn: Set<string>): void => {
    const picture = pictureOf(item.texture, store, notDrawn);
    if (picture === undefined) {
        return;
    }
    if (item.material !== undefined) {
        notDrawn.add('a material of its own on a sprite or a map layer (drawn as if it had none)');
    }
    const size = spriteSize(item);
    const place = pivotPlace(worldOf(item), item, item.anchor ?? CENTRE, size.width, size.height, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const anchor = item.pivot ?? item.anchor ?? CENTRE;
    const window = spriteUvWindow(item);
    const repeat = spriteRepeat(item);
    const repeats = repeat.tilesX !== 1 || repeat.tilesY !== 1 || repeat.shiftX !== 0 || repeat.shiftY !== 0;
    const smooth = item.smooth ?? store.smooth;
    const field = item.distanceField === true;
    const how: TBlend = item.blend === 'additive' ? 'additive' : 'alpha';
    const slot = slotOf(camera);
    const c = Math.cos(place.rotation);
    const s = Math.sin(place.rotation);

    // The four corners, each 0 or 1 across the sprite, where they land and what they read.
    const corner = (across: number, down: number): TCorner & { u: number; v: number } => {
        const lx = (across - anchor.x) * size.width * place.scaleX;
        const ly = (down - anchor.y) * size.height * place.scaleY;
        const at = toTarget(target.cameras, slot, place.x + lx * c - ly * s, place.y + lx * s + ly * c);
        return {
            ...at,
            u: (across * repeat.tilesX + repeat.shiftX) * window.scaleX + window.offsetX,
            v: (down * repeat.tilesY + repeat.shiftY) * window.scaleY + window.offsetY,
        };
    };
    const corners = [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)] as const;

    const lowU = Math.min(window.offsetX, window.offsetX + window.scaleX);
    const highU = Math.max(window.offsetX, window.offsetX + window.scaleX);
    const lowV = Math.min(window.offsetY, window.offsetY + window.scaleY);
    const highV = Math.max(window.offsetY, window.offsetY + window.scaleY);
    const halfU = 0.5 / picture.width;
    const halfV = 0.5 / picture.height;
    const spanU = highU - lowU;
    const spanV = highV - lowV;

    // How much the read moves from one pixel to the next, which a distance field's edge is measured
    // by (the card's `fwidth`): the same everywhere on a flat square.
    const [p0, p1, p2] = corners;
    const det = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    const dudx = det === 0 ? 0 : ((p1.u - p0.u) * (p2.y - p0.y) - (p2.u - p0.u) * (p1.y - p0.y)) / det;
    const dudy = det === 0 ? 0 : ((p2.u - p0.u) * (p1.x - p0.x) - (p1.u - p0.u) * (p2.x - p0.x)) / det;
    const dvdx = det === 0 ? 0 : ((p1.v - p0.v) * (p2.y - p0.y) - (p2.v - p0.v) * (p1.y - p0.y)) / det;
    const dvdy = det === 0 ? 0 : ((p2.v - p0.v) * (p1.x - p0.x) - (p1.v - p0.v) * (p2.x - p0.x)) / det;
    const fwidthU = Math.abs(dudx) + Math.abs(dudy);
    const fwidthV = Math.abs(dvdx) + Math.abs(dvdy);

    const tint = item.tint;
    const mask = target.state;
    const reading = field ? 'field' : mask?.channel ?? 'alpha';

    const shade = (x: number, y: number, a: typeof p0, b: typeof p0, d: typeof p0, wa: number, wb: number, wd: number): void => {
        let u = a.u * wa + b.u * wb + d.u * wd;
        let v = a.v * wa + b.v * wb + d.v * wd;
        if (repeats && spanU > 0 && spanV > 0) {
            u = lowU + (u - lowU) - Math.floor((u - lowU) / spanU) * spanU;
            v = lowV + (v - lowV) - Math.floor((v - lowV) / spanV) * spanV;
        }
        u = offTheSeam(u, picture.width);
        v = offTheSeam(v, picture.height);
        u = Math.min(Math.max(u, lowU + halfU), Math.max(lowU + halfU, highU - halfU));
        v = Math.min(Math.max(v, lowV + halfV), Math.max(lowV + halfV, highV - halfV));
        sample(picture, u, v, smooth, texel);
        let value: number;
        if (field) {
            const coverage = coverageOfField(texel, picture, fwidthU, fwidthV);
            color[0] = tint.r; color[1] = tint.g; color[2] = tint.b; color[3] = tint.a * coverage;
            value = tint.a * coverage;
        } else {
            color[0] = texel[0] * tint.r; color[1] = texel[1] * tint.g; color[2] = texel[2] * tint.b; color[3] = texel[3] * tint.a;
            value = texel[3] * tint.a;
            if (reading === 'luminance') {
                value *= texel[0] * tint.r * LUMINANCE[0] + texel[1] * tint.g * LUMINANCE[1] + texel[2] * tint.b * LUMINANCE[2];
            }
        }
        put(target, x, y, color, how, value);
    };

    coverTriangle(corners[0], corners[1], corners[2], target.bounds, (x, y, wa, wb, wc) => shade(x, y, corners[0], corners[1], corners[2], wa, wb, wc));
    coverTriangle(corners[1], corners[3], corners[2], target.bounds, (x, y, wa, wb, wc) => shade(x, y, corners[1], corners[3], corners[2], wa, wb, wc));
};

/**
 * A layer of a map, and with it every shape and outline drawn as one: its triangles as they are in
 * its buffers, placed by the layer, each reading inside the window its corners carry.
 */
const paintLayer = (target: TTarget, item: TDrawTilemapLayer, camera: number, store: TPaintStore, notDrawn: Set<string>): void => {
    const texture = item.texture;
    if (texture === null || texture.status !== 'ready' || texture.gpu === null) {
        return;
    }
    const picture = store.pictures.get(texture.gpu);
    if (picture === undefined) {
        notDrawn.add('a picture that is not a PNG (only PNG pictures are read without a browser)');
        return;
    }
    if (item.material !== undefined) {
        notDrawn.add('a material of its own on a sprite or a map layer (drawn as if it had none)');
    }
    const place = worldOf(item);
    const c = Math.cos(place.rotation);
    const s = Math.sin(place.rotation);
    const slot = slotOf(camera);
    const smooth = item.smooth ?? store.smooth;
    const tint = item.tint;
    const luminance = target.state?.channel === 'luminance';

    for (const mesh of item.meshes) {
        if (mesh.buffer === null || mesh.vertexCount === 0) {
            continue;
        }
        const data = store.buffers.get(mesh.buffer);
        if (data === undefined) {
            continue;
        }
        const corner = (i: number): TCorner & { u: number; v: number; at: number } => {
            const at = i * TILE_CORNER_FLOATS;
            const sx = data[at]! * place.scaleX;
            const sy = data[at + 1]! * place.scaleY;
            return { ...toTarget(target.cameras, slot, place.x + sx * c - sy * s, place.y + sx * s + sy * c), u: data[at + 2]!, v: data[at + 3]!, at };
        };
        const count = Math.min(mesh.vertexCount, Math.floor(data.length / TILE_CORNER_FLOATS));
        for (let i = 0; i + 2 < count; i += 3) {
            const a = corner(i), b = corner(i + 1), d = corner(i + 2);
            // The window is the same on every corner of a cell: read from the first.
            const wl = data[a.at + 4]!, wt = data[a.at + 5]!, wr = data[a.at + 6]!, wbm = data[a.at + 7]!;
            coverTriangle(a, b, d, target.bounds, (x, y, ka, kb, kd) => {
                const u = Math.min(Math.max(a.u * ka + b.u * kb + d.u * kd, wl), wr);
                const v = Math.min(Math.max(a.v * ka + b.v * kb + d.v * kd, wt), wbm);
                sample(picture, u, v, smooth, texel);
                color[0] = texel[0] * tint.r; color[1] = texel[1] * tint.g; color[2] = texel[2] * tint.b; color[3] = texel[3] * tint.a;
                const value = luminance
                    ? (color[0] * LUMINANCE[0] + color[1] * LUMINANCE[1] + color[2] * LUMINANCE[2]) * color[3]
                    : color[3];
                put(target, x, y, color, 'alpha', value);
            });
        }
    }
};

/**
 * An emitter's particles, each a turned square read inside its window, and then everything its
 * particles set off, as the cards draw them.
 */
const paintParticles = (target: TTarget, item: TDrawParticles, store: TPaintStore, notDrawn: Set<string>): void => {
    const texture = item.texture;
    const ready = texture !== null && texture.status === 'ready' && texture.gpu !== null;
    const picture = ready ? store.pictures.get(texture.gpu!) : WHITE;
    if (picture === undefined) {
        notDrawn.add('a picture that is not a PNG (only PNG pictures are read without a browser)');
    }
    if (picture !== undefined && item.count > 0 && !writesMask(target)) {
        const smooth = item.smooth ?? store.smooth;
        const how: TBlend = item.blend === 'additive' ? 'additive' : 'alpha';
        const halfU = 0.5 / picture.width;
        const halfV = 0.5 / picture.height;
        const data = item.instances;
        for (let p = 0; p < item.count; p++) {
            const o = p * PARTICLE_FLOATS;
            const size = data[o + PARTICLE_OFFSET.size]!;
            const rotation = data[o + PARTICLE_OFFSET.rotation]!;
            const slot = data[o + PARTICLE_OFFSET.view]!;
            const px = data[o + PARTICLE_OFFSET.x]!;
            const py = data[o + PARTICLE_OFFSET.y]!;
            const wu = data[o + PARTICLE_OFFSET.window]!, wv = data[o + PARTICLE_OFFSET.window + 1]!;
            const ww = data[o + PARTICLE_OFFSET.window + 2]!, wh = data[o + PARTICLE_OFFSET.window + 3]!;
            const r = data[o + PARTICLE_OFFSET.r]!, g = data[o + PARTICLE_OFFSET.g]!, b = data[o + PARTICLE_OFFSET.b]!, a = data[o + PARTICLE_OFFSET.a]!;
            const c = Math.cos(rotation);
            const s = Math.sin(rotation);
            const corner = (across: number, down: number): TCorner & { u: number; v: number } => {
                const lx = (across - 0.5) * size;
                const ly = (down - 0.5) * size;
                return { ...toTarget(target.cameras, Math.round(slot), px + lx * c - ly * s, py + lx * s + ly * c), u: wu + across * ww, v: wv + down * wh };
            };
            const corners = [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)] as const;
            const lowU = wu + halfU, highU = Math.max(lowU, wu + ww - halfU);
            const lowV = wv + halfV, highV = Math.max(lowV, wv + wh - halfV);
            const shade = (x: number, y: number, q: readonly [typeof corners[0], typeof corners[0], typeof corners[0]], ka: number, kb: number, kc: number): void => {
                const u = Math.min(Math.max(offTheSeam(q[0].u * ka + q[1].u * kb + q[2].u * kc, picture.width), lowU), highU);
                const v = Math.min(Math.max(offTheSeam(q[0].v * ka + q[1].v * kb + q[2].v * kc, picture.height), lowV), highV);
                sample(picture, u, v, smooth, texel);
                color[0] = texel[0] * r; color[1] = texel[1] * g; color[2] = texel[2] * b; color[3] = texel[3] * a;
                put(target, x, y, color, how, color[3]);
            };
            const first = [corners[0], corners[1], corners[2]] as const;
            const second = [corners[1], corners[3], corners[2]] as const;
            coverTriangle(first[0], first[1], first[2], target.bounds, (x, y, ka, kb, kc) => shade(x, y, first, ka, kb, kc));
            coverTriangle(second[0], second[1], second[2], target.bounds, (x, y, ka, kb, kc) => shade(x, y, second, ka, kb, kc));
        }
    }
    for (const child of item.children ?? []) {
        paintParticles(target, child, store, notDrawn);
    }
};

/**
 * Lays a picture drawn before over the pass, its colour already times its alpha: a soft mask's
 * content as much as its shape lets through, or a filter's part over its rectangle.
 */
const layOver = (target: TTarget, picture: TPicture, left: number, top: number, through: ((x: number, y: number) => number) | null): void => {
    // A picture nothing was drawn into lays nothing over the pass.
    if (picture.data.length < picture.width * picture.height * 4) {
        return;
    }
    const { bounds } = target;
    for (let y = 0; y < picture.height; y++) {
        const ty = top + y;
        if (ty < bounds.top || ty >= bounds.bottom) continue;
        for (let x = 0; x < picture.width; x++) {
            const tx = left + x;
            if (tx < bounds.left || tx >= bounds.right) continue;
            const at = (y * picture.width + x) * 4;
            const k = through === null ? 1 : through(x, y);
            color[0] = (picture.data[at]! / 255) * k;
            color[1] = (picture.data[at + 1]! / 255) * k;
            color[2] = (picture.data[at + 2]! / 255) * k;
            color[3] = (picture.data[at + 3]! / 255) * k;
            const index = ty * target.picture.width + tx;
            if (passes(target, index)) {
                blend(target.picture.data, index * 4, color, 'premultiplied');
            }
        }
    }
};

const clear = (picture: TPicture, color: TColor): void => {
    const r = Math.round(Math.min(1, Math.max(0, color.r)) * 255);
    const g = Math.round(Math.min(1, Math.max(0, color.g)) * 255);
    const b = Math.round(Math.min(1, Math.max(0, color.b)) * 255);
    const a = Math.round(Math.min(1, Math.max(0, color.a)) * 255);
    for (let at = 0; at < picture.data.length; at += 4) {
        picture.data[at] = r;
        picture.data[at + 1] = g;
        picture.data[at + 2] = b;
        picture.data[at + 3] = a;
    }
};

/**
 * Paints one pass into its picture, in the order its entries come, as the card's frame does.
 */
const paintPass = (pass: TRenderPass, picture: TPicture, clearColor: TColor, store: TPaintStore, notDrawn: Set<string>): void => {
    clear(picture, pass.clearColor ?? clearColor);
    const drawables = pass.drawables ?? [];
    const cameraIndex = pass.cameraIndex ?? [];
    const stencilStates = pass.stencil ?? null;
    const target: TTarget = {
        picture,
        stencil: stencilStates === null ? null : new Uint8Array(picture.width * picture.height),
        bounds: { left: 0, top: 0, right: picture.width, bottom: picture.height },
        cameras: pass.cameras ?? [],
        state: null,
    };
    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i]!;
        target.state = stencilStates?.[i] ?? null;
        target.bounds = boundsFor(picture, target.state);
        switch (item.type) {
            case 'sprite':
                paintSprite(target, item, cameraIndex[i] ?? -1, store, notDrawn);
                break;
            case 'tilemap':
                paintLayer(target, item, cameraIndex[i] ?? -1, store, notDrawn);
                break;
            case 'particles':
                paintParticles(target, item, store, notDrawn);
                break;
            case 'mask-layer': {
                const content = store.pictures.get(item.content);
                const shape = store.pictures.get(item.shape);
                if (content !== undefined && shape !== undefined) {
                    layOver(target, content, 0, 0, (x, y) => {
                        if (x >= shape.width || y >= shape.height || shape.data.length < shape.width * shape.height * 4) {
                            return item.invert ? 1 : 0;
                        }
                        const at = (y * shape.width + x) * 4;
                        const through = item.channel === 'luminance'
                            ? (shape.data[at]! * LUMINANCE[0] + shape.data[at + 1]! * LUMINANCE[1] + shape.data[at + 2]! * LUMINANCE[2]) / 255
                            : shape.data[at + 3]! / 255;
                        const k = item.invert ? 1 - through : through;
                        return Math.min(1, Math.max(0, k));
                    });
                }
                break;
            }
            case 'filter-layer': {
                const content = store.pictures.get(item.picture);
                if (content !== undefined) {
                    layOver(target, content, Math.round(item.x), Math.round(item.y), null);
                }
                break;
            }
            case 'mesh':
            case 'lines':
            case 'particles-3d':
                notDrawn.add('3D (models, lines and particles in depth)');
                break;
            default: {
                const missing: never = item;
                notDrawn.add(`a '${(missing as { type: string }).type}'`);
            }
        }
    }
};

/**
 * Paints a frame the way the cards would have, pass by pass, into pictures in memory, and gives
 * back the screen's: every pass into a picture of its own first (a view, a filter's part), so what
 * shows them reads them as they were just drawn.
 *
 * What only a card can do is left out and said: 3D, a material's own shader, the screen's effects
 * and a filter's (its part is laid back as it was drawn, without them).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const paintFrame = (ctx: TFrameContext, width: number, height: number, store: TPaintStore): TPainted => {
    const notDrawn = new Set<string>();
    const screen: TPicture = { width, height, data: new Uint8Array(width * height * 4) };
    clear(screen, store.background);
    for (const pass of ctx.passes) {
        if (pass.renderTarget === undefined && pass.targetCanvas !== undefined) {
            // Another canvas (an editor's preview), which is not the game's screen.
            continue;
        }
        const picture = pass.renderTarget === undefined ? screen : store.pictures.get(pass.renderTarget);
        if (picture === undefined) {
            continue;
        }
        if (picture.data.length !== picture.width * picture.height * 4) {
            picture.data = new Uint8Array(picture.width * picture.height * 4);
        }
        // A pass that does not say is cleared to the game's background, a picture's as the screen's,
        // as the cards do.
        paintPass(pass, picture, store.background, store, notDrawn);
        if (pass.filter !== undefined) {
            // The effects a filter runs are a card's; what it filters is laid back without them.
            notDrawn.add("a filter's effects (what it filters is drawn without them)");
            const into = store.pictures.get(pass.filter.into);
            if (into !== undefined) {
                if (into.data.length !== into.width * into.height * 4) {
                    into.data = new Uint8Array(into.width * into.height * 4);
                }
                const { region } = pass.filter;
                const left = Math.round(region.x);
                const top = Math.round(region.y);
                for (let y = 0; y < into.height; y++) {
                    for (let x = 0; x < into.width; x++) {
                        const sx = left + x;
                        const sy = top + y;
                        const to = (y * into.width + x) * 4;
                        if (sx < 0 || sy < 0 || sx >= picture.width || sy >= picture.height) {
                            into.data.fill(0, to, to + 4);
                            continue;
                        }
                        into.data.set(picture.data.subarray((sy * picture.width + sx) * 4, (sy * picture.width + sx) * 4 + 4), to);
                    }
                }
            }
        }
        // On whichever pass asks for them: the screen's, or a picture the game takes of itself.
        if (pass.postProcess === true && (ctx.post?.length ?? 0) > 0) {
            const names = ctx.post!.map((effect) => effect.name).filter((name): name is string => name !== null);
            notDrawn.add(`the screen's post effects${names.length > 0 ? ` (${names.join(', ')})` : ''}`);
        }
    }
    return { screen, notDrawn };
};

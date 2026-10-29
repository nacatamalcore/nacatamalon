// everyframe
import { MAX_VIEWS } from '../sprite/write_sprite_instances';
import { toGlBuffer } from '../resources';
import { toGlTexture } from '../texture';
import type { TDrawTilemapLayer } from '../../interface';
import type { TTilemapPipeline } from './types/t_tilemap_pipeline';
import { worldOf } from '../../shared/world_of';
import { tileRuns } from '../../shared/tile_runs';
import { sightOf } from '../../shared/sight_2d';
import type { TDrawCamera2d } from '../../interface';
import { TILE_CORNER_BYTES } from '../../shared/tile_corner';

/**
 * Bytes of one corner: where it is, which point of the sheet it shows, and its cell's window.
 */
const VERTEX_STRIDE = TILE_CORNER_BYTES;

/**
 * Draws one layer of a map: one call per mesh it holds, whatever its number of cells.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawTilemapLayer = (
    gl: WebGL2RenderingContext,
    tilemaps: TTilemapPipeline,
    layer: TDrawTilemapLayer,
    camera: number,
    time: number,
    width: number,
    height: number,
    mask: { program: WebGLProgram; uniforms: TTilemapPipeline['uniforms'] } | null = null,
    cameras: readonly TDrawCamera2d[] | null = null,
): void => {
    // Not drawn until the sheet is there, exactly like a sprite.
    const texture = layer.texture;
    if (texture === null || texture.status !== 'ready' || texture.gpu === null) {
        return;
    }
    const glTexture = toGlTexture(texture.gpu);
    if (glTexture === null) {
        return;
    }

    // An effect of its own runs a different program over the same cells, and brings its own places
    // to keep a layer's numbers, because on this card those are loose uniforms rather than a block.
    // A mask's shape is only its cells, so it is written without the layer's effect.
    const material = mask !== null ? null : layer.material ?? null;
    let effect: ReturnType<TTilemapPipeline['materials']['get']> | null = null;
    if (material !== null && material.fragment !== null) {
        tilemaps.materials.warnIfWgpuOnly(material);
        if (material.fragmentGlsl !== null) {
            const compiled = tilemaps.materials.get(material);
            if (!compiled.failed && compiled.program !== null) {
                effect = compiled;
            }
        }
    }
    const places = mask !== null ? mask.uniforms : effect !== null ? effect.locations : tilemaps.uniforms;

    gl.useProgram(mask !== null ? mask.program : effect !== null ? effect.program! : tilemaps.program);
    gl.bindVertexArray(tilemaps.vao);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Where the map ends up, not where it says it is: a box above it may have moved it.
    const transform = worldOf(layer);
    gl.uniform2f(places.position, transform.x, transform.y);
    gl.uniform2f(places.scale, transform.scaleX, transform.scaleY);
    gl.uniform1f(places.rotation, transform.rotation);
    // Slot 0 of the views is the screen, so camera `c` is in slot `c + 1`: the same rule the sprites
    // follow, because they look through the same table.
    gl.uniform1f(places.view, camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0);
    gl.uniform4f(places.tint, layer.tint.r, layer.tint.g, layer.tint.b, layer.tint.a);

    if (effect !== null) {
        tilemaps.materials.bind(effect, material!.uniforms ?? {}, layer.uniforms ?? null, time, width, height);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.bindSampler(0, (layer.smooth ?? tilemaps.defaultSmooth) ? tilemaps.samplers.linear : tilemaps.samplers.nearest);

    for (const mesh of layer.meshes) {
        if (mesh.buffer === null || mesh.vertexCount === 0) {
            continue;
        }
        // Only the rows of cells the camera shows, as few draws as there are stretches of them. The
        // camera the shader places it by: one past what it holds draws through the screen.
        const seenBy = camera >= 0 && camera < MAX_VIEWS - 1 ? cameras?.[camera] ?? null : null;
        const runs = cameras !== null && mesh.grid != null ? tileRuns(mesh.grid, worldOf(layer), sightOf(seenBy, width, height)) : null;
        if (runs !== null && runs.length === 0) {
            continue;
        }
        // The corners are in the layer's own buffer, so the array is pointed at it here.
        gl.bindBuffer(gl.ARRAY_BUFFER, toGlBuffer(mesh.buffer));
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, VERTEX_STRIDE, 0);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, VERTEX_STRIDE, 8);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, VERTEX_STRIDE, 16);
        if (runs === null) {
            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
            continue;
        }
        for (let r = 0; r < runs.length; r += 2) {
            gl.drawArrays(gl.TRIANGLES, runs[r], runs[r + 1]);
        }
    }

    gl.bindVertexArray(null);
};

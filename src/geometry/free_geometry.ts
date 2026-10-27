import type { IRenderer } from '../render/interface';
import type { TGeometry } from './types/t_geometry';

/**
 * Gives the card back every buffer a shape holds and leaves it with nothing to draw, so a mesh still
 * wearing it draws nothing rather than reading memory that is gone.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const freeGeometryBuffers = (renderer: IRenderer, geometry: TGeometry): void => {
    for (const buffer of [geometry.vertexBuffer, geometry.indexBuffer, geometry.colorBuffer, geometry.detailBuffer, geometry.skinBuffer]) {
        if (buffer !== null) {
            renderer.destroyBuffer(buffer);
        }
    }
    geometry.vertexBuffer = null;
    geometry.indexBuffer = null;
    geometry.colorBuffer = null;
    geometry.detailBuffer = null;
    geometry.skinBuffer = null;
    geometry.indexCount = 0;
    geometry.vertexCount = 0;
};

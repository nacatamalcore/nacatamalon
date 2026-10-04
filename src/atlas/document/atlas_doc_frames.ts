import type { TAtlasDoc, TAtlasDocFrame, TAtlasGridSpec, TAtlasPixelRect } from './types/t_atlas_doc';

/**
 * Every cell of a grid, row by row, measured against an image of this size.
 */
const gridFrames = (grid: TAtlasGridSpec, width: number, height: number): TAtlasDocFrame[] => {
    const margin = grid.margin ?? 0;
    const spacing = grid.spacing ?? 0;

    // Whichever of the cell size and the count was left out, from the other.
    const cellWidth = grid.frameWidth ?? (grid.columns ? (width - 2 * margin - spacing * (grid.columns - 1)) / grid.columns : undefined);
    const cellHeight = grid.frameHeight ?? (grid.rows ? (height - 2 * margin - spacing * (grid.rows - 1)) / grid.rows : undefined);
    if (!cellWidth || !cellHeight) {
        throw new Error('[NacatamalOn] atlasDocFrames: a grid needs frameWidth and frameHeight, or columns and rows.');
    }

    // Down, not to the nearest: a strip left over at the edge is not a frame.
    const columns = grid.columns ?? Math.max(1, Math.floor((width - 2 * margin + spacing) / (cellWidth + spacing)));
    const rows = grid.rows ?? Math.max(1, Math.floor((height - 2 * margin + spacing) / (cellHeight + spacing)));
    const total = grid.count ?? columns * rows;

    const frames: TAtlasDocFrame[] = [];
    for (let i = 0; i < total; i++) {
        const x = margin + (i % columns) * (cellWidth + spacing);
        const y = margin + Math.floor(i / columns) * (cellHeight + spacing);
        frames.push({
            uvOffset: { x: x / width, y: y / height },
            uvScale: { x: cellWidth / width, y: cellHeight / height },
            width: cellWidth,
            height: cellHeight,
        });
    }
    return frames;
};

/**
 * Every rectangle of a packed sheet, numbered in the order the file lists them.
 */
const packedFrames = (packed: Record<string, TAtlasPixelRect>, width: number, height: number): TAtlasDocFrame[] =>
    Object.entries(packed).map(([name, rect]) => ({
        name,
        uvOffset: { x: rect.x / width, y: rect.y / height },
        uvScale: { x: rect.w / width, y: rect.h / height },
        width: rect.w,
        height: rect.h,
    }));

/**
 * Cuts an image of `width` by `height` pixels the way an atlas document says: every frame, in the
 * order they are numbered.
 *
 * The one cut there is. The engine loading a sheet and a tool drawing the cut over the image both
 * come here, so what an editor shows as frame 5 is the frame a sprite asking for 5 gets.
 *
 * @param doc The atlas.
 * @param width The image's width in pixels.
 * @param height The image's height in pixels.
 * @throws When a grid says neither its cell size nor its count.
 * @returns Every frame, in the order they are numbered.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const atlasDocFrames = (doc: TAtlasDoc, width: number, height: number): TAtlasDocFrame[] =>
    doc.grid !== undefined ? gridFrames(doc.grid, width, height) : packedFrames(doc.packed ?? {}, width, height);

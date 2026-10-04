import { TILEMAP_FORMAT } from './types/t_tilemap_doc';
import type { TTilemapDoc } from './types/t_tilemap_doc';

/**
 * Writes a map back out as the text of a `.tilemap` file, for a tool that saves one.
 *
 * Each layer's cells go on **one line**. Indenting them the ordinary way would put every one of a
 * few thousand cells on a line of its own: a file nobody can read and a change nobody can review.
 * Everything else stays indented, so what a person does edit by hand (the table of tiles, the names
 * of the layers) stays readable.
 * @param doc - The map to write.
 * @returns The file's text.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeTilemapDoc = (doc: TTilemapDoc): string => {
    const layers = doc.layers.map((layer) =>
        `        { "name": ${JSON.stringify(layer.name)}, "order": ${JSON.stringify(layer.order)}, "data": [${layer.data.join(',')}] }`);

    const head = JSON.stringify({
        format: TILEMAP_FORMAT,
        kind: 'tilemap',
        atlas: doc.atlas,
        cell: doc.cell,
        width: doc.width,
        height: doc.height,
        tiles: doc.tiles,
    }, null, 4);

    // The layers go in by hand where the head closes: its last brace comes off, the layers go on,
    // and it closes again.
    return `${head.slice(0, -2)},\n    "layers": [\n${layers.join(',\n')}\n    ]\n}\n`;
};

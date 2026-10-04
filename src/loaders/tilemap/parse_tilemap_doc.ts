import { TILEMAP_FORMAT } from './types/t_tilemap_doc';
import type { TTileDoc, TTilemapDoc, TTilemapLayerDoc, TTileLayerOrder } from './types/t_tilemap_doc';

/**
 * Reads a `.tilemap` file and says what is wrong with it, naming the file.
 *
 * It throws where the project parser forgives, and the difference is who is looking: a project file
 * is settings, and a game with a silly window size should still run. A map is **content**, and a map
 * with a layer half the size of its grid cannot be drawn at all. Better to fail here, while the
 * author is looking at that file, than to read past the end of an array three layers down inside a
 * mesh builder.
 *
 * @param src Where the file came from, only so the message can say it.
 * @param value - The file, as `JSON.parse` left it.
 * @returns The map, checked.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseTilemapDoc = (value: unknown, src: string): TTilemapDoc => {
    const fail = (why: string): never => {
        throw new Error(`[NacatamalOn] '${src}' is not a map that can be drawn: ${why}`);
    };

    if (typeof value !== 'object' || value === null) {
        return fail('it is not an object.');
    }
    const raw = value as Record<string, unknown>;

    if (raw.kind !== 'tilemap') {
        return fail(`its kind is '${String(raw.kind)}' and not 'tilemap'.`);
    }
    if (typeof raw.format !== 'number' || raw.format > TILEMAP_FORMAT) {
        return fail(`it was written in format ${String(raw.format)} and this engine reads ${TILEMAP_FORMAT}.`);
    }
    if (typeof raw.atlas !== 'string' || raw.atlas.length === 0) {
        return fail('it does not say which atlas its tiles come from.');
    }

    const size = (field: string): number => {
        const number = raw[field];
        if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) {
            return fail(`its ${field} is '${String(number)}'.`);
        }
        return Math.floor(number);
    };
    const cell = size('cell');
    const width = size('width');
    const height = size('height');

    const tiles: Record<number, TTileDoc> = {};
    const rawTiles = typeof raw.tiles === 'object' && raw.tiles !== null ? raw.tiles as Record<string, unknown> : {};
    for (const [key, entry] of Object.entries(rawTiles)) {
        const id = Number(key);
        if (!Number.isInteger(id) || id <= 0) {
            return fail(`'${key}' is not a tile id. They are whole numbers above zero, and 0 is always empty.`);
        }
        if (typeof entry !== 'object' || entry === null) {
            return fail(`tile ${id} is not an object.`);
        }
        const tile = entry as TTileDoc;
        const hasFrame = typeof tile.frame === 'number' || typeof tile.frame === 'string';
        const hasAnim = typeof tile.anim === 'string';
        if (hasFrame === hasAnim) {
            return fail(`tile ${id} has to say either a frame or an anim, and says ${hasFrame ? 'both' : 'neither'}.`);
        }
        tiles[id] = {
            ...(hasFrame ? { frame: tile.frame } : { anim: tile.anim }),
            solid: tile.solid === true,
            // Follows `solid` unless it says otherwise: water is the exception that earns the field.
            blocksBullets: tile.blocksBullets ?? tile.solid === true,
            ...(typeof tile.becomes === 'number' ? { becomes: Math.floor(tile.becomes) } : {}),
        };
    }

    if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
        return fail('it has no layers.');
    }
    const layers: TTilemapLayerDoc[] = raw.layers.map((entry, at) => {
        if (typeof entry !== 'object' || entry === null) {
            return fail(`layer ${at} is not an object.`);
        }
        const layer = entry as Partial<TTilemapLayerDoc>;
        if (!Array.isArray(layer.data)) {
            return fail(`layer ${at} has no cells.`);
        }
        if (layer.data.length !== width * height) {
            return fail(`layer '${layer.name ?? at}' has ${layer.data.length} cells and the grid is ${width} by ${height}, which is ${width * height}.`);
        }
        for (const id of layer.data) {
            if (id !== 0 && tiles[id] === undefined) {
                return fail(`layer '${layer.name ?? at}' uses tile ${id}, which its table does not describe.`);
            }
        }
        const order: TTileLayerOrder = layer.order === 'under' || layer.order === 'over' || typeof layer.order === 'number'
            ? layer.order
            : 0;
        return { name: layer.name ?? `layer ${at}`, order, data: [...layer.data] };
    });

    return { format: TILEMAP_FORMAT, kind: 'tilemap', atlas: raw.atlas, cell, width, height, tiles, layers };
};

import { TILEMAP_FORMAT } from './types/t_tilemap_doc';
import type { TTerrainDoc, TTileDoc, TTilemapDoc, TTilemapLayerDoc, TTileLayerOrder } from './types/t_tilemap_doc';

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

    // What a platformer's tiles say. Wrong is refused rather than dropped: a ladder that silently is
    // not one is found by a player falling through it, long after the file was written.
    const numberOf = (id: number, field: string, value: unknown): number => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return fail(`tile ${id} has a ${field} of '${String(value)}', and it has to be a number.`);
        }
        return value;
    };
    const slopeOf = (id: number, value: unknown): [number, number] => {
        if (!Array.isArray(value) || value.length !== 2) {
            return fail(`tile ${id} has to give its slope as two heights, [left, right], from 0 to 1.`);
        }
        const [left, right] = value.map((height) => numberOf(id, 'slope height', height));
        if (left < 0 || left > 1 || right < 0 || right > 1) {
            return fail(`tile ${id} has a slope of [${left}, ${right}]: its heights go from 0, the bottom of the cell, to 1, the top.`);
        }
        return [left, right];
    };
    const pushOf = (id: number, value: unknown): { x: number; y: number } => {
        if (typeof value !== 'object' || value === null) {
            return fail(`tile ${id} has to give its push as { x, y }, in pixels per second.`);
        }
        const push = value as Record<string, unknown>;
        return { x: numberOf(id, 'push x', push.x ?? 0), y: numberOf(id, 'push y', push.y ?? 0) };
    };
    const propsOf = (id: number, value: unknown): Record<string, string | number | boolean> => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return fail(`tile ${id} has props that are not an object.`);
        }
        const props: Record<string, string | number | boolean> = {};
        for (const [key, prop] of Object.entries(value)) {
            if (typeof prop !== 'string' && typeof prop !== 'boolean' && (typeof prop !== 'number' || !Number.isFinite(prop))) {
                return fail(`tile ${id} has a prop '${key}' of '${String(prop)}': a prop is a word, a number or true and false.`);
            }
            props[key] = prop;
        }
        return props;
    };

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
            ...(tile.flipX === true ? { flipX: true } : {}),
            ...(tile.flipY === true ? { flipY: true } : {}),
            ...(tile.oneWay === true ? { oneWay: true } : {}),
            ...(tile.ladder === true ? { ladder: true } : {}),
            ...(tile.slope !== undefined ? { slope: slopeOf(id, tile.slope) } : {}),
            ...(tile.damage !== undefined ? { damage: numberOf(id, 'damage', tile.damage) } : {}),
            ...(tile.push !== undefined ? { push: pushOf(id, tile.push) } : {}),
            ...(tile.props !== undefined ? { props: propsOf(id, tile.props) } : {}),
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
        let parallax: { x: number; y: number } | undefined;
        if (layer.parallax !== undefined) {
            const raw = layer.parallax as { x?: unknown; y?: unknown } | null;
            const x = raw?.x ?? 1;
            const y = raw?.y ?? 1;
            if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
                return fail(`layer '${layer.name ?? at}' has to give its parallax as { x, y }, numbers: 1 moves with the camera, 0 not at all.`);
            }
            parallax = { x, y };
        }
        return { name: layer.name ?? `layer ${at}`, order, data: [...layer.data], ...(parallax !== undefined ? { parallax } : {}) };
    });

    let terrains: TTerrainDoc[] | undefined;
    if (raw.terrains !== undefined) {
        if (!Array.isArray(raw.terrains)) {
            return fail('its terrains are not a list.');
        }
        terrains = raw.terrains.map((entry, at) => {
            const terrain = (typeof entry === 'object' && entry !== null ? entry : {}) as Partial<TTerrainDoc>;
            if (typeof terrain.name !== 'string' || terrain.name.length === 0) {
                return fail(`terrain ${at} has no name.`);
            }
            if (!Array.isArray(terrain.tiles) || terrain.tiles.length !== 16) {
                return fail(`terrain '${terrain.name}' has to give 16 tiles, one for each set of corners, and gives ${Array.isArray(terrain.tiles) ? terrain.tiles.length : 'none'}.`);
            }
            for (const id of terrain.tiles) {
                if (id !== 0 && tiles[id] === undefined) {
                    return fail(`terrain '${terrain.name}' uses tile ${String(id)}, which its table does not describe.`);
                }
            }
            return { name: terrain.name, tiles: [...terrain.tiles] };
        });
        const names = new Set<string>();
        for (const terrain of terrains) {
            if (names.has(terrain.name)) {
                return fail(`two terrains are called '${terrain.name}'.`);
            }
            names.add(terrain.name);
        }
    }

    return {
        format: TILEMAP_FORMAT, kind: 'tilemap', atlas: raw.atlas, cell, width, height, tiles, layers,
        ...(terrains !== undefined ? { terrains } : {}),
    };
};

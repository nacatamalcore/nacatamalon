import { spyOn } from 'bun:test';

/**
 * A map, its sheet and its image, served from memory.
 *
 * Nothing here touches a network or a graphics card: what these tests care about is the cells
 * turning into corners and the numbers in a grid answering questions, and both happen well before
 * anything is drawn.
 */

/**
 * The sheet the maps below point at: four frames across, one down.
 */
export const TEST_ATLAS = {
    format: 1,
    kind: 'atlas',
    texture: 'tiles.png',
    grid: { frameWidth: 8, frameHeight: 8 },
    sequences: { torch: { frames: [2, 3], fps: 4, loop: true } },
};

/**
 * Two by two: a wall, a brick that breaks into nothing, an empty cell and a torch.
 */
export const TEST_MAP = {
    format: 1,
    kind: 'tilemap',
    atlas: 'tiles.atlas',
    cell: 8,
    width: 2,
    height: 2,
    tiles: {
        1: { frame: 0, solid: true },
        2: { frame: 1, solid: true, becomes: 0 },
        3: { anim: 'torch' },
    },
    layers: [
        { name: 'ground', order: 'under', data: [1, 2, 0, 3] },
        { name: 'canopy', order: 'over', data: [0, 0, 0, 0] },
    ],
};

/**
 * Answers every fetch these tests make: the map, its sheet, and an image 32 by 8 so the sheet works
 * out as four frames across.
 *
 * Returns what was asked for, in order, so a test can check that a map and the characters on it
 * share one sheet instead of loading it twice.
 */
export const serveTilemap = (map: unknown = TEST_MAP): { asked: string[]; restore: () => void } => {
    const asked: string[] = [];

    Object.assign(globalThis, {
        createImageBitmap: async () => ({ width: 32, height: 8, close: () => {} }),
        // The atlas loader works its image's path out against the page, and a test has no page.
        location: { href: 'http://nacatamalon.local/' },
    });

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const url = String(input);
        asked.push(url);
        if (url.endsWith('.tilemap')) {
            return { ok: true, json: async () => map };
        }
        if (url.endsWith('.atlas')) {
            return { ok: true, json: async () => TEST_ATLAS };
        }
        if (url.endsWith('.png')) {
            return { ok: true, blob: async () => new Blob(['png']) };
        }
        return { ok: false, status: 404 };
    }) as unknown as typeof fetch);

    return { asked, restore: () => fetchSpy.mockRestore() };
};

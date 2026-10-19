import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { decodePng } from '../pixels/decode_png';
import { SilentAudioContext } from './silent_audio';

/**
 * What a game asks of the browser that Node and Bun do not have, put on `globalThis`:
 *
 * - `fetch` of a path (`/assets/hero.png`, `levels/1.json`) reads the file from the game's assets
 *   folder; an address with a scheme (`https:`, `data:`) goes to the real `fetch` as it would.
 * - `createImageBitmap` reads a PNG's size and pixels with the engine's own decoder. Another kind of
 *   picture goes to the `createImageBitmap` there was, if any, or is refused, and the texture says so
 *   the way one that failed to load does.
 * - `AudioContext` is a silent one, where there is none.
 *
 * `fetch` is the real one again once the last game goes. The other two stay, where they were added:
 * a load already on its way when its game goes still decodes its picture, and finds the game gone.
 *
 * One assets folder at a time: the last game made says which, since `fetch` cannot tell which game
 * is asking.
 */

type TGlobals = {
    fetch: typeof fetch;
    createImageBitmap?: unknown;
    AudioContext?: unknown;
};

const globals = globalThis as unknown as TGlobals;

let realFetch: typeof fetch | null = null;
let users = 0;
let assetsRoot = resolve('public');

const TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
};

/** An address with a scheme of its own (`https:`, `data:`, `blob:`), which is not a file of the game. */
const hasScheme = (address: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(address);

/**
 * A file of the game's assets, as the browser would answer for it: the bytes, or a 404 for one
 * that is not there or that tries to leave the folder.
 */
const readAsset = async (address: string): Promise<Response> => {
    const path = decodeURIComponent(address.split(/[?#]/)[0]!.replace(/^\/+/, ''));
    const file = resolve(assetsRoot, path);
    if (file !== assetsRoot && !file.startsWith(assetsRoot + sep)) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
    }
    try {
        const bytes = await readFile(file);
        return new Response(new Uint8Array(bytes), {
            status: 200,
            headers: { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' },
        });
    } catch {
        return new Response(null, { status: 404, statusText: 'Not Found' });
    }
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

/** Marks the `createImageBitmap` put in place here, so it is not wrapped twice. */
const OURS = Symbol('nacatamalon headless');

type TMakeBitmap = ((source: unknown, options?: unknown) => Promise<unknown>) & { [OURS]?: true };

/**
 * A `createImageBitmap` that reads a PNG itself, for its size, and hands anything else to the one
 * there was. The pixels go nowhere, there being nothing to draw them on.
 */
const headlessBitmap = (before: TMakeBitmap | undefined): TMakeBitmap => {
    const make: TMakeBitmap = async (source, options) => {
        if (source instanceof Blob) {
            const bytes = new Uint8Array(await source.arrayBuffer());
            if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
                const { width, height } = decodePng(bytes);
                return { width, height, close: () => {} };
            }
        }
        if (before === undefined) {
            throw new Error('[NacatamalOn] headless: only PNG pictures can be read without a browser.');
        }
        return before(source, options);
    };
    make[OURS] = true;
    return make;
};

/**
 * Says which folder `fetch` reads a game's files from, and puts the browser's stand-ins in place:
 * `fetch` for the first game alive, the others whenever something else has put its own there since.
 *
 * @internal
 */
export const enterHeadless = (assets: string): void => {
    assetsRoot = resolve(assets);
    users += 1;
    if (realFetch === null) {
        const real = globals.fetch;
        realFetch = real;
        globals.fetch = ((input: string | URL | Request, init?: RequestInit) => {
            const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            return hasScheme(address) ? real(input, init) : readAsset(address);
        }) as typeof fetch;
    }
    const bitmap = globals.createImageBitmap as TMakeBitmap | undefined;
    if (bitmap?.[OURS] !== true) {
        globals.createImageBitmap = headlessBitmap(bitmap);
    }
    if (globals.AudioContext === undefined) {
        globals.AudioContext = SilentAudioContext;
    }
};

/**
 * One game fewer: the last to go gives `fetch` back.
 *
 * @internal
 */
export const leaveHeadless = (): void => {
    users = Math.max(0, users - 1);
    if (users > 0 || realFetch === null) {
        return;
    }
    globals.fetch = realFetch;
    realFetch = null;
};

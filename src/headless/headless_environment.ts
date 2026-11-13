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

type TNodeFiles = { readFile(path: string): Promise<Uint8Array> };
type TNodePath = { resolve(...paths: string[]): string; extname(path: string): string; sep: string };

/**
 * Node's own modules, asked of the runtime when a game with no browser starts rather than imported:
 * this file is also reached from `nacatamalon/net`, which a game's page bundles, and a bundler for
 * the browser refuses an import of `node:fs` even when nothing on the page would call it.
 */
const node = (): { files: TNodeFiles; path: TNodePath } => {
    const process = (globalThis as { process?: { getBuiltinModule?: (name: string) => unknown } }).process;
    if (typeof process?.getBuiltinModule !== 'function') {
        throw new Error('[NacatamalOn] headless: a game with no browser reads its files with Node or Bun, and this runtime has neither. Run it with Bun, or with Node 20.16, 22.3 or newer.');
    }
    return {
        files: process.getBuiltinModule('node:fs/promises') as TNodeFiles,
        path: process.getBuiltinModule('node:path') as TNodePath,
    };
};

let realFetch: typeof fetch | null = null;
let users = 0;
let assetsRoot = '';

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
    const { files: { readFile }, path: { resolve, extname, sep } } = node();
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
 * The pixels of each picture read here, kept beside it for a game that is asked for a picture of
 * itself (`capture`): what it draws them with in place of a graphics card. Nothing else reads them,
 * and they go with the picture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bitmapPixels = new WeakMap<object, { width: number; height: number; data: Uint8Array }>();

/**
 * A `createImageBitmap` that reads a PNG itself, for its size and its pixels, and hands anything
 * else to the one there was.
 */
const headlessBitmap = (before: TMakeBitmap | undefined): TMakeBitmap => {
    const make: TMakeBitmap = async (source, options) => {
        if (source instanceof Blob) {
            const bytes = new Uint8Array(await source.arrayBuffer());
            if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
                const decoded = decodePng(bytes);
                const bitmap = { width: decoded.width, height: decoded.height, close: () => {} };
                bitmapPixels.set(bitmap, { width: decoded.width, height: decoded.height, data: decoded.data });
                return bitmap;
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
    assetsRoot = node().path.resolve(assets);
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

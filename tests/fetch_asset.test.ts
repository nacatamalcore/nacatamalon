import { afterEach, describe, expect, it } from 'bun:test';
import { fetchAsset } from '../src/loaders/fetch_asset';

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('fetchAsset', () => {
    it('reads a data: address without fetching it, as a strict page would refuse', async () => {
        globalThis.fetch = (() => Promise.reject(new Error('refused by the page'))) as unknown as typeof fetch;
        const png = await fetchAsset('data:image/png;base64,iVBORw0K');
        expect(png.ok).toBe(true);
        expect([...new Uint8Array(await png.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        const json = await fetchAsset(`data:application/json,${encodeURIComponent('{"a":1}')}`);
        expect(await json.json()).toEqual({ a: 1 });
    });

    it('fetches any other address', async () => {
        globalThis.fetch = ((src: string) => Promise.resolve(new Response(src))) as unknown as typeof fetch;
        expect(await (await fetchAsset('/fonts/big.png')).text()).toBe('/fonts/big.png');
    });
});

/**
 * `fetch`, except that a `data:` address is read on the spot instead of requested. A page with a
 * strict Content Security Policy refuses to fetch a `data:` address, and the engine carries its own
 * fonts and splash mark that way: read here, they show on any page.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fetchAsset = async (src: string): Promise<Response> => {
    if (!src.startsWith('data:')) {
        return fetch(src);
    }
    const comma = src.indexOf(',');
    if (comma < 0) {
        throw new Error(`[NacatamalOn] a 'data:' address is malformed: '${src.slice(0, 40)}…'`);
    }
    const head = src.slice('data:'.length, comma);
    const type = head.split(';')[0] ?? '';
    const body = src.slice(comma + 1);
    if (!head.endsWith(';base64')) {
        return new Response(new Blob([decodeURIComponent(body)], { type }));
    }
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Response(new Blob([bytes], { type }));
};

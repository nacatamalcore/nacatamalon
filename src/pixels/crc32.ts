/**
 * The table every PNG chunk's check is worked out with, made once.
 */
const TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

/**
 * The CRC-32 a PNG chunk carries, over `bytes[start..end)`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crc32 = (bytes: Uint8Array, start: number, end: number): number => {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) {
        c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
};

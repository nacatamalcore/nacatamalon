import { describe, expect, it, spyOn } from 'bun:test';
import { normalizePostChain } from '../src/post';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';

/**
 * How a chain written in a project file is read back.
 *
 * Total and never throwing, because a chain is written by tools and edited by hand. What it will
 * not do is keep an entry it cannot run: a chain whose length lies about how many effects run is
 * worse than a shorter one.
 */

describe('reading a chain out of a file', () => {
    it('keeps the order, because the order is the picture', () => {
        const chain = normalizePostChain([{ builtin: 'lut' }, { builtin: 'palette' }, { builtin: 'dither' }]);

        expect(chain.map((entry) => entry.builtin)).toEqual(['lut', 'palette', 'dither']);
    });

    it('drops an entry naming neither a built-in nor a file', () => {
        expect(normalizePostChain([{ uniforms: { levels: 4 } }, { builtin: 'dither' }]))
            .toEqual([{ shader: '', builtin: 'dither' }]);
    });

    it('lets a built-in win over a file, because a built-in cannot dangle', () => {
        const [entry] = normalizePostChain([{ builtin: 'dither', shader: 'shaders/crt.wgsl' }]);

        expect(entry!.builtin).toBe('dither');
        expect(entry!.shader).toBe('');
    });

    it('lets a palette win over a table, because an effect reads one data texture', () => {
        const [entry] = normalizePostChain([{ builtin: 'palette', palette: 'p.palette', lut: 'l.cube' }]);

        expect(entry!.palette).toBe('p.palette');
        expect(entry!.lut).toBeUndefined();
    });

    it('writes an absent field rather than an empty string, so nothing has to test for both', () => {
        const [entry] = normalizePostChain([{ shader: 'crt.wgsl', palette: '   ', name: '' }]);

        expect('palette' in entry!).toBe(false);
        expect('name' in entry!).toBe(false);
    });

    it('writes enabled only when it is false, because absent already means on', () => {
        const [on, off] = normalizePostChain([{ builtin: 'dither', enabled: true }, { builtin: 'dither', enabled: false }]);

        expect('enabled' in on!).toBe(false);
        expect(off!.enabled).toBe(false);
    });

    it('keeps only numbers and short lists, because nothing else has a place in the block', () => {
        const [entry] = normalizePostChain([{
            builtin: 'dither',
            uniforms: { good: 2, tint: [1, 0, 0, 1], typed: 'four', broken: Number.NaN, tooLong: [1, 2, 3, 4, 5] },
        }]);

        expect(entry!.uniforms).toEqual({ good: 2, tint: [1, 0, 0, 1] });
    });

    it('never throws at whatever it is handed', () => {
        for (const nonsense of [null, undefined, 42, 'chain', {}, [null], [7], [[]]]) {
            expect(() => normalizePostChain(nonsense)).not.toThrow();
        }
        expect(normalizePostChain('chain')).toEqual([]);
    });

    it('comes out the same after a trip through a file and back', () => {
        const written = normalizePostChain([
            { builtin: 'palette', palette: 'palettes/nes.palette', name: 'NES' },
            { shader: 'shaders/crt.wgsl', uniforms: { curve: 0.3 }, enabled: false },
        ]);

        expect(normalizePostChain(JSON.parse(JSON.stringify(written)))).toEqual(written);
    });
});

describe('reading a chain written before a knob was renamed', () => {
    it('reads the old name as the new one, and says so once for the entry', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [entry] = normalizePostChain([{ builtin: 'dither', uniforms: { strength: 0.5 } }]);

        expect(entry!.uniforms).toEqual({ amount: 0.5 });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain("'dither' calls 'strength' 'amount' now");
        warn.mockRestore();
    });

    it('keeps the value under the new name when both are written, because that is the later one', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [entry] = normalizePostChain([{ builtin: 'dither', uniforms: { strength: 0.5, amount: 0.25, levels: 4 } }]);

        expect(entry!.uniforms).toEqual({ amount: 0.25, levels: 4 });
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('moves every renamed knob of an entry with a single warning', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [entry] = normalizePostChain([{ builtin: 'halftone', uniforms: { scale: 6, color: 1, angle: 30 } }]);

        expect(entry!.uniforms).toEqual({ size: 6, ownColor: 1, angle: 30 });
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('leaves a file\'s effect and a knob already under its new name alone, and says nothing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const [file, current] = normalizePostChain([
            { shader: 'shaders/mine.wgsl', uniforms: { strength: 0.5 } },
            { builtin: 'crt', uniforms: { linearBlend: 0, noise: 0.2 } },
        ]);

        expect(file!.uniforms).toEqual({ strength: 0.5 });
        expect(current!.uniforms).toEqual({ linearBlend: 0, noise: 0.2 });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('the chain a game is created with', () => {
    it('survives the tidying of the options, so `createGame({ post })` installs it', () => {
        // The options are copied field by field with their defaults, and this one was once left
        // out: every game created with a chain in code drew without it, and said nothing.
        const chain = [{ shader: 'shaders/crt.wgsl', uniforms: { scanline: 0.1 } }];
        expect(cleanGameOptions({ width: 256, height: 240, post: chain }).post).toEqual(chain);
    });
});

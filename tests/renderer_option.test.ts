import { describe, expect, it } from 'bun:test';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import type { TRendererType } from '../src/render/interface/t_renderer_capabilities';

describe('the renderer option', () => {
    it('is read in capitals whatever way it is written', () => {
        expect(cleanGameOptions({ width: 320, height: 240, renderer: 'webgl2' as TRendererType }).renderer).toBe('WEBGL2');
        expect(cleanGameOptions({ width: 320, height: 240, renderer: 'WebGPU' as TRendererType }).renderer).toBe('WEBGPU');
        expect(cleanGameOptions({ width: 320, height: 240, renderer: 'auto' as TRendererType }).renderer).toBe('AUTO');
        expect(cleanGameOptions({ width: 320, height: 240, renderer: 'WEBGL2' }).renderer).toBe('WEBGL2');
    });

    it('is AUTO when it is not said', () => {
        expect(cleanGameOptions({ width: 320, height: 240 }).renderer).toBe('AUTO');
    });

    it('refuses a name there is not, saying the ones there are', () => {
        expect(() => cleanGameOptions({ width: 320, height: 240, renderer: 'opengl' as TRendererType })).toThrow("renderer must be 'AUTO', 'WEBGPU', 'WEBGL2', got opengl");
    });
});

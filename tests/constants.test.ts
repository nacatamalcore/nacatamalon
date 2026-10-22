import { describe, expect, it } from 'bun:test';
import { BUILTIN, INPUT, LIMITS, PHYSICS, POST, RENDER, renderSfx } from '../src';
import { POST_BUILTINS, MATERIAL_LOOKS } from '../src/authoring';
import { ARCADE_FONT } from '../src/gameobjects/text/fonts/arcade_font';
import { SQUARE_FONT } from '../src/gameobjects/text/fonts/square_font';
import { THIN_FONT } from '../src/gameobjects/text/fonts/thin_font';
import { DEFAULT_FONT_KEY } from '../src/gameobjects/text/default_font';
import { MAX_LIGHTS } from '../src/light';

/**
 * The engine's constants, read by games from the root in groups. Some of their lists are written
 * out by hand so a game that reads them does not carry what they name: those must keep saying the
 * same as the catalogs they stand for.
 */

describe('the lists written out by hand', () => {
    it('name every post effect the engine has, in its order', () => {
        expect(BUILTIN.POST).toEqual(POST_BUILTINS.map((effect) => effect.key));
    });

    it('name every look a material can take', () => {
        expect(BUILTIN.LOOKS).toEqual(MATERIAL_LOOKS.map((look) => look.key));
    });

    it('name every font the engine carries, the one a text uses first', () => {
        expect(BUILTIN.FONTS).toEqual([ARCADE_FONT.key, SQUARE_FONT.key, THIN_FONT.key]);
        expect(BUILTIN.FONTS[0]).toBe(DEFAULT_FONT_KEY);
    });

    it('name every sound effect, in the order the synthesizer has them', () => {
        // Asked for one it does not have, the synthesizer names all it has.
        let named: string[] = [];
        try {
            renderSfx({ preset: 'nothing' as never });
        } catch (error) {
            named = [...String(error).matchAll(/'([a-z]+)'/g)].map((match) => match[1]!).slice(1);
        }
        expect([...BUILTIN.SOUNDS] as string[]).toEqual(named);
        for (const preset of BUILTIN.SOUNDS) expect(renderSfx({ preset }).length).toBeGreaterThan(0);
    });
});

describe('what the groups say', () => {
    it('is what the engine itself reads', () => {
        expect(LIMITS.LIGHTS).toBe(MAX_LIGHTS);
        expect(PHYSICS.ALL_LAYERS).toBe((1 << LIMITS.PHYSICS_LAYERS) - 1);
        expect(RENDER.TYPE).toEqual({ AUTO: 'AUTO', WEBGPU: 'WEBGPU', WEBGL2: 'WEBGL2' });
        expect(INPUT.DEADZONE).toBe(0.2);
    });
});

describe('a game writing into them', () => {
    const groups = { RENDER, INPUT, LIMITS, PHYSICS, POST, BUILTIN };

    it('changes nothing, all the way down', () => {
        const walk = (value: unknown, path: string) => {
            if (value === null || typeof value !== 'object') return;
            expect({ path, frozen: Object.isFrozen(value) }).toEqual({ path, frozen: true });
            for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
        };
        for (const [name, group] of Object.entries(groups)) walk(group, name);
    });

    it('is told so, rather than breaking the engine for every game on the page', () => {
        'use strict';
        expect(() => { (INPUT.GAMEPAD_BUTTONS as string[]).push('turbo'); }).toThrow();
        expect(() => { (POST.CRT_PRESETS.pvm as { noise: number }).noise = 9; }).toThrow();
        expect(() => { (BUILTIN.MUSIC.SONGS[0] as { key: string }).key = 'mine'; }).toThrow();
        expect(INPUT.GAMEPAD_BUTTONS).not.toContain('turbo');
    });
});

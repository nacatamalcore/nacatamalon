import { describe, expect, it } from 'bun:test';
import { getColor } from '../src/color';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createPointLight } from '../src/light/create_light';
import { fade } from '../src/transition/builtin';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { useFog } from '../src/hooks/fog/use_fog';
import { createTestGame, startTestScene } from './helpers/test_game';

/**
 * A colour is said the same way wherever one is asked for: what `getColor` reads, or a colour
 * already made. What is read back is always `{ r, g, b, a }`.
 */

const ORANGE = { r: 1, g: 0x6b / 255, b: 0x1a / 255, a: 1 };

describe('a colour, wherever one is asked for', () => {
    it('is read from a hex string, a hex number or a colour already made, and is always a new one', () => {
        const made = getColor('#ff6b1a');
        expect(getColor(0xff6b1a)).toEqual(ORANGE);
        expect(made).toEqual(ORANGE);
        expect(getColor(made)).toEqual(made);
        expect(getColor(made)).not.toBe(made);
    });

    it('is kept by each thing it tints as its own: fading one fades neither the others nor the colour', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const gold = getColor('#ffc450');
            const who = createText({ text: 'TU TURNO', tint: gold });
            const score = createText({ text: '12', tint: gold });
            const coin = createSprite({ width: 4, height: 4, tint: gold });

            who.tint.a = 0.3;

            expect(who.tint.a).toBe(0.3);
            expect(score.tint.a).toBe(1);
            expect(coin.tint.a).toBe(1);
            expect(gold.a).toBe(1);
            return createScene();
        });
    });

    it('is taken as words by sprites, texts, lights, fog, transitions and the background', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            expect(createSprite({ width: 4, height: 4, tint: '#ff6b1a' }).tint).toEqual(ORANGE);
            expect(createText({ text: 'A', tint: 0xff6b1a }).tint).toEqual(ORANGE);
            expect(useFog({ color: 'black' }).color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
            return createScene();
        });
        expect(createPointLight({ color: '#ff6b1a' }).color).toEqual(ORANGE);
        expect(fade(0.3, 'white').uniforms!.color).toEqual([1, 1, 1, 1]);
        createGameHandle(store).setBackground('#ff6b1a');
        expect(store.get('config').background).toEqual(ORANGE);
    });
});

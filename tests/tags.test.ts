import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { parseSceneDoc, SCENE_FORMAT, SCENE_VERSION, sceneFromDoc, serializeScene } from '../src/scene/document';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { destroy } from '../src/destroy/destroy';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useTag } from '../src/hooks/tags/use_tag';
import { useHitbox, useCollisionBetween, useCollisionWith } from '../src/hooks/hitbox';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSceneFn } from '../src/scene';
import type { TTag } from '../src/tags';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };
const square = (x: number, y: number, size = 10) =>
    createSprite({ width: size, height: size, tint, transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 } });

const game = (body: TSceneFn) => {
    const { store } = createTestGame();
    const ctx = createFrameContext();
    let now = 0;
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    const frame = (): void => {
        const prev = now;
        now += 1000 / 60;
        tick(store, ctx, now, prev);
    };
    return { frame };
};

describe('useTag', () => {
    it('puts a tag on a piece and on a sprite of its own, and finds both', () => {
        const { store } = createTestGame();
        let coins!: TTag;
        let wall!: ReturnType<typeof square>;
        let coin!: TGameObject;
        startTestScene(store, 'Level', () => {
            coins = useTag('coin');
            wall = square(0, 0);
            useTag('wall').add(wall);
            coin = useSpawn(() => { useTag('coin').add(useSelf()); square(40, 0); }, 'Coin')();
            return createScene();
        });

        expect(coins.has(coin)).toBe(true);
        expect(coins.has(wall)).toBe(false);
        expect(wall.tags).toEqual(['wall']);
        expect(coins.all()).toEqual([coin]);
    });

    it('is the same tag for everyone who asks, takes it off one or all, and adds once', () => {
        const { store } = createTestGame();
        let a!: TTag;
        let b!: TTag;
        let one!: ReturnType<typeof square>;
        let two!: ReturnType<typeof square>;
        startTestScene(store, 'Level', () => {
            a = useTag('stunned');
            b = useTag('stunned');
            one = square(0, 0);
            two = square(20, 0);
            return createScene();
        });

        a.add(one);
        a.add(one);
        b.add(two);
        expect(one.tags).toEqual(['stunned']);
        expect(a.all()).toEqual([one, two]);

        a.remove(one);
        expect(b.has(one)).toBe(false);
        b.clear();
        expect(a.all()).toEqual([]);
    });

    it('leaves out what is destroyed, and what is inside it', () => {
        const { store } = createTestGame();
        let enemies!: TTag;
        let holder!: TGameObject;
        startTestScene(store, 'Level', () => {
            enemies = useTag('enemy');
            holder = useSpawn(() => {
                useSpawn(() => { useTag('enemy').add(useSelf()); }, 'Bat')();
            }, 'Cave')();
            useSpawn(() => { useTag('enemy').add(useSelf()); }, 'Bat')();
            return createScene();
        });

        expect(enemies.all()).toHaveLength(2);
        destroy(holder);
        expect(enemies.all()).toHaveLength(1);
    });

    it('comes from the creators too: a sprite\'s options and a maker\'s', () => {
        const { store } = createTestGame();
        let walls!: TTag;
        let coins!: TTag;
        startTestScene(store, 'Level', () => {
            walls = useTag('wall');
            coins = useTag('coin');
            createSprite({ width: 4, height: 4, tint, tags: ['wall'] });
            useSpawn(() => { square(0, 0); }, { name: 'Coin', tags: ['coin'] })();
            return createScene();
        });

        expect(walls.all()).toHaveLength(1);
        expect((coins.all()[0] as TGameObject).name).toBe('Coin');
    });

    it('refuses to be asked for outside a body', () => {
        expect(() => useTag('enemy')).toThrow(/useTag/);
    });
});

describe('collisions by tag', () => {
    it('meets a sprite tagged on its own as well as a piece, and by the tag itself as by its name', () => {
        const heard: string[] = [];
        const { frame } = game(() => {
            const walls = useTag('wall');
            walls.add(square(52, 50));
            useSpawn(() => { useTag('enemy').add(useSelf()); square(48, 50); useHitbox(); }, 'Bat')();
            useSpawn(() => {
                square(50, 50, 4);
                useCollisionWith(walls, () => heard.push('wall'), { when: 'start' });
                useCollisionWith('enemy', (bat) => heard.push((bat as TGameObject).name), { when: 'start' });
            }, 'Ball')();
            return createScene();
        });

        frame();
        frame();

        expect(heard.sort()).toEqual(['Bat', 'wall']);
    });
});

describe('a piece and what it draws', () => {
    it('is not met by its own tagged sprite, and meets another piece\'s', () => {
        const heard: string[] = [];
        const between: string[] = [];
        const kindOf = (thing: object): string => ('type' in thing ? String(thing.type) : 'box');
        const Crate = (x: number) => () => {
            createSprite({ width: 10, height: 10, tint, tags: ['damageable'], transform: { x, y: 50, rotation: 0, scaleX: 1, scaleY: 1 } });
        };
        const { frame } = game(() => {
            useSpawn(() => {
                Crate(50)();
                useCollisionWith('damageable', (thing) => heard.push(kindOf(thing)), { when: 'start' });
            }, 'Lone')();
            useSpawn(Crate(55), 'Other')();
            useCollisionBetween('damageable', 'damageable', (a, b) => between.push(`${kindOf(a)}:${kindOf(b)}`));
            return createScene();
        });

        frame();
        frame();
        // Its own sprite is not something else it touches; the other crate's is.
        expect(heard).toEqual(['sprite']);
        // The two sprites, once: each one with the other, and never with itself.
        expect(between).toEqual(['sprite:sprite', 'sprite:sprite']);
    });
});

describe('collisions by component', () => {
    it('meets the pieces made from it, with their api typed, and nothing else', () => {
        const hurt: number[] = [];
        const { frame } = game(() => {
            const Bat = ({ x }: { x: number }) => {
                square(x, 50, 10);
                return { hurt: (damage: number) => hurt.push(damage) };
            };
            const Rock = ({ x }: { x: number }) => { square(x, 50, 10); };
            useSpawn(Bat)({ x: 48 });
            useSpawn(Rock)({ x: 52 });
            useSpawn(() => {
                square(50, 50, 4);
                // Typed: no check, no cast. The rock touches as well and is not met.
                useCollisionWith(Bat, (bat) => bat.api.hurt(1), { when: 'start' });
            }, 'Shot')();
            return createScene();
        });

        frame();
        frame();

        expect(hurt).toEqual([1]);
    });

    it('mixes with tags in a rule of the scene', () => {
        const met: string[] = [];
        const { frame } = game(() => {
            const Bat = () => { square(50, 50, 10); return { kind: 'bat' }; };
            useSpawn(Bat)();
            useSpawn(() => { square(52, 50, 4); }, { name: 'Shot', tags: ['shot'] })();
            useCollisionBetween('shot', Bat, (shot, bat) => met.push(`${(shot as TGameObject).name}>${bat.api.kind}`));
            return createScene();
        });

        frame();

        expect(met).toEqual(['Shot>bat']);
    });
});

describe('tags in a saved scene', () => {
    it('are written on the box, read back, and found again', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(() => { useTag('enemy').add(useSelf()); useTag('damageable').add(useSelf()); square(0, 0); }, 'Bat')();
            useSpawn(() => { square(20, 0); }, 'Rock')();
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.root.children.map((box) => box.tags)).toEqual([['enemy', 'damageable'], undefined]);

        const again = parseSceneDoc(JSON.parse(JSON.stringify(doc)), 'level.scene');
        let enemies!: TTag;
        const { store: other } = createTestGame();
        const built = sceneFromDoc(again);
        startTestScene(other, 'Level', () => {
            const scene = built();
            enemies = useTag('enemy');
            return scene;
        });
        expect(enemies.all().map((box) => (box as TGameObject).name)).toEqual(['Bat']);
    });

    it('keeps only names, each once', () => {
        const doc = parseSceneDoc({ format: SCENE_FORMAT, version: SCENE_VERSION, name: 'Level', root: { id: 'r', name: 'Level', transform: null, components: [], children: [
            { id: 'a', name: 'Bat', transform: null, components: [], children: [], tags: ['enemy', 'enemy', '', 3] },
        ] } }, 'level.scene');
        expect(doc.root.children[0].tags).toEqual(['enemy']);
    });
});

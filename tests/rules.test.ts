import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { parseSceneDoc, sceneFromDoc, serializeScene, objectFromDoc, SCENE_FORMAT } from '../src/scene/document';
import { createScene } from '../src/scene/create_scene';
import { clearScripts, registerScript } from '../src/scripts';
import { clearGameStores, createGameStore } from '../src/game_store';
import { getGameStore } from '../src/game_store/store_registry';
import { useReport } from '../src/hooks/events/use_report';
import { onReport } from '../src/events/on_report';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { parseRules } from '../src/rules/parse_rules';
import { useRules, watchRules } from '../src/rules';
import { destroy } from '../src/destroy/destroy';
import { createText } from '../src/gameobjects/text/create_text';
import { useSound } from '../src/hooks/audio/use_sound';
import { installFakeAudio } from './helpers/test_audio';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TRule, TRuleCondition } from '../src/rules';

/**
 * Rules: when something happens, if these hold, do these. What is pinned is what the editor and an
 * agent count on: they read and write back as they were, they hear a report without taking it from
 * whoever listens, they use the behaviours' own words, and a copy's rules mean the copy's pieces.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

let warn: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    warn?.mockRestore();
    warn = null;
    clearScripts();
    clearGameStores();
});

type TNode = { id: string; name: string; components?: unknown[]; children?: TNode[]; tags?: string[] };
const node = ({ id, name, components = [], children = [], tags }: TNode): unknown => ({
    id, name, transform: { x: 0, y: 0 }, components, children: children.map(node), ...(tags ? { tags } : {}),
});
const doc = (children: TNode[]) => parseSceneDoc({
    format: SCENE_FORMAT, version: 1, name: 'Level', assets: [],
    root: { id: 'root', name: 'Level', transform: { x: 0, y: 0 }, components: [], children: children.map(node) },
}, 'scenes/level.scene');

/** A game playing a document, driven a frame at a time. */
const play = (children: TNode[]) => {
    const { store } = createTestGame({}, createFakeCanvas());
    const root = startTestScene(store, 'Level', sceneFromDoc(doc(children)));
    const ctx = createFrameContext();
    let now = 0;
    const frame = (seconds = 1 / 60): void => {
        const prev = now;
        now += seconds * 1000;
        tick(store, ctx, now, prev);
    };
    frame();
    const find = (name: string): TBox => {
        const visit = (box: TBox): TBox | null => box.name === name ? box : box.children.map(visit).find((b) => b !== null) ?? null;
        return visit(root)!;
    };
    return { root, frame, find };
};

/** A coin that says it was picked when told to, and a door that opens when told to. */
const behaviours = () => {
    const pick: Array<() => void> = [];
    registerScript('coin', () => {
        const picked = useReport<{ worth: number }>('picked');
        pick.push(() => picked({ worth: 5 }));
    }, { reports: [{ name: 'picked' }] });
    const opened: string[] = [];
    registerScript('door', (self) => ({ open: (params: { how?: string }) => { opened.push(`${self.name}:${params.how ?? ''}`); } }), { actions: [{ name: 'open' }] });
    return { pick, opened };
};

describe('useRules', () => {
    it('hears every box carrying a tag, whatever its name, and none other', () => {
        const { pick } = behaviours();
        createGameStore({ key: 'score', state: { coins: 0 } });
        play([
            { id: 'c1', name: 'Coin', tags: ['coin'], components: [{ type: 'script', id: 's1', ref: 'coin' }] },
            { id: 'c2', name: 'Coin 2', tags: ['coin', 'shiny'], components: [{ type: 'script', id: 's2', ref: 'coin' }] },
            // Its pickup on a piece of it: the tag is the box's, heard all the same.
            { id: 'c3', name: 'Gold', tags: ['coin'], children: [{ id: 'g', name: 'Glint', components: [{ type: 'script', id: 's3', ref: 'coin' }] }] },
            { id: 'x', name: 'Decoy', components: [{ type: 'script', id: 's4', ref: 'coin' }] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'count', when: { on: 'report', tag: 'coin', report: 'picked' }, do: [{ do: 'store', store: 'score', field: 'coins', add: 1 }] },
            ] }] },
        ]);
        for (const take of pick) take();
        expect(getGameStore('score')!.get()).toEqual({ coins: 3 });
        expect(parseRules([{ id: 'a', when: { on: 'report', tag: 'coin', report: 'picked' }, do: [{ do: 'hide', box: '' }] }])[0]!.when)
            .toEqual({ on: 'report', tag: 'coin', report: 'picked' });
    });

    it('when a box reports, if its conditions hold, does its steps in order', () => {
        const { pick, opened } = behaviours();
        createGameStore({ key: 'score', state: { points: 0 } });
        const { find } = play([
            { id: 'c1', name: 'Coin', components: [{ type: 'script', id: 's1', ref: 'coin' }] },
            { id: 'd1', name: 'Door', components: [{ type: 'script', id: 's2', ref: 'door' }] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'score', when: { on: 'report', box: 'Coin', report: 'picked' }, if: [{ payload: 'worth', is: '>=', value: 5 }],
                    do: [{ do: 'store', store: 'score', field: 'points', add: 10 }, { do: 'call', box: 'd1', script: 'door', action: 'open', params: { how: 'wide' } }] },
                { id: 'never', when: { on: 'report', box: 'Coin', report: 'picked' }, if: [{ payload: 'worth', is: '>', value: 5 }],
                    do: [{ do: 'hide', box: 'Coin' }] },
            ] }] },
        ]);

        pick[0]!();
        pick[0]!();
        expect(opened).toEqual(['Door:wide', 'Door:wide']);
        expect(find('Coin').visible).toBe(true);
        expect(getGameStore('score')!.get()).toEqual({ points: 20 });
    });

    it('happens once when it says so, and acts on the box that sent the report', () => {
        const { pick } = behaviours();
        const { find } = play([
            { id: 'c1', name: 'Coin', components: [{ type: 'script', id: 's1', ref: 'coin' }] },
            { id: 'c2', name: 'Coin', components: [{ type: 'script', id: 's2', ref: 'coin' }] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'hide-it', when: { on: 'report', box: 'Coin', report: 'picked' }, do: [{ do: 'hide', box: '@from' }], once: true },
            ] }] },
        ]);
        const [first, second] = find('Level').children.filter((b) => b.name === 'Coin');

        pick[1]!();
        pick[0]!();
        expect(first!.visible).toBe(true);
        expect(second!.visible).toBe(false);
    });

    it('hears a report without taking it from whoever listens', () => {
        let heard = 0;
        let send!: () => void;
        registerScript('bell', () => {
            const ring = useReport('ring');
            send = () => ring(undefined);
        });
        registerScript('ear', (self) => { onReport(self, 'ring', () => { heard++; }); });
        createGameStore({ key: 'count', state: { n: 0 } });
        play([
            { id: 'holder', name: 'Holder', components: [{ type: 'script', id: 'e', ref: 'ear' }], children: [
                { id: 'bell', name: 'Bell', components: [{ type: 'script', id: 'b', ref: 'bell' }] },
            ] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'count', when: { on: 'report', box: 'bell', report: 'ring' }, do: [{ do: 'store', store: 'count', field: 'n', add: 1 }] },
            ] }] },
        ]);

        send();
        expect(heard).toBe(1);
        expect(getGameStore('count')!.get()).toEqual({ n: 1 });
    });

    it('starts with the scene, and waits in game time', () => {
        const { frame, find } = play([
            { id: 'sign', name: 'Sign' },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'blink', when: { on: 'start' }, do: [{ do: 'hide', box: 'Sign' }, { do: 'wait', seconds: 0.5 }, { do: 'show', box: 'Sign' }] },
            ] }] },
        ]);

        expect(find('Sign').visible).toBe(false);
        frame(0.2);
        expect(find('Sign').visible).toBe(false);
        frame(0.2);
        frame(0.2);
        expect(find('Sign').visible).toBe(true);
    });

    it('says once what it cannot do, and goes on with the rest', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { find } = play([
            { id: 'sign', name: 'Sign' },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'go', when: { on: 'start' }, do: [{ do: 'call', box: 'Sign', script: 'door', action: 'open' }, { do: 'destroy', box: 'Nobody' }, { do: 'hide', box: 'Sign' }] },
            ] }] },
        ]);

        expect(find('Sign').visible).toBe(false);
        const lines = warn.mock.calls.map((call: unknown[]) => String(call[0]));
        expect(lines.some((line: string) => line.includes("rule 'go' on 'Rules'") && line.includes("'door'"))).toBe(true);
        expect(lines.some((line: string) => line.includes("no box 'Nobody'"))).toBe(true);
    });

    it('hears what another rule tells as the scene starts, whichever box comes first', () => {
        createGameStore({ key: 'count', state: { n: 0 } });
        play([
            { id: 'a', name: 'Starter', components: [{ type: 'rules', id: 'ra', rules: [
                { id: 'go', when: { on: 'start' }, do: [{ do: 'report', report: 'ping' }] },
            ] }] },
            { id: 'b', name: 'Counter', components: [{ type: 'rules', id: 'rb', rules: [
                { id: 'count', when: { on: 'report', box: 'Starter', report: 'ping' }, do: [{ do: 'store', store: 'count', field: 'n', add: 1 }] },
            ] }] },
        ]);
        expect(getGameStore('count')!.get()).toEqual({ n: 1 });
    });

    it('acts after whoever listens has heard, so destroying the one that told keeps nothing from them', () => {
        const { pick } = behaviours();
        let heard = 0;
        registerScript('holder', (self) => { onReport(self, 'picked', () => { heard++; }); });
        const { find } = play([
            { id: 'h', name: 'Holder', components: [{ type: 'script', id: 'sh', ref: 'holder' }], children: [
                { id: 'c1', name: 'Coin', components: [{ type: 'script', id: 's1', ref: 'coin' }] },
            ] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'gone', when: { on: 'report', box: 'Coin', report: 'picked' }, do: [{ do: 'destroy', box: '@from' }] },
            ] }] },
        ]);

        pick[0]!();
        expect(heard).toBe(1);
        expect(find('Holder').children[0]!.destroyed).toBe(true);
    });

    it('hears what a piece inside the box it waits on tells, as onReport would', () => {
        const { pick } = behaviours();
        createGameStore({ key: 'count', state: { n: 0 } });
        play([
            { id: 'chest', name: 'Chest', children: [{ id: 'lid', name: 'Lid', components: [{ type: 'script', id: 's', ref: 'coin' }] }] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'count', when: { on: 'report', box: 'chest', report: 'picked' }, do: [{ do: 'store', store: 'count', field: 'n', add: 1 }] },
            ] }] },
        ]);
        pick[0]!();
        expect(getGameStore('count')!.get()).toEqual({ n: 1 });
    });

    it('keeps a step that throws to its own rule: the others, and the scene starting, go on', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        registerScript('bomb', () => ({ go: () => { throw new Error('boom'); } }), { actions: [{ name: 'go' }] });
        const { find } = play([
            { id: 'b', name: 'Bomb', components: [{ type: 'script', id: 'sb', ref: 'bomb' }] },
            { id: 'sign', name: 'Sign' },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'bad', when: { on: 'start' }, do: [{ do: 'call', box: 'Bomb', script: 'bomb', action: 'go' }, { do: 'hide', box: 'Bomb' }] },
                { id: 'good', when: { on: 'start' }, do: [{ do: 'hide', box: 'Sign' }] },
            ] }] },
        ]);
        expect(find('Sign').visible).toBe(false);
        expect(find('Bomb').visible).toBe(true);
        expect(error.mock.calls.some((call: unknown[]) => String(call[0]).includes("rule 'bad' on 'Rules': step 1 threw"))).toBe(true);
        error.mockRestore();
    });

    it('lets go of the scene when its box goes, leaving nothing behind there', () => {
        const { store } = createTestGame({}, createFakeCanvas());
        let spawn!: () => TGameObject;
        const root = startTestScene(store, 'Level', () => {
            spawn = useSpawn(() => { useRules([{ id: 'r', when: { on: 'report', box: 'X', report: 'y' }, do: [] }]); });
            return createScene();
        });
        const before = root.cleanups.length;
        const one = spawn();
        expect(root.cleanups.length).toBe(before + 1);
        destroy(one);
        for (let i = 0; i < 4; i++) destroy(spawn());
        tick(store, createFrameContext(), 16, 0);
        expect(root.cleanups.length).toBe(before);
    });

    it('stops rules that set one another off for ever', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        play([
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'kick', when: { on: 'start' }, do: [{ do: 'report', report: 'ping' }] },
                { id: 'loop', when: { on: 'report', box: '', report: 'ping' }, do: [{ do: 'report', report: 'ping' }] },
            ] }] },
        ]);
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('more than 32 deep'))).toBe(true);
    });
});

describe('a rules component in a document', () => {
    it('is written back as it was read', () => {
        const rules: TRule[] = [{ id: 'a', when: { on: 'report', box: 'Coin', report: 'picked' }, if: [{ store: 'score', field: 'points', is: '<', value: 3 }], do: [{ do: 'scene', scene: 'Win' }], once: true }];
        const { root } = play([{ id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules }] }]);
        const written = serializeScene(root as TGameObject);
        const box = written.root.children.find((b) => b.name === 'Rules')!;
        expect(box.components).toEqual([{ type: 'rules', id: 'rr', rules }]);
    });

    it('keeps what it understands of each rule and leaves the rest out, but for a condition, which holds it back', () => {
        expect(parseRules([
            { id: 'ok', when: { on: 'start' }, do: [{ do: 'wait', seconds: 1 }, { do: 'fly' }, { do: 'store', store: 's', field: 'f' }], if: [{ payload: 'x', is: '~', value: 1 }] },
            { id: 'no-when', when: { on: 'sometime' }, do: [] },
            { when: { on: 'start' }, do: [] },
            'nonsense',
        ])).toEqual([{ id: 'ok', when: { on: 'start' }, if: [{ payload: 'x', is: '~', value: 1 } as unknown as TRuleCondition], do: [{ do: 'wait', seconds: 1 }] }]);
    });

    it('in a copy, means the copy\'s own pieces', () => {
        const box = parseSceneDoc({
            format: SCENE_FORMAT, version: 1, name: 'Lamp', assets: [],
            root: { id: 'lamp-root', name: 'Lamp', transform: { x: 0, y: 0 }, components: [], children: [{
                id: 'lamp', name: 'Lamp', transform: { x: 0, y: 0 },
                components: [{ type: 'rules', id: 'lr', rules: [{ id: 'off', when: { on: 'start' }, do: [{ do: 'hide', box: 'bulb' }, { do: 'call', box: '', script: 'lamp', action: 'aim', params: { at: 'bulb', how: 'Bulb' } }] }] }],
                children: [{ id: 'bulb', name: 'Bulb', transform: { x: 0, y: 0 }, components: [], children: [] }],
            }] },
        }, 'boxes/Lamp.box');
        const aimed: unknown[] = [];
        registerScript('lamp', () => ({ aim: (params: unknown) => { aimed.push(params); } }), { actions: [{ name: 'aim' }] });
        const lamp = box.root.children[0]!;
        lamp.components.unshift({ type: 'script', id: 'ls', ref: 'lamp' });
        const { store } = createTestGame({}, createFakeCanvas());
        let spawn!: (d: typeof box) => TGameObject;
        startTestScene(store, 'Room', () => {
            spawn = useSpawn(objectFromDoc, { parent: 'scene' });
            return createScene();
        });
        const first = spawn(box);
        const second = spawn(box);
        expect(first.children[0]!.visible).toBe(false);
        expect(second.children[0]!.visible).toBe(false);
        // An action's setting naming a piece is the copy's piece too; a text that is no id stays.
        expect(aimed).toEqual([{ at: first.children[0]!.id, how: 'Bulb' }, { at: second.children[0]!.id, how: 'Bulb' }]);
    });
});

describe('watchRules', () => {
    it('tells a tool what each rule did, and why one did not', () => {
        const { pick } = behaviours();
        createGameStore({ key: 'score', state: { points: 5 } });
        const traces: Array<{ what: string; rule: string; step?: number; condition?: number; seen?: unknown; said?: string; from?: string }> = [];
        const stop = watchRules((t) => traces.push({ what: t.what, rule: t.rule.id, step: t.step, condition: t.condition, seen: t.seen, said: t.said, from: t.from?.name }));
        play([
            { id: 'c1', name: 'Coin', components: [{ type: 'script', id: 's1', ref: 'coin' }] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'low', when: { on: 'report', box: 'Coin', report: 'picked' }, if: [{ store: 'score', field: 'points', is: '<', value: 3 }], do: [{ do: 'hide', box: 'Coin' }] },
                { id: 'go', when: { on: 'report', box: 'Coin', report: 'picked' }, do: [{ do: 'store', store: 'score', field: 'points', add: 1 }, { do: 'hide', box: 'Nobody' }], once: true },
            ] }] },
        ]);
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        pick[0]!();
        pick[0]!();
        stop();
        pick[0]!();

        const one = (t: (typeof traces)[number]) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined));
        expect(traces.map(one)).toEqual([
            { what: 'armed', rule: 'low' },
            { what: 'armed', rule: 'go' },
            { what: 'held', rule: 'low', condition: 0, seen: 5, from: 'Coin' },
            { what: 'fired', rule: 'go', from: 'Coin' },
            { what: 'step', rule: 'go', step: 0 },
            { what: 'passed', rule: 'go', step: 1, said: "there is no box 'Nobody' to act on" },
            { what: 'held', rule: 'low', condition: 0, seen: 6, from: 'Coin' },
            { what: 'once', rule: 'go', from: 'Coin' },
        ]);
    });
});

describe('a trace after a wait', () => {
    it('has the time the step ran at', () => {
        const times: number[] = [];
        const stop = watchRules((t) => { if (t.what === 'step' && t.step === 1) times.push(t.time); });
        const { frame } = play([
            { id: 's', name: 'Sign' },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'later', when: { on: 'start' }, do: [{ do: 'wait', seconds: 0.1 }, { do: 'hide', box: 'Sign' }] },
            ] }] },
        ]);
        for (let i = 0; i < 10; i++) frame(0.02);
        stop();
        expect(times).toHaveLength(1);
        expect(times[0]!).toBeGreaterThanOrEqual(0.1);
    });
});

describe('say and sound', () => {
    it('says words on a box\'s texts, with what came with the report', () => {
        let send!: (payload: unknown) => void;
        registerScript('teller', () => {
            const told = useReport<{ by: string }>('homerun');
            send = (payload) => told(payload as { by: string });
        });
        const { find } = play([
            { id: 't', name: 'Teller', components: [{ type: 'script', id: 's', ref: 'teller' }] },
            { id: 'b', name: 'Banner', components: [{ type: 'text', id: 'tx', text: 'READY', font: 'nacatamalon:square' }] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'shout', when: { on: 'report', box: 'Teller', report: 'homerun' }, do: [{ do: 'say', box: 'Banner', text: '{by} HITS IT OUT! {nobody} {constructor}' }] },
            ] }] },
        ]);
        send({ by: 'NACA' });
        const label = find('Banner').drawables.find((d) => d.type === 'text') as unknown as { text: string };
        expect(label.text).toBe('NACA HITS IT OUT! {nobody} {constructor}');
    });

    it('says them on the texts the box is laid out with, the one in front in its colour, not on a behaviour\'s', () => {
        registerScript('letters', () => { createText({ text: 'L', font: 'nacatamalon:square' }); });
        const { find } = play([
            { id: 'b', name: 'Banner', components: [
                { type: 'text', id: 'shadow', text: '', font: 'nacatamalon:square' },
                { type: 'text', id: 'front', text: '', font: 'nacatamalon:square' },
                { type: 'script', id: 's', ref: 'letters' },
            ] },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'go', when: { on: 'start' }, do: [{ do: 'say', box: 'Banner', text: 'STRIKE!', color: '#ff0000' }] },
            ] }] },
        ]);
        const texts = find('Banner').drawables.filter((d) => d.type === 'text') as unknown as Array<{ id: string; text: string; tint: { r: number; g: number } }>;
        expect(texts.map((t) => t.text)).toEqual(['STRIKE!', 'STRIKE!', 'L']);
        expect(texts[1]!.tint.r).toBe(1);
        expect(texts[1]!.tint.g).toBe(0);
        expect(texts[0]!.tint.g).toBe(1);
    });

    it('says why when the box has no text, or no sound', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const said: string[] = [];
        const stop = watchRules((t) => { if (t.what === 'passed') said.push(t.said ?? ''); });
        play([
            { id: 'e', name: 'Empty' },
            { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                { id: 'go', when: { on: 'start' }, do: [{ do: 'say', box: 'Empty', text: 'hi' }, { do: 'sound', box: 'Empty', sound: '' }, { do: 'sound', box: 'Empty', sound: 'cheer' }] },
            ] }] },
        ]);
        stop();
        expect(said).toEqual(["'Empty' has no text to say it with", "'Empty' carries no sound", "'Empty' carries no sound 'cheer'"]);
    });

    it('plays a sound by the name of the box inside that carries it, whatever its file', () => {
        const audio = installFakeAudio();
        const fetched = spyOn(globalThis, 'fetch').mockImplementation((async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch);
        try {
            registerScript('throw-sound', () => { useSound({ src: '/sfx/throw.wav' }, { id: 'snd' }); });
            const passed: string[] = [];
            const done: number[] = [];
            const stop = watchRules((t) => {
                if (t.what === 'passed') passed.push(t.said ?? '');
                if (t.what === 'step') done.push(t.step ?? -1);
            });
            play([
                { id: 'sfx', name: 'Sfx', children: [{ id: 'p', name: 'Pitch', components: [{ type: 'script', id: 's', ref: 'throw-sound' }] }] },
                { id: 'r', name: 'Rules', components: [{ type: 'rules', id: 'rr', rules: [
                    { id: 'go', when: { on: 'start' }, do: [{ do: 'sound', box: 'Sfx', sound: 'Pitch' }, { do: 'sound', box: 'Sfx', sound: 'throw' }] },
                ] }] },
            ]);
            stop();
            expect(passed).toEqual([]);
            expect(done).toHaveLength(2);
        } finally {
            fetched.mockRestore();
            audio.restore();
        }
    });

    it('keep a condition they cannot read as written, and it never holds', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const odd = { store: 'score', field: 'points', is: '=', value: 1 } as unknown as TRuleCondition;
        expect(parseRules([{ id: 'a', when: { on: 'start' }, if: [odd], do: [{ do: 'hide', box: '' }] }])[0]!.if).toEqual([odd]);
        const held: string[] = [];
        const stop = watchRules((t) => { if (t.what === 'held') held.push(t.said ?? ''); });
        const { find } = play([
            { id: 'b', name: 'Box', components: [{ type: 'rules', id: 'rr', rules: [{ id: 'a', when: { on: 'start' }, if: [odd], do: [{ do: 'hide', box: '' }] }] }] },
        ]);
        stop();
        expect(held).toEqual(['its condition cannot be read']);
        expect(find('Box').visible).not.toBe(false);
        expect(String(warn.mock.calls[0]?.[0])).toContain('cannot be read');
    });

    it('are read back from a file', () => {
        expect(parseRules([{ id: 'a', when: { on: 'start' }, do: [{ do: 'say', box: 'B', text: 'GO', color: '#fff' }, { do: 'sound', box: '', sound: 'cheer' }, { do: 'say', box: 'B' }] }]))
            .toEqual([{ id: 'a', when: { on: 'start' }, do: [{ do: 'say', box: 'B', text: 'GO', color: '#fff' }, { do: 'sound', box: '', sound: 'cheer' }] }]);
    });
});

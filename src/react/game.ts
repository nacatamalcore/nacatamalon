'use client';

import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createGame } from '../game/bootstrap/create_game';
import type { TGameHandle } from '../game/handle';
import type { TGameOptions } from '../game/types/t_game_options';
import type { TSceneFn } from '../scene';
import { GameContext } from './game_context';

/**
 * How the native runtime introduces itself: the `navigator.userAgent` it gives the page it
 * simulates.
 */
const NATIVE_USER_AGENT = 'nacatamalon-native';

/**
 * What `<Game>` is given.
 *
 * @category React
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameProps = {
    /**
     * Its resolution, background, and how it scales to the page: the same options `createGame`
     * takes. **Read once, when the game starts.** Changing them later does nothing; give `<Game>` a
     * new `key` to start a new game with the new ones.
     */
    options: TGameOptions;
    /**
     * The game's scenes, keyed by name, as `createGame` takes them. Read once too, so writing the
     * object in place (`scenes={{ Title, Level }}`) does not restart the game on every render.
     */
    scenes: Readonly<Record<string, TSceneFn>>;
    /**
     * The scene it starts on. The first one when left out.
     */
    initialScene?: string;
    /**
     * Told when the renderer is up, with the game's handle.
     */
    onReady?: (game: TGameHandle) => void;
    /**
     * Told why the game could not start.
     */
    onError?: (error: Error) => void;
    /**
     * Drawn over the game: the HUD, the menus. Position them with `position: absolute`; they sit on
     * top of the canvas and go full screen with it.
     */
    children?: ReactNode;
    /**
     * For the element that holds the canvas and the children.
     */
    className?: string;
    /**
     * For the element that holds the canvas and the children. It is `position: relative` unless
     * this says otherwise, so the children are placed over the game.
     */
    style?: CSSProperties;
};

/**
 * A game inside a React page: the canvas, and whatever React draws over it.
 *
 * The game runs in the engine and the page around it runs in React, and each keeps its own rules.
 * A scene's body still runs once and never re-renders; the HUD inside `<Game>` re-renders as React
 * components do, reading the game's stores with `useGameStore` and its signals with `useSignal`.
 *
 * The canvas and the children share one element on purpose. Full screen takes the canvas's parent,
 * so a HUD placed there goes full screen with the game instead of being left behind on the page.
 *
 * Under `StrictMode` the game is started, destroyed and started again on mount, the way React tests
 * every effect while developing. The first one is torn down before its renderer finishes starting.
 *
 * **Browser only, for now.** The native runtime draws what the engine draws and nothing else: the
 * page around the canvas is simulated so the game does not crash, but it has no renderer. A HUD
 * made of React components is page, so a game exported to desktop runs without it. A game meant to
 * ship natively builds its HUD with the engine (`createText`, sprites, `createNineSlice`).
 *
 * @example
 * ```tsx
 * declare const Level: TSceneFn;
 * declare const Hud: () => ReactNode;
 *
 * export const App = () => (
 *     <Game options={{ width: 320, height: 224, scaling: 'integer' }} scenes={{ Level }}>
 *         <Hud />
 *     </Game>
 * );
 * ```
 *
 * @category React
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const Game = ({ options, scenes, initialScene, onReady, onError, children, className, style }: TGameProps): ReactNode => {
    const host = useRef<HTMLDivElement>(null);
    const [handle, setHandle] = useState<TGameHandle | null>(null);

    // Read through refs so the effect below can start the game once and still call the latest ones.
    const ready = useRef(onReady);
    const failed = useRef(onError);
    ready.current = onReady;
    failed.current = onError;

    // Taken on the first render and never again: see `options` and `scenes` on `TGameProps`.
    const start = useRef({ options, scenes, initialScene });
    const hasChildren = useRef(false);
    hasChildren.current = children !== undefined && children !== null && children !== false;

    useEffect(() => {
        const element = host.current;
        if (element === null) return;

        // Said as it happens, because the symptom is a game that runs perfectly with half its
        // screen missing, and nothing else points at why.
        if (hasChildren.current && globalThis.navigator?.userAgent === NATIVE_USER_AGENT) {
            console.warn('[NacatamalOn] <Game> (nacatamalon/react): the native runtime only shows what the engine draws, so the React components inside <Game> are not on screen. Build this HUD with the engine (createText, sprites, createNineSlice) for a native game.');
        }

        const { options, scenes, initialScene } = start.current;
        const instance = createGame(element, options)(scenes, initialScene);
        // The canvas goes first, before the children React has already put there. Between two
        // positioned siblings the later one is drawn on top, so a page that gives its canvas a
        // `position` (to lift it over something of its own) would otherwise cover the HUD.
        const canvas = element.querySelector(':scope > canvas');
        if (canvas !== null) element.prepend(canvas);
        const offReady = instance.on('ready', (game) => {
            setHandle(game);
            ready.current?.(game);
        });
        const offError = instance.on('error', (error) => failed.current?.(error));

        return () => {
            offReady();
            offError();
            instance.destroy();
            setHandle(null);
        };
    }, []);

    return createElement(
        'div',
        { ref: host, className, style: { position: 'relative', ...style } },
        createElement(GameContext.Provider, { value: { handle } }, children),
    );
};

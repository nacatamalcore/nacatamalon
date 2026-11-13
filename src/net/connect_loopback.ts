import type { TNetConnection } from './types/t_net_connection';
import type { TServer } from './types/t_server';

/**
 * How the pretend line behaves.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoopbackOptions = {
    /**
     * Seconds each message takes to reach the other end, each way: `0.05` is a player 100 ms away
     * from the server, there and back. Default `0`, which still arrives later and never at once, as
     * over a real line.
     */
    delay?: number;
};

/**
 * One end of the pretend line: what it hears, and the other end to send to.
 */
type TEnd = {
    message: ((text: string) => void) | null;
    close: ((reason?: string) => void) | null;
    /** When the last message sent to this end arrives, so the next one never overtakes it. */
    lastArrival: number;
    closed: boolean;
};

/**
 * Connects a player's game to a server in the same page or process, with no network at all: a line
 * in memory, given to `server.accept` at once, whose other end goes to `useNet().connect`. For trying
 * an online game in one page (the server's room and two players side by side), and for tests.
 *
 * Messages still go as text, so what JSON cannot carry fails here as it would over the internet, and
 * still arrive later, in order, never in the middle of a frame. `delay` makes the line as slow as a
 * real one, to see how the game feels from far away.
 *
 * @example
 * ```ts
 * import { createScene, type TSceneFn } from 'nacatamalon';
 * import { connectLoopback, createServer, useNet } from 'nacatamalon/net';
 *
 * // The same scene runs in the server's room and in the player's page.
 * const Lobby: TSceneFn = () => {
 *     const net = useNet();
 *     if (net.role === 'client') {
 *         // Into the server below, 50 ms away each way.
 *         net.connect(connectLoopback(server, { delay: 0.05 }), { room: 'lobby' });
 *     }
 *     return createScene();
 * };
 *
 * const server = createServer({ width: 320, height: 180, scenes: { Lobby }, step: 20 });
 * ```
 *
 * @param server The server to connect to.
 * @param options How slow the line is.
 * @returns The player's end of the line.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const connectLoopback = (server: TServer, options: TLoopbackOptions = {}): TNetConnection => {
    const delay = options.delay ?? 0;
    if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
        throw new Error(`[NacatamalOn] connectLoopback: delay is in seconds, 0 or more, and got ${String(delay)}. 0.05 is a player 50 ms away each way.`);
    }
    const player: TEnd = { message: null, close: null, lastArrival: 0, closed: false };
    const host: TEnd = { message: null, close: null, lastArrival: 0, closed: false };

    const deliver = (to: TEnd, run: () => void): void => {
        const now = Date.now();
        const at = Math.max(now + delay * 1000, to.lastArrival);
        to.lastArrival = at;
        setTimeout(run, at - now);
    };
    const end = (from: TEnd, to: TEnd, reason?: string): void => {
        if (from.closed) return;
        from.closed = true;
        // The one closing knows at once; the other hears it after what was already on its way.
        from.close?.(reason);
        deliver(to, () => {
            if (to.closed) return;
            to.closed = true;
            to.close?.(reason);
        });
    };
    const side = (own: TEnd, other: TEnd): TNetConnection => ({
        send: (text) => {
            if (own.closed || other.closed) return;
            const copy = String(text);
            deliver(other, () => {
                if (!other.closed) other.message?.(copy);
            });
        },
        onMessage: (listener) => {
            own.message = listener;
        },
        onClose: (listener) => {
            own.close = listener;
        },
        close: (reason) => end(own, other, reason),
    });

    server.accept(side(host, player));
    return side(player, host);
};

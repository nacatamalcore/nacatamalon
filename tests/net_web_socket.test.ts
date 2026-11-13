import { describe, expect, it } from 'bun:test';
import { webSocketConnection } from '../src/net';

/**
 * `webSocketConnection` takes the text a socket hands over however it hands it: a browser's as a
 * string, some servers' (Bun's `ws`) as its bytes.
 */

type TListener = (event: { data?: unknown; reason?: string }) => void;

const fakeSocket = () => {
    const listeners = new Map<string, TListener[]>();
    return {
        readyState: 1,
        sent: [] as string[],
        send(text: string) { this.sent.push(text); },
        close() {},
        addEventListener(type: string, listener: TListener) {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        emit(type: string, event: { data?: unknown; reason?: string }) {
            for (const listener of listeners.get(type) ?? []) listener(event);
        },
    };
};

describe('webSocketConnection', () => {
    it('hears text as a string, as bytes and as a buffer, and leaves out what is not text', () => {
        const socket = fakeSocket();
        const heard: string[] = [];
        webSocketConnection(socket).onMessage((text) => heard.push(text));

        socket.emit('message', { data: 'hola' });
        socket.emit('message', { data: new TextEncoder().encode('ñandú') });
        socket.emit('message', { data: new TextEncoder().encode('búfer').buffer });
        socket.emit('message', { data: Buffer.from('desde Bun') });
        socket.emit('message', { data: 42 });

        expect(heard).toEqual(['hola', 'ñandú', 'búfer', 'desde Bun']);
    });
});

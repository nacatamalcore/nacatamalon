import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `listen(port)` in Node: the engine's own WebSocket over Node's HTTP server, nothing installed.
 * Run in a real Node (Bun opens its ports itself, and its `node:http` does not hand over the
 * socket of an upgrade), with a player connecting from here: the handshake, short and long
 * messages both ways, and a close each side hears.
 */

/** Node's version, or `null` when there is none to run. */
const nodeVersion = (): number[] | null => {
    try {
        const run = Bun.spawnSync(['node', '--version']);
        if (run.exitCode !== 0) return null;
        return run.stdout.toString().trim().replace(/^v/, '').split('.').map(Number);
    } catch {
        return null;
    }
};

const version = nodeVersion();
// `process.getBuiltinModule`, which the door asks Node's modules of, came with 20.16 and 22.3.
const hasNode = version !== null && (version[0]! > 22 || (version[0] === 22 && version[1]! >= 3) || (version[0] === 20 && version[1]! >= 16));

const SERVER = `
import { listenWithNode } from './node_listen.mjs';
const port = Number(process.argv[2]);
const listening = listenWithNode(port, (connection) => {
    connection.onMessage((text) => connection.send('echo:' + text));
    connection.onClose((reason) => { console.log('closed:' + reason); listening.stop(); setTimeout(() => process.exit(0), 50); });
});
console.log('listening');
`;

describe('createServer().listen in Node', () => {
    it.skipIf(!hasNode)('takes a WebSocket and carries text both ways', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'naca-node-listen-'));
        try {
            // Built in a process of its own: a build inside the test's would unsettle how it finds the
            // other test files' modules.
            const built = Bun.spawnSync([process.execPath, 'build', join(import.meta.dir, '../src/net/node_listen.ts'), '--target=node', '--format=esm', `--outfile=${join(dir, 'node_listen.mjs')}`]);
            expect(built.exitCode).toBe(0);
            writeFileSync(join(dir, 'server.mjs'), SERVER);
            const port = 20000 + Math.floor(Math.random() * 20000);
            const node = Bun.spawn(['node', join(dir, 'server.mjs'), String(port)], { stdout: 'pipe', stderr: 'pipe' });
            const reader = node.stdout.getReader();
            let out = '';
            const readUntil = async (text: string) => {
                while (!out.includes(text)) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    out += new TextDecoder().decode(value);
                }
            };
            await readUntil('listening');

            const socket = new WebSocket(`ws://127.0.0.1:${port}`);
            const heard: string[] = [];
            await new Promise<void>((done, fail) => {
                socket.addEventListener('open', () => done());
                socket.addEventListener('error', () => fail(new Error('no connection')));
            });
            const long = 'ñ'.repeat(40_000);
            const answers = new Promise<void>((done) => {
                socket.addEventListener('message', (event) => {
                    heard.push(String(event.data));
                    if (heard.length === 2) done();
                });
            });
            socket.send('hola');
            socket.send(long);
            await answers;
            expect(heard).toEqual(['echo:hola', `echo:${long}`]);

            socket.close(1000, 'bye');
            await readUntil('closed:');
            expect(out).toContain('closed:bye');
            await node.exited;
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

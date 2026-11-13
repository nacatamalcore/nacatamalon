import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSongDoc, renderSong } from '../src/audio/synth';
import { parseSongNotes } from '../src/audio/synth/parse_song_notes';

/**
 * The guides that ship with the engine (`guides/*.md`) say what is true: every block of code in
 * them compiles against the engine, every whole song in them plays with no mistakes, and every line
 * of notes in them reads. A guide that drifts from the engine is worse than none.
 */

const GUIDES = join(import.meta.dir, '..', 'guides');
const ROOT = join(import.meta.dir, '..', 'src');
const files = readdirSync(GUIDES).filter((file) => file.endsWith('.md'));

const blocksOf = (text: string, language: string): string[] =>
    [...text.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map((match) => match[1]!);

const OPTIONS: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ['@webgpu/types'],
    typeRoots: [join(import.meta.dir, '..', 'node_modules'), join(import.meta.dir, '..', 'node_modules', '@types')],
    // Every door to its source, as `package.json` opens them: the package's own `dist/` is not
    // there to fall back on when the tests run before a build (CI does).
    paths: {
        nacatamalon: [join(ROOT, 'index.ts')],
        'nacatamalon/authoring': [join(ROOT, 'authoring', 'index.ts')],
        'nacatamalon/extend': [join(ROOT, 'extend', 'index.ts')],
        'nacatamalon/extend/gpu': [join(ROOT, 'extend', 'gpu', 'index.ts')],
        'nacatamalon/react': [join(ROOT, 'react', 'index.ts')],
        'nacatamalon/headless': [join(ROOT, 'headless', 'index.ts')],
        'nacatamalon/speech': [join(ROOT, 'speech', 'index.ts')],
        'nacatamalon/net': [join(ROOT, 'net', 'index.ts')],
        'nacatamalon/physics2d': [join(ROOT, 'physics', 'box2d', 'index.ts')],
        'nacatamalon/physics3d': [join(ROOT, 'physics', 'box3d', 'index.ts')],
    },
};

/** Where a guide's blocks are put to compile: a folder that is not there, next to the engine's. */
const GUIDE_DIR = join(ROOT, '..', '__guide', 'src');

/**
 * The file a block stands for when its first line names one (`// src/game.ts`), so the guide's other
 * blocks can import it (`from './game'`), as the files of a game import each other.
 */
const namedFile = (code: string): string | null => /^\/\/ src\/([\w/]+\.ts)\s*$/m.exec(code.split('\n')[0] ?? '')?.[1] ?? null;

/**
 * What is wrong in each block of code, compiled against the engine. Each block is a file of its own,
 * so they cannot see each other's names unless one is named for its file, but all of them are one
 * program: the engine is read and checked once for the whole guide rather than once per block, which
 * on a slower machine (CI) went past the time a test is given.
 */
const compileEach = (codes: string[]): string[][] => {
    const sources = new Map(codes.map((code, i) => [join(GUIDE_DIR, namedFile(code) ?? `__example_${i}.ts`), `${code}\nexport {};\n`]));
    // Packages a guide shows a game using that are not here: a plugin (any package named
    // `nacatamalon-…`), and the servers and lines the online guide carries the game over. They are
    // taken as they come; the engine's own doors (`nacatamalon/…`) are still checked.
    const outside = join(ROOT, '..', '__guide_outside.d.ts');
    const stubs = new Map([[outside, [
        ...['nacatamalon-*', 'ws', 'socket.io', 'socket.io-client', 'colyseus.js'].map((name) => `declare module '${name}';`),
        // Colyseus's player is named as a type, which a module taken as it comes cannot give.
        "declare module 'colyseus' { export type Client = any; export const Room: any; export const Server: any; }",
    ].join('\n')]]);
    const host = ts.createCompilerHost(OPTIONS);
    const { readFile, fileExists, getSourceFile } = host;
    host.readFile = (file) => sources.get(file) ?? stubs.get(file) ?? readFile(file);
    host.fileExists = (file) => sources.has(file) || stubs.has(file) || fileExists(file);
    // The guide's folder is not there, so asking whether it is says yes.
    const { directoryExists } = host;
    host.directoryExists = (folder) => folder.startsWith(join(ROOT, '..', '__guide')) || (directoryExists?.(folder) ?? false);
    host.getSourceFile = (file, version) => {
        const source = sources.get(file) ?? stubs.get(file);
        return source === undefined ? getSourceFile(file, version) : ts.createSourceFile(file, source, version);
    };
    const program = ts.createProgram([...sources.keys(), outside], OPTIONS, host);
    return [...sources.keys()].map((name) =>
        ts.getPreEmitDiagnostics(program, program.getSourceFile(name)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')));
};

describe('the guides', () => {
    it('are there, in English and in Spanish', () => {
        expect(files.sort()).toEqual(['gpu_pass.es.md', 'gpu_pass.md', 'lighting_2d.es.md', 'lighting_2d.md', 'music.es.md', 'music.md', 'online.es.md', 'online.md', 'plugins.es.md', 'plugins.md']);
    });

    for (const file of files) {
        const text = readFileSync(join(GUIDES, file), 'utf8');

        it(`${file}: no two blocks stand for the same file`, () => {
            const named = blocksOf(text, 'ts').map(namedFile).filter((name) => name !== null);
            expect(named.filter((name, i) => named.indexOf(name) !== i)).toEqual([]);
        });

        it(`${file}: every block of code compiles`, () => {
            const results = compileEach(blocksOf(text, 'ts'));
            expect(results.every((errors) => errors.length === 0) ? [] : results).toEqual([]);
        });

        if (file.startsWith('music.')) it(`${file}: every whole song plays with no mistakes`, () => {
            const songs = blocksOf(text, 'json').flatMap((block) => {
                try {
                    const doc = JSON.parse(block) as { voices?: unknown };
                    return doc.voices === undefined ? [] : [doc];
                } catch {
                    return [];
                }
            });
            expect(songs.length).toBeGreaterThan(0);
            for (const raw of songs) {
                const rendered = renderSong(parseSongDoc(raw, file));
                expect([rendered.errors, rendered.instrumentErrors]).toEqual([[], []]);
            }
        });

        it(`${file}: every link within it leads to one of its headings`, () => {
            // A heading's anchor as GitHub and the website make it.
            const slug = (heading: string) => heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
            const anchors = new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1]!)));
            const links = [...text.matchAll(/\]\(#([^)]+)\)/g)].map((match) => match[1]!);
            if (file.startsWith('music.')) expect(links.length).toBeGreaterThan(5);
            expect(links.filter((link) => !anchors.has(link))).toEqual([]);
        });

        if (file.startsWith('music.')) it(`${file}: every line of notes reads`, () => {
            const lines = [
                ...[...text.matchAll(/"notes": "((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]!),
                ...blocksOf(text, 'text').map((block) => block.trim()),
            ].filter((line) => line !== '...');
            expect(lines.length).toBeGreaterThan(5);
            for (const line of lines) {
                const voice = /(^|\s|@\S+\s)x/.test(line) ? 'noise' : 'pulse1';
                expect([line, parseSongNotes(line, voice, [4, 4]).errors]).toEqual([line, []]);
            }
        });
    }
});

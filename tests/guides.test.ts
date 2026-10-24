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
        'nacatamalon/react': [join(ROOT, 'react', 'index.ts')],
        'nacatamalon/headless': [join(ROOT, 'headless', 'index.ts')],
        'nacatamalon/speech': [join(ROOT, 'speech', 'index.ts')],
        'nacatamalon/physics2d': [join(ROOT, 'physics', 'rapier2d', 'index.ts')],
        'nacatamalon/physics3d': [join(ROOT, 'physics', 'box3d', 'index.ts')],
    },
};

/** What is wrong when a block of code is compiled on its own, against the engine. */
const compile = (code: string): string[] => {
    const name = join(ROOT, '..', '__guide_example.ts');
    const source = `${code}\nexport {};\n`;
    const host = ts.createCompilerHost(OPTIONS);
    const { readFile, fileExists, getSourceFile } = host;
    host.readFile = (file) => (file === name ? source : readFile(file));
    host.fileExists = (file) => file === name || fileExists(file);
    host.getSourceFile = (file, version) => (file === name ? ts.createSourceFile(file, source, version) : getSourceFile(file, version));
    const program = ts.createProgram([name], OPTIONS, host);
    return ts.getPreEmitDiagnostics(program, program.getSourceFile(name)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
};

describe('the guides', () => {
    it('are there, in English and in Spanish', () => {
        expect(files.sort()).toEqual(['music.es.md', 'music.md']);
    });

    for (const file of files) {
        const text = readFileSync(join(GUIDES, file), 'utf8');

        it(`${file}: every block of code compiles`, () => {
            const results = blocksOf(text, 'ts').map(compile);
            expect(results.every((errors) => errors.length === 0) ? [] : results).toEqual([]);
        });

        it(`${file}: every whole song plays with no mistakes`, () => {
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
            expect(links.length).toBeGreaterThan(5);
            expect(links.filter((link) => !anchors.has(link))).toEqual([]);
        });

        it(`${file}: every line of notes reads`, () => {
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

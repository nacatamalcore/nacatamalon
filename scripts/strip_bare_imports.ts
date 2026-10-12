#!/usr/bin/env bun
/**
 * Takes out of the built files the imports of a shared chunk that bring nothing in
 * (`import "./chunk-ABC123.js";`), which the bundler leaves to keep the order its modules ran in.
 *
 * The package says it has no side effects (`"sideEffects": false`), so a game's bundler drops them
 * anyway, and says so with a warning per line on every build of every game. Nothing is lost: a
 * chunk whose code is used is imported by name where it is used. Each line is left empty rather than
 * removed, so the source maps still point at the right lines.
 *
 * Run: `bun scripts/strip_bare_imports.ts [dist folder]` (`bun run build:strip`, which `bun run build` runs after
 * esbuild; the package check runs it on the `dist` it builds).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BARE = /^import "\.\/chunk-[A-Z0-9]+\.js";$/gm;

let stripped = 0;
for (const file of readdirSync(DIST).filter((name) => name.endsWith('.js'))) {
    const path = join(DIST, file);
    const code = readFileSync(path, 'utf8');
    const next = code.replace(BARE, () => {
        stripped += 1;
        return '';
    });
    if (next !== code) writeFileSync(path, next);
}
console.log(`[build] ${stripped} imports of a chunk that brought nothing in, left out`);

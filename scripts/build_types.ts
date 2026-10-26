#!/usr/bin/env bun
/**
 * Writes the published types: one `.d.ts` per door, holding what that door exports and what its
 * types name, and nothing else.
 *
 * `tsc` alone writes a declaration for every file in `src/`, a thousand of them, and a game's "go to
 * definition" lands in the engine's insides. Here `tsc` writes them to a folder of its own and
 * rollup-plugin-dts gathers them per door. What two doors share goes to `shared/` once, so a type is
 * the same type in `nacatamalon` and in `nacatamalon/physics2d`.
 *
 * Which doors there are, and where each one's file goes, is read from `exports` in `package.json`.
 *
 * What is marked `@internal` is left out (`stripInternal`), a whole declaration or one field of a
 * public type: what an engine object holds for itself is not something a game can come to depend on.
 * Leaving it out now and showing it later breaks nobody; the other way round breaks every game that
 * used it.
 *
 * It fails when a door names a type that no door exports: a game can be handed one but cannot write
 * its name, and a library over the engine that emits declarations gets TS2742. And when what a door
 * shows still names something left out, which a public field not marked `@internal` does when its
 * type is.
 *
 * Run: `bun scripts/build_types.ts [types folder]` (`bun run build:types`, which `bun run build`
 * runs; the package check runs it on the `dist` it builds).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'types');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * Where `tsc` writes each door's entry, by its key in `exports`.
 */
const ENTRIES: Record<string, string> = {
    '.': 'index.d.ts',
    './authoring': 'authoring/index.d.ts',
    './extend': 'extend/index.d.ts',
    './react': 'react/index.d.ts',
    './headless': 'headless/index.d.ts',
    './speech': 'speech/index.d.ts',
    './physics2d': 'physics/rapier2d/index.d.ts',
    './physics3d': 'physics/box3d/index.d.ts',
};

const fail = (message: string): never => {
    console.error(`[types] ${message}`);
    process.exit(1);
};

const emit = mkdtempSync(join(tmpdir(), 'nacatamalon-types-'));
const tsc = join(dirname(Bun.resolveSync('typescript/package.json', ROOT)), 'bin', 'tsc');
const compiled = Bun.spawnSync([tsc, '-p', 'tsconfig.build.json', '--outDir', emit, '--stripInternal'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
if (compiled.exitCode !== 0) fail('tsc failed');

const input: Record<string, string> = {};
for (const [door, target] of Object.entries(pkg.exports as Record<string, { types?: string }>)) {
    if (door === './package.json') continue;
    const entry = ENTRIES[door] ?? fail(`${door} is in exports but not in ENTRIES`);
    const name = target.types?.match(/^\.\/dist\/types\/(.+)\.d\.ts$/)?.[1] ?? fail(`${door}: types should be ./dist/types/<name>.d.ts`);
    input[name] = join(emit, entry);
}

// What `stripInternal` leaves: the declaration goes, an import of it in the file next door stays.
// rollup reads every file on the way to a door and refuses one importing a name that is not there,
// even when nothing reaching a door uses it, so a missing one is filled with a stand-in. Unused, it
// is thrown away with the rest; used, it would be in what is written, and that is checked below.
const SHIM = '_missingExportShim';

const outside = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
const unexported: string[] = [];

const bundle = await rollup({
    input,
    external: (id) => outside.some((name) => id === name || id.startsWith(`${name}/`)),
    plugins: [dts()],
    shimMissingExports: true,
    onwarn: (warning, warn) => {
        // A cycle between chunks matters to code that runs in order; declarations do not run.
        if (warning.code === 'CYCLIC_CROSS_CHUNK_REEXPORT' || warning.code === 'CIRCULAR_DEPENDENCY') return;
        if (warning.code === 'SHIMMED_EXPORT') return;
        if (warning.message.includes('private shared type exports')) {
            unexported.push(warning.message);
            return;
        }
        warn(warning);
    },
});
rmSync(OUT, { recursive: true, force: true });
const { output } = await bundle.write({
    dir: OUT,
    format: 'es',
    entryFileNames: '[name].d.ts',
    chunkFileNames: (chunk) => `shared/${chunk.name.replace(/\.d$/, '')}-[hash].d.ts`,
});
await bundle.close();
rmSync(emit, { recursive: true, force: true });

const leftOut = output.filter((file) => file.type === 'chunk' && file.code.includes(SHIM)).map((file) => file.fileName);
if (leftOut.length > 0) {
    fail(`what a door shows names something marked @internal (mark the field that names it, or the type is public): ${leftOut.join(', ')}`);
}
if (unexported.length > 0) {
    fail(`a door names a type no door exports; export it, or stop naming it:\n${unexported.join('\n')}`);
}
console.log(`[types] ${Object.keys(input).length} doors written to ${OUT}`);

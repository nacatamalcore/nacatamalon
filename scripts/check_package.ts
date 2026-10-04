/**
 * The package as somebody who installs it from npm meets it.
 *
 * Everything inside this monorepo reaches the engine through `paths` and aliases that point at
 * `src/`, so none of it notices what the published package really ships. This builds it the way
 * `bun run build` does, installs it in a throwaway project with nothing else in it, and asks:
 *
 * - does the README's game, which imports only from `'nacatamalon'`, compile strict and without `skipLibCheck`,
 *   on this repo's TypeScript and on an older one? (A tool's type on the front door once broke
 *   every game on TypeScript 5.)
 * - does the README's physics example compile against the physics engines it installs?
 * - do the doors in `exports` resolve, and does a deep import into the engine's files fail?
 * - how big is that game once bundled, and did anything only a tool uses end up inside it?
 * - do the files for coding assistants ship (`llms.txt`, `llms-full.txt`), with the font's licence
 *   (`licenses/OFL.txt`), and does the game in `llms.txt` compile too?
 *
 * Run it with `bun run check:package`. `--offline` skips the older TypeScript, which is fetched.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const OLD_TYPESCRIPT = '5.4';

/**
 * Strings that only a tool's code contains. Names are minified away, so the check looks for text
 * that survives: two warnings from `nacatamalon/authoring`. (Not the shader node catalogue: a game
 * can load a `.shader` file at any time, and compiling one needs it.)
 */
const TOOL_ONLY = ['serializeScene: the shape', 'atlasDocFrames: a grid needs'];

const root = join(import.meta.dir, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const offline = process.argv.includes('--offline');
const work = mkdtempSync(join(tmpdir(), 'nacatamalon-package-'));
const failures: string[] = [];

const run = (cmd: string[], cwd: string): { code: number; out: string } => {
    const result = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { code: result.exitCode, out: `${result.stdout}${result.stderr}` };
};

const check = (ok: boolean, label: string, detail = ''): void => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) {
        failures.push(label);
        if (detail) console.log(detail.trim().split('\n').slice(0, 20).map((line) => `     ${line}`).join('\n'));
    }
};

/**
 * Where a dependency of the engine lives on this machine, to be installed next to the package.
 */
const installed = (name: string): string => dirname(Bun.resolveSync(`${name}/package.json`, root));

// 1. The package, built as `bun run build` builds it and holding only what `files` publishes.
const packageDir = join(work, 'node_modules', 'nacatamalon');
mkdirSync(packageDir, { recursive: true });
const esbuild = join(installed('esbuild'), 'bin', 'esbuild');
const tsc = join(installed('typescript'), 'bin', 'tsc');
const [, ...buildArgs] = (pkg.scripts['build:js'] as string).replace('--outdir=dist', `--outdir=${join(work, 'dist')}`).split(' ');
const js = run([esbuild, ...buildArgs], root);
check(js.code === 0, 'the JavaScript builds', js.out);
const types = run([tsc, '-p', 'tsconfig.build.json', '--outDir', join(work, 'dist', 'types')], root);
check(types.code === 0, 'the types build', types.out);

writeFileSync(join(packageDir, 'package.json'), JSON.stringify(pkg, null, 4));
// `llms-full.txt` is written by the build, not kept in git: written here too, so it is there to ship.
const llms = run(['bun', 'scripts/build_llms.ts'], root);
check(llms.code === 0, 'llms-full.txt builds', llms.out);
for (const entry of pkg.files as string[]) {
    const from = entry === 'dist' ? join(work, 'dist') : join(root, entry);
    if (existsSync(from)) cpSync(from, join(packageDir, entry), { recursive: true });
}

// Its dependencies sit beside it, the way an install hoists them, the physics engines among them.
const besideIt = (name: string): void => {
    const target = join(work, 'node_modules', name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(installed(name), target);
};
Object.keys(pkg.dependencies ?? {}).forEach(besideIt);

// 2. A game, in a project that holds nothing but it and the package.
mkdirSync(join(work, 'src'));
writeFileSync(join(work, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', lib: ['ES2022', 'DOM'],
        strict: true, noEmit: true, verbatimModuleSyntax: true, skipLibCheck: false,
    },
    include: ['src/game.ts'],
}, null, 4));
// The game is the README's own: the first thing anyone copies, so it is the example that must work.
const readme = readFileSync(join(packageDir, 'README.md'), 'utf8');
const [example, physicsExample] = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);
check(example !== undefined, 'the README has a TypeScript example');
writeFileSync(join(work, 'src', 'game.ts'), example ?? '');

for (const file of ['llms.txt', 'llms-full.txt', 'licenses/OFL.txt']) {
    check(existsSync(join(packageDir, file)), `${file} ships with the package`);
}

// The game in `llms.txt` is the one an assistant copies: it has to compile like the README's.
const llmsGuide = existsSync(join(packageDir, 'llms.txt')) ? readFileSync(join(packageDir, 'llms.txt'), 'utf8') : '';
const llmsExample = llmsGuide.match(/```ts\n([\s\S]*?)```/)?.[1];
check(llmsExample !== undefined, 'llms.txt has a TypeScript example');
writeFileSync(join(work, 'src', 'llms_game.ts'), llmsExample ?? '');
writeFileSync(join(work, 'tsconfig.llms.json'), JSON.stringify({ extends: './tsconfig.json', include: ['src/llms_game.ts'] }));
const llmsGame = run([tsc, '-p', 'tsconfig.llms.json'], work);
check(llmsGame.code === 0, 'the game in llms.txt compiles against it', llmsGame.out);

const game = run([tsc, '-p', '.'], work);
check(game.code === 0, `a game compiles against it (TypeScript ${run([tsc, '-v'], work).out.trim().replace('Version ', '')})`, game.out);
if (offline) {
    console.log(`skip TypeScript ${OLD_TYPESCRIPT} (--offline)`);
} else {
    const old = run(['bunx', '-p', `typescript@${OLD_TYPESCRIPT}`, 'tsc', '-p', '.'], work);
    check(old.code === 0, `a game compiles against it (TypeScript ${OLD_TYPESCRIPT})`, old.out);
}

// 3. The README's physics example, compiling against the physics engines installed beside it.
check(physicsExample !== undefined, 'the README has a physics example');
writeFileSync(join(work, 'src', 'physics.ts'), physicsExample ?? '');
// Rapier's own declarations (0.21) name `Symbol.dispose`, which lives in `ESNext.Disposable`: a
// requirement of the physics engine, not of ours, and one a project with `skipLibCheck` (every Vite
// template) never sees. The game check above keeps the plain library, so it still proves that a
// game without physics needs nothing extra.
const PHYSICS_LIB = ['ES2022', 'DOM', 'ESNext.Disposable'];
writeFileSync(join(work, 'tsconfig.physics.json'), JSON.stringify({ extends: './tsconfig.json', compilerOptions: { lib: PHYSICS_LIB }, include: ['src/physics.ts'] }));
const physics = run([tsc, '-p', 'tsconfig.physics.json'], work);
check(physics.code === 0, 'the physics example compiles against it', physics.out);

// 4. The doors: every one `exports` opens resolves, and the engine's own files do not.
const doors = Object.keys(pkg.exports).filter((door) => door !== './package.json').map((door) => door.replace(/^\./, 'nacatamalon'));
const deep = ['nacatamalon/src/index', 'nacatamalon/dist/types/index', 'nacatamalon/dist/index.js'];
writeFileSync(join(work, 'src', 'doors.ts'), [...doors, ...deep].map((spec, i) => `import * as door${i} from '${spec}';\nvoid door${i};`).join('\n'));
writeFileSync(join(work, 'tsconfig.doors.json'), JSON.stringify({ extends: './tsconfig.json', compilerOptions: { lib: PHYSICS_LIB }, include: ['src/doors.ts'] }));
const doorsOut = run([tsc, '-p', 'tsconfig.doors.json'], work).out;
const unresolved = (spec: string): boolean => doorsOut.includes(`'${spec}'`) && doorsOut.includes('TS2307');
for (const door of doors) check(!unresolved(door), `${door} resolves`, doorsOut);
for (const spec of deep) check(unresolved(spec), `${spec} is closed`);
const doorErrors = doorsOut.split('\n').filter((line) => line.includes('error TS') && !deep.some((spec) => line.includes(`'${spec}'`)));
check(doorErrors.length === 0, 'every door compiles', doorErrors.join('\n'));

// 5. The game, bundled: how big, and nothing a tool uses inside it.
const bundle = join(work, 'game.js');
const built = run([esbuild, 'src/game.ts', '--bundle', '--minify', '--format=esm', `--outfile=${bundle}`, '--log-level=warning'], work);
check(built.code === 0, 'the game bundles', built.out);
if (built.code === 0) {
    const code = readFileSync(bundle);
    console.log(`     ${(code.length / 1024).toFixed(0)} KB minified, ${(Bun.gzipSync(code).length / 1024).toFixed(0)} KB gzip`);
    const text = code.toString();
    for (const marker of TOOL_ONLY) check(!text.includes(marker), `the game carries no tool code ("${marker}")`);
}

rmSync(work, { recursive: true, force: true });
if (failures.length > 0) {
    console.log(`\n${failures.length} check(s) failed.`);
    process.exit(1);
}
console.log('\nThe package is fine as npm would ship it.');

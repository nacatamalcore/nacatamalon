#!/usr/bin/env bun
/**
 * The two things the build does for coding assistants:
 *
 * 1. Writes `llms-full.txt`: every symbol the package exports, with its signature and its JSDoc, in
 *    one plain-text file an assistant can read or search instead of walking hundreds of `.d.ts`.
 *    Generated from the source on every build, so it can never describe another version.
 * 2. Puts a note at the top of the published `index.d.ts`, the first file an assistant opens when it
 *    looks up how to use the package, pointing it at `llms.txt` (written by hand: the short guide).
 *    Added after `tsc`, which drops a file's leading comment from the declaration it writes.
 *
 * Run: `bun scripts/build_llms.ts` (the last step of `bun run build`, after the types).
 */
import ts from 'typescript';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };

/**
 * The doors, in the order a game meets them, and who each one is for.
 */
const DOORS: { spec: string; file: string; who: string }[] = [
    { spec: 'nacatamalon', file: 'src/index.ts', who: 'Everything a game calls.' },
    { spec: 'nacatamalon/physics2d', file: 'src/physics/rapier2d/index.ts', who: '2D physics on Rapier2D, which comes with the package. Call `installPhysics2d()` once.' },
    { spec: 'nacatamalon/physics3d', file: 'src/physics/box3d/index.ts', who: '3D physics on box3d, which comes with the package. Call `installPhysics3d()` once.' },
    { spec: 'nacatamalon/react', file: 'src/react/index.ts', who: 'A game inside a React page: `<Game>`, and hooks for the React components drawn over it. Needs `react`. Browser only: the native runtime does not show React components.' },
    { spec: 'nacatamalon/authoring', file: 'src/authoring/index.ts', who: 'For tools that write scenes (editors, generators). A game never needs it.' },
    { spec: 'nacatamalon/extend', file: 'src/extend/index.ts', who: 'For packages that extend the engine (another physics engine, a plugin). A game never needs it.' },
];

const program = ts.createProgram(DOORS.map((door) => join(ROOT, door.file)), {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
    types: ['@webgpu/types'],
    skipLibCheck: true,
});
const checker = program.getTypeChecker();
const FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteArrowStyleSignature;

/**
 * The statement a symbol is declared by: a variable's JSDoc sits on its `const` statement.
 */
const statementOf = (decl: ts.Node): ts.Node => {
    let node = decl;
    while (node.parent && !ts.isSourceFile(node.parent) && !ts.isModuleBlock(node.parent)) node = node.parent;
    return node;
};

/**
 * The JSDoc block right above a declaration, without its `/**` frame, and its tags apart.
 */
const docOf = (decl: ts.Node): { text: string; tags: Map<string, string[]> } => {
    const statement = statementOf(decl);
    const full = statement.getFullText();
    const leading = full.slice(0, statement.getStart() - statement.getFullStart());
    const blocks = leading.match(/\/\*\*[\s\S]*?\*\//g);
    const tags = new Map<string, string[]>();
    if (!blocks) return { text: '', tags };
    const lines = blocks[blocks.length - 1]
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\* ?/, ''));
    const body: string[] = [];
    // The tag a line continues, once the first tag has started: everything after belongs to one.
    let open: string[] | null = null;
    for (const line of lines) {
        const tag = line.match(/^@(\w+)\s?(.*)$/);
        if (tag) {
            open = tags.get(tag[1]) ?? [];
            open.push(tag[2]);
            tags.set(tag[1], open);
        } else if (open) {
            open[open.length - 1] += '\n' + line;
        } else {
            body.push(line);
        }
    }
    return { text: body.join('\n').trim(), tags };
};

/**
 * How a symbol reads in TypeScript: a function's signature, a constant's type, a type's whole
 * declaration (its members' own comments included, which is where an options type explains itself).
 */
const signatureOf = (name: string, symbol: ts.Symbol, decl: ts.Node): string => {
    if (ts.isTypeAliasDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
        return decl.getText().replace(/^export\s+/, '');
    }
    const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    if (ts.isFunctionDeclaration(decl) || type.getCallSignatures().length > 0) {
        return type.getCallSignatures().map((sig) => `function ${name}${checker.signatureToString(sig, decl, FLAGS).replace(/ => /, ': ')}`).join('\n');
    }
    return `const ${name}: ${checker.typeToString(type, decl, FLAGS)}`;
};

const out: string[] = [];
out.push(
    `# nacatamalon ${pkg.version}: full API reference`,
    '',
    'Every symbol this package exports, grouped by door and by topic, with its signature and its',
    'documentation. Generated from the source on build, so it matches the installed version.',
    '',
    'Read `llms.txt` (next to this file) first: it is the short guide to how a game is written.',
    'This file is for looking things up: search it for a name (`useKeyboard`, `createSprite`).',
);

let count = 0;
for (const door of DOORS) {
    const source = program.getSourceFile(join(ROOT, door.file))!;
    const moduleSymbol = checker.getSymbolAtLocation(source)!;
    const groups = new Map<string, string[]>();
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        const decl = symbol.declarations?.[0];
        if (!decl) continue;
        const { text, tags } = docOf(decl);
        const category = tags.get('category')?.[0]?.trim() || 'Other';
        const entry: string[] = ['', `### ${exported.name}`, '', '```ts', signatureOf(exported.name, symbol, decl), '```'];
        if (text) entry.push('', text);
        for (const param of tags.get('param') ?? []) entry.push(`- param ${param.trim()}`);
        for (const returns of tags.get('returns') ?? []) entry.push(`- returns ${returns.trim()}`);
        for (const example of tags.get('example') ?? []) entry.push('', 'Example:', example.trim());
        entry.push('', `Source: \`${relative(ROOT, decl.getSourceFile().fileName)}\``);
        groups.set(category, [...(groups.get(category) ?? []), entry.join('\n')]);
        count++;
    }
    out.push('', `# Door: \`${door.spec}\``, '', door.who);
    for (const [category, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
        out.push('', `## ${category} (from \`${door.spec}\`)`, ...entries);
    }
}

writeFileSync(join(ROOT, 'llms-full.txt'), out.join('\n') + '\n');
console.log(`[llms] llms-full.txt: ${count} symbols`);

// 2. The note at the top of the types. Written once: a second build finds it already there.
const BANNER = [
    '/**',
    ' * nacatamalon: a 2D and 3D game engine for the web.',
    ' *',
    ' * Coding assistants: read `node_modules/nacatamalon/llms.txt` first. It is the short guide to how',
    ' * a game is written with this engine (a scene runs once, hooks only inside it, `create*` returns',
    ' * data, `useUpdate` runs every frame). `llms-full.txt`, next to it, is the full API reference.',
    ' */',
    '',
].join('\n');
const types = join(ROOT, 'dist/types/index.d.ts');
if (existsSync(types)) {
    const current = readFileSync(types, 'utf8');
    if (!current.startsWith(BANNER)) writeFileSync(types, BANNER + current);
    console.log('[llms] dist/types/index.d.ts: note for coding assistants at the top');
}

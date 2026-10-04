import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import { join } from 'node:path';

/**
 * Every `@example` on the public surface compiles.
 *
 * An example is the first thing somebody copies out of a hover in their editor, and nothing else
 * ever runs it: a renamed option or a changed signature leaves it wrong in silence. Here each one is
 * compiled against the engine's own source, as a module of its own.
 *
 * An example has to stand on its own to pass: it imports what it uses from `'nacatamalon'` (or is
 * given every name from the front door when it imports nothing) and declares what it only refers to.
 * Categories join `CHECKED` as their comments are reviewed, so a category that was put right cannot
 * quietly go wrong again.
 */

const CHECKED = new Set<string>(['Game', 'Scenes', 'Hooks', 'Sprites', 'Game objects', 'Input', 'Assets & loading', 'Camera', 'Scripts', 'Post-processing', 'Tilemaps', 'Signals', 'Store', 'Color & palettes', 'Project', 'Physics']);

const ROOT = join(import.meta.dir, '..', 'src');
const DOORS = {
    nacatamalon: 'index.ts',
    'nacatamalon/authoring': 'authoring/index.ts',
    'nacatamalon/extend': 'extend/index.ts',
    'nacatamalon/physics2d': 'physics/rapier2d/index.ts',
    'nacatamalon/physics3d': 'physics/box3d/index.ts',
};

const OPTIONS: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ['@webgpu/types'],
    typeRoots: [join(import.meta.dir, '..', 'node_modules'), join(import.meta.dir, '..', 'node_modules', '@types')],
    paths: Object.fromEntries(Object.entries(DOORS).map(([spec, file]) => [spec, [join(ROOT, file)]])),
};

type TExample = { symbol: string; category: string; index: number; code: string };

/**
 * Every `@example` code block on every export, with the category its symbol is filed under.
 */
const collect = (): { examples: TExample[]; frontNames: string[] } => {
    const program = ts.createProgram(Object.values(DOORS).map((file) => join(ROOT, file)), OPTIONS);
    const checker = program.getTypeChecker();
    const examples: TExample[] = [];
    let frontNames: string[] = [];
    for (const [spec, file] of Object.entries(DOORS)) {
        const module = checker.getSymbolAtLocation(program.getSourceFile(join(ROOT, file))!)!;
        const exports = checker.getExportsOfModule(module);
        if (spec === 'nacatamalon') frontNames = exports.map((s) => s.name);
        for (const exported of exports) {
            const real = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
            let node: ts.Node | undefined = real.declarations?.[0];
            if (node === undefined) continue;
            if (ts.isVariableDeclaration(node)) node = node.parent.parent;
            const tags = ts.getJSDocTags(node);
            const category = tags.find((t) => t.tagName.text === 'category');
            const categoryName = typeof category?.comment === 'string' ? category.comment.trim() : '';
            tags.filter((t) => t.tagName.text === 'example').forEach((tag, index) => {
                const text = typeof tag.comment === 'string' ? tag.comment : ts.getTextOfJSDocComment(tag.comment) ?? '';
                for (const block of text.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)) {
                    examples.push({ symbol: exported.name, category: categoryName, index, code: block[1] });
                }
            });
        }
    }
    return { examples, frontNames };
};

/**
 * The names an example declares at its top level, which the prelude must not import over.
 */
const declaredIn = (code: string): Set<string> => {
    const names = new Set<string>();
    for (const statement of ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest).statements) {
        if (ts.isVariableStatement(statement)) {
            for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
        } else if ((ts.isFunctionDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name) {
            names.add(statement.name.text);
        }
    }
    return names;
};

/**
 * Each example as a module of its own, all compiled in one program: its errors, by example.
 */
const compileAll = (all: TExample[], frontNames: string[]): Map<TExample, string[]> => {
    const files = new Map<string, { example: TExample; source: string }>();
    all.forEach((example, i) => {
        const own = declaredIn(example.code);
        const prelude = /^\s*import\s/m.test(example.code)
            ? ''
            : `import { ${frontNames.filter((name) => !own.has(name)).join(', ')} } from 'nacatamalon';\n`;
        files.set(join(ROOT, '..', `__example_${i}.ts`), { example, source: `${prelude}${example.code}\nexport {};\n` });
    });
    const host = ts.createCompilerHost(OPTIONS);
    const { readFile, fileExists, getSourceFile } = host;
    host.readFile = (name) => files.get(name)?.source ?? readFile(name);
    host.fileExists = (name) => files.has(name) || fileExists(name);
    host.getSourceFile = (name, version) => {
        const own = files.get(name);
        return own ? ts.createSourceFile(name, own.source, version) : getSourceFile(name, version);
    };
    const program = ts.createProgram([...files.keys()], OPTIONS, host);
    const out = new Map<TExample, string[]>();
    for (const [name, { example }] of files) {
        out.set(example, ts.getPreEmitDiagnostics(program, program.getSourceFile(name)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')));
    }
    return out;
};

const { examples, frontNames } = collect();
const results = compileAll(examples.filter((e) => CHECKED.has(e.category) || process.env.ALL_EXAMPLES !== undefined), frontNames);

describe('the examples in the public documentation', () => {
    it('are found', () => {
        expect(examples.length).toBeGreaterThan(50);
    });

    for (const example of examples.filter((e) => CHECKED.has(e.category))) {
        it(`${example.category}: ${example.symbol} #${example.index + 1} compiles`, () => {
            expect(results.get(example)).toEqual([]);
        });
    }
});

// Run with ALL_EXAMPLES=1 to see, per category, how many examples do not compile yet.
if (process.env.ALL_EXAMPLES !== undefined) {
    const byCategory = new Map<string, { ok: number; bad: string[] }>();
    for (const [example, errors] of results) {
        const row = byCategory.get(example.category) ?? { ok: 0, bad: [] };
        if (errors.length === 0) row.ok++;
        else row.bad.push(`${example.symbol}: ${errors[0]}`);
        byCategory.set(example.category, row);
    }
    for (const [category, row] of byCategory) {
        console.log(`${category}: ${row.ok} ok, ${row.bad.length} broken`);
        for (const line of row.bad) console.log(`    ${line.slice(0, 160)}`);
    }
}

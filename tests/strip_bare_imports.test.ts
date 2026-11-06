import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('build cleanup reaches nested entrypoints and keeps imports that bring symbols or initialize other modules', () => {
    const dist = mkdtempSync(join(tmpdir(), 'naca-strip-imports-'));
    try {
        mkdirSync(join(dist, 'react/deep'), { recursive: true });
        const fixtures = [
            ['index.js', './'],
            ['react/index.js', '../'],
            ['react/deep/index.js', '../../'],
        ] as const;
        for (const [file, prefix] of fixtures) {
            writeFileSync(join(dist, file), [
                `import "${prefix}chunk-ABC123.js";`,
                `import { value } from "${prefix}chunk-ABC123.js";`,
                'import "external-polyfill";',
                `import "${prefix}setup.js";`,
                'export { value };',
                '//# sourceMappingURL=index.js.map',
                '',
            ].join('\n'));
        }
        const map = '{"sourcesContent":["import \\\"../chunk-ABC123.js\\\";"]}';
        writeFileSync(join(dist, 'react/index.js.map'), map);
        const script = join(import.meta.dir, '../scripts/strip_bare_imports.ts');
        const run = () => Bun.spawnSync([process.execPath, script, dist], { stdout: 'pipe', stderr: 'pipe' });
        expect(run().exitCode).toBe(0);
        for (const [file, prefix] of fixtures) {
            expect(readFileSync(join(dist, file), 'utf8')).toBe([
                '',
                `import { value } from "${prefix}chunk-ABC123.js";`,
                'import "external-polyfill";',
                `import "${prefix}setup.js";`,
                'export { value };',
                '//# sourceMappingURL=index.js.map',
                '',
            ].join('\n'));
        }
        expect(readFileSync(join(dist, 'react/index.js.map'), 'utf8')).toBe(map);
        expect(run().stdout.toString()).toContain('0 imports');
    } finally {
        rmSync(dist, { recursive: true, force: true });
    }
});

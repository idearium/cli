'use strict';

// Integration tests for spawnWithExitCode: exit codes propagate, a
// signal death fails instead of reporting success, and a command that
// cannot spawn is reported rather than crashing with an unhandled
// 'error' event.

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = promisify(execFile);

const driver = (body) =>
    run('node', [
        '-e',
        `const { spawnWithExitCode } = require(${JSON.stringify(
            `${REPO_ROOT}bin/lib/c.js`
        )});\n${body}`,
    ]).then(
        ({ stderr }) => ({ code: 0, stderr: stderr || '' }),
        (e) => ({ code: e.code, stderr: String(e.stderr || '') })
    );

it('propagates a zero exit code', async () => {
    const { code } = await driver(
        "spawnWithExitCode({ args: ['-e', 'process.exit(0)'], command: 'node' });"
    ).then(
        (r) => r,
        (e) => e
    );

    expect(code).toBe(0);
});

it('propagates a non-zero exit code', async () => {
    const { code } = await driver(
        "spawnWithExitCode({ args: ['-e', 'process.exit(3)'], command: 'node' });"
    ).then(
        (r) => r,
        (e) => e
    );

    expect(code).toBe(3);
});

it('reports a signal death as a failure (not success)', async () => {
    const { code } = await driver(
        "spawnWithExitCode({ args: ['-e', 'process.kill(process.pid, 'SIGKILL')'], command: 'node' });"
    ).then(
        (r) => r,
        (e) => e
    );

    expect(code).toBe(1);
});

it('reports a command that cannot spawn instead of crashing', async () => {
    const { code, stderr } = await driver(
        "spawnWithExitCode({ args: [], command: 'c-not-a-real-command-xyz' });"
    ).then(
        (r) => r,
        (e) => e
    );

    expect(code).toBe(1);
    expect(stderr).toContain("Could not run 'c-not-a-real-command-xyz'");
});

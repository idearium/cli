'use strict';

// Integration tests for c-kc-cmd: the kubectl invocation must put the
// --context/--namespace flags immediately after kubectl (never after the
// user's --), pass the argv as an array rather than a shell string, and
// propagate the child's exit code.

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FAKE_KUBECTL = `#!/bin/sh
# Fake kubectl for offline tests of c-kc-cmd: logs its argv verbatim.
echo "$@" >> "$KUBECTL_FAKE_LOG"

if [ -n "$KUBECTL_FAKE_EXIT" ]; then
    exit "$KUBECTL_FAKE_EXIT"
fi

echo 'kubectl-fake-ok'
`;

const FIXTURE_CJS = `module.exports = {
    project: {
        organisation: 'idearium',
        name: 'demo',
    },
    kubernetes: {
        environments: {
            beta: {
                context: 'gke_fake_beta',
                namespace: 'custom-ns',
                locations: {},
            },
        },
    },
};
`;

// Build a fixture directory holding the fake kubectl, a c.js with a
// kubernetes environment (namespace override included) and the state
// file selecting it.
const makeFixture = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-kc-cmd-'));

    fs.writeFileSync(path.join(dir, 'kubectl'), FAKE_KUBECTL, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'c.js'), FIXTURE_CJS);
    fs.mkdirSync(path.join(dir, 'devops'));
    fs.writeFileSync(path.join(dir, 'devops', 'state.json'), '{"env":"beta"}');

    return dir;
};

const runCommand = ({ cwd, env, extraEnv }) =>
    new Promise((resolve, reject) => {
        const child = spawn(
            'node',
            [
                path.join(REPO_ROOT, 'bin', 'c-kc-cmd.js'),
                'exec',
                'deploy/site',
                '--',
                'env',
            ],
            {
                cwd,
                env: Object.assign({}, process.env, env, extraEnv),
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ code, stderr, stdout });
        });
    });

it('places --context/--namespace before the user command, keeping -- verbatim', async () => {
    const dir = makeFixture();
    const log = path.join(dir, 'kubectl.log');

    try {
        const result = await runCommand({
            cwd: dir,
            env: {
                KUBECTL_FAKE_LOG: log,
                PATH: `${dir}:${process.env.PATH}`,
            },
        });

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('kubectl-fake-ok');
        expect(fs.readFileSync(log, 'utf8').trim()).toBe(
            '--context gke_fake_beta --namespace custom-ns exec deploy/site -- env'
        );
    } finally {
        fs.rmSync(dir, { force: true, recursive: true });
    }
});

it('propagates the kubectl exit code', async () => {
    const dir = makeFixture();
    const log = path.join(dir, 'kubectl.log');

    try {
        const result = await runCommand({
            cwd: dir,
            env: {
                KUBECTL_FAKE_LOG: log,
                PATH: `${dir}:${process.env.PATH}`,
            },
            extraEnv: { KUBECTL_FAKE_EXIT: '3' },
        });

        expect(result.code).toBe(3);
    } finally {
        fs.rmSync(dir, { force: true, recursive: true });
    }
});

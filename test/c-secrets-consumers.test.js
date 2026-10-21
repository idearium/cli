'use strict';

// Integration tests for c secrets consumers: spawned in a fixture
// project (c.js contract + fake `gcloud`/`kubectl` on PATH), the
// command must print each consuming function with the env parsed from
// its name - or (no env in name) when the name carries none.

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FAKE_GCLOUD = `#!/bin/sh
# Fake gcloud CLI for offline tests of c secrets consumers.
case "$*" in
    *"print-access-token"*)
        echo 'fake-token'
        ;;
    *"functions list"*)
        echo 'projects/demo-proj/locations/australia-southeast1/functions/idearium-demo-beta-api'
        echo 'projects/demo-proj/locations/australia-southeast1/functions/idearium-demo-site'
        ;;
    *"functions describe"*)
        case "$*" in
            *beta-api*|*site*)
                echo '{"serviceConfig":{"secretEnvironmentVariables":[{"secret":"idearium-demo-beta-api-key"}]}}'
                ;;
        esac
        ;;
    *)
        echo "fake gcloud: unsupported invocation: $*" >&2
        exit 1
        ;;
esac
`;

const FAKE_KUBECTL = `#!/bin/sh
# Fake kubectl CLI for offline tests of c secrets consumers.
case "$*" in
    *"get --raw /version"*)
        echo '{"major":"1"}'
        ;;
    *"secretproviderclass"*)
        echo '{"items":[]}'
        ;;
    *)
        echo "fake kubectl: unsupported invocation: $*" >&2
        exit 1
        ;;
esac
`;

const FIXTURE_CJS = `module.exports = {
    gcloud: {
        region: 'australia-southeast1',
    },
    kubernetes: {
        environments: {
            beta: {
                context: 'fake-context',
                namespace: 'demo-beta-ns',
                locations: {},
            },
        },
    },
    project: {
        gcpProjectId: 'demo-proj',
        name: 'demo',
        organisation: 'idearium',
    },
    secrets: {
        services: {
            api: { keys: ['OTHER_KEY'], sharedKeys: [] },
        },
        shared: { keys: ['API_KEY'] },
    },
};
`;

const run = ({ args }) =>
    new Promise((resolve) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-consumers-'));

        fs.writeFileSync(path.join(dir, 'gcloud'), FAKE_GCLOUD, {
            mode: 0o755,
        });
        fs.writeFileSync(path.join(dir, 'kubectl'), FAKE_KUBECTL, {
            mode: 0o755,
        });
        fs.writeFileSync(path.join(dir, 'c.js'), FIXTURE_CJS);

        const child = spawn(
            process.execPath,
            [path.join(REPO_ROOT, 'bin', 'c-secrets-consumers.js')].concat(
                args
            ),
            {
                cwd: dir,
                env: Object.assign({}, process.env, {
                    PATH: `${dir}:${process.env.PATH}`,
                }),
            }
        );

        let stdout = '';

        child.stdout.on('data', (data) => {
            stdout += data;
        });

        child.on('close', (code) => {
            fs.rmSync(dir, { force: true, recursive: true });

            resolve({ code, stdout });
        });
    });

it('prints each consuming function with its name-parsed env', async () => {
    const { code, stdout } = await run({
        args: ['idearium-demo-beta-api-key'],
    });

    expect(code).toBe(0);

    expect(stdout).toContain(
        '  idearium-demo-beta-api (name env beta)\n' +
            '  idearium-demo-site (no env in name)'
    );

    expect(stdout).toContain('REFERENCED by 3 consumer(s) - do not delete.');
});

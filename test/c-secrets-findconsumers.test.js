'use strict';

// Integration tests for findConsumers against fake `gcloud` and
// `kubectl` binaries injected via PATH: consuming functions must carry
// the env parsed from their name (or null when the name has none), and
// the secret's env, contract consumers and SecretProviderClasses
// resolve as before.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getSecretsContract } = require('../bin/lib/c-secrets.js');
const { findConsumers } = require('../bin/lib/c-secrets-verify.js');

const FAKE_GCLOUD = `#!/bin/sh
# Fake gcloud CLI for offline tests of findConsumers.
FUNCTIONS="idearium-demo-beta-api idearium-demo-site"

case "$*" in
    *"functions list"*)
        prefix=$(printf '%s\\n' "$@" | sed -n 's/.*name~functions\\///p')
        for fn in $FUNCTIONS; do
            case "$fn" in
                "$prefix"*) echo "projects/demo-proj/locations/australia-southeast1/functions/$fn" ;;
            esac
        done
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
# Fake kubectl CLI for offline tests of findConsumers: answers the
# context reachability probe and the SecretProviderClass listing.
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

let dir;
let previousPath;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-findconsumers-'));

    fs.writeFileSync(path.join(dir, 'gcloud'), FAKE_GCLOUD, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'kubectl'), FAKE_KUBECTL, {
        mode: 0o755,
    });

    previousPath = process.env.PATH;
    process.env.PATH = `${dir}:${process.env.PATH}`;
});

afterAll(() => {
    process.env.PATH = previousPath;

    fs.rmSync(dir, { force: true, recursive: true });
});

it('annotates consuming functions with the env parsed from their name', async () => {
    const config = {
        kubernetes: {
            environments: {
                beta: {
                    context: 'fake-context',
                    namespace: 'demo-beta-ns',
                    locations: {},
                },
            },
        },
    };

    const contract = getSecretsContract({
        config: {
            gcloud: { region: 'australia-southeast1' },
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
        },
    });

    const result = await findConsumers({
        config,
        contract,
        secretId: 'idearium-demo-beta-api-key',
    });

    expect(result.env).toBe('beta');

    expect(result.contract).toStrictEqual([
        {
            borrowed: false,
            key: 'API_KEY',
            owner: 'shared',
            service: 'shared',
        },
    ]);

    expect(result.k8s).toStrictEqual([]);

    expect(result.functions).toStrictEqual([
        { env: 'beta', name: 'idearium-demo-beta-api' },
        { env: null, name: 'idearium-demo-site' },
    ]);
});

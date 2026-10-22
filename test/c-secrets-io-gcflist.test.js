'use strict';

// Tests for gcfList against a fake `gcloud` binary injected via PATH:
// the async, bounded-concurrency implementation must list the project's
// functions and parse each one's secret bindings, resolving in list
// order.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

const { gcfList } = require('../bin/lib/c-secrets-io.js');

const FAKE_GCLOUD = `#!/bin/sh
# Fake gcloud CLI for offline tests of gcfList. Honors the
# name~functions/<prefix> filter so empty matches can be exercised.
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
            *api*)
                echo '{"serviceConfig":{"secretEnvironmentVariables":[{"secret":"idearium-demo-beta-api-key"},{"secret":"idearium-demo-beta-shared-imgix"}]}}'
                ;;
            *site*)
                echo '{"serviceConfig":{"secretEnvironmentVariables":[{"secret":"idearium-demo-beta-site-cache-url"}]}}'
                ;;
        esac
        ;;
    *)
        echo "fake gcloud: unsupported invocation: $*" >&2
        exit 1
        ;;
esac
`;

let dir;
let previousPath;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-gcloud-'));

    fs.writeFileSync(path.join(dir, 'gcloud'), FAKE_GCLOUD, { mode: 0o755 });

    previousPath = process.env.PATH;
    process.env.PATH = `${dir}:${process.env.PATH}`;
});

afterAll(() => {
    process.env.PATH = previousPath;

    fs.rmSync(dir, { force: true, recursive: true });
});

it('lists functions with their secret bindings, in list order', async () => {
    const functions = await gcfList({
        project: 'demo-proj',
        region: 'australia-southeast1',
        repoPrefix: 'idearium-demo-',
    });

    expect(functions).toStrictEqual([
        {
            name: 'idearium-demo-beta-api',
            secrets: [
                'idearium-demo-beta-api-key',
                'idearium-demo-beta-shared-imgix',
            ],
        },
        {
            name: 'idearium-demo-site',
            secrets: ['idearium-demo-beta-site-cache-url'],
        },
    ]);
});

it('resolves with an empty list when no functions match', async () => {
    const functions = await gcfList({
        project: 'demo-proj',
        region: 'australia-southeast1',
        repoPrefix: 'idearium-other-',
    });

    expect(functions).toStrictEqual([]);
});

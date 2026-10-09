'use strict';

// Behavioral tests for the 1Password item resolvers of c-secrets-io:
// resolveOwnerItem must never create items (read paths), while
// resolveOrCreateOwnerItem creates service items (write paths). The
// shared block never creates on either path.
//
// Runs against a fake `op` binary injected via PATH, so no real 1Password
// session is needed; every invocation is logged for create/no-create
// assertions.
//
// Run with: npm test

import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

const io = require('../bin/lib/c-secrets-io.js');

const FAKE_OP = `#!/bin/sh
# Fake 1Password CLI for offline behavioral tests of c-secrets-io.
LOG="$OP_FAKE_LOG"
echo "$@" >> "$LOG"

case "$*" in
    *"whoami"*)
        echo '{}'
        ;;
    *"item list"*)
        echo '[{"id":"siteitemid","title":"idearium-demo/site","vault":{"id":"Team"}}]'
        ;;
    *"item create"*)
        echo '{"id":"created-item-id"}'
        ;;
    *)
        echo "fake op: unsupported invocation: $*" >&2
        exit 1
        ;;
esac
`;

let dir;
let hadSession;
let log;
let previousFakeLog;
let previousPath;
let previousSession;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-op-'));
    log = path.join(dir, 'op.log');

    fs.writeFileSync(path.join(dir, 'op'), FAKE_OP, { mode: 0o755 });

    previousPath = process.env.PATH;
    hadSession = 'OP_SESSION_idearium' in process.env;
    previousSession = process.env.OP_SESSION_idearium;
    previousFakeLog = process.env.OP_FAKE_LOG;

    process.env.PATH = `${dir}:${process.env.PATH}`;
    process.env.OP_SESSION_idearium = 'faketoken';
    process.env.OP_FAKE_LOG = log;
});

afterAll(() => {
    process.env.PATH = previousPath;
    process.env.OP_FAKE_LOG = previousFakeLog;

    if (hadSession) {
        process.env.OP_SESSION_idearium = previousSession;
    } else {
        delete process.env.OP_SESSION_idearium;
    }

    fs.rmSync(dir, { force: true, recursive: true });
});

const freshLog = () => fs.writeFileSync(log, '');
const logText = () => fs.readFileSync(log, 'utf8');
const createdItems = () => logText().includes('item create');

const owners = {
    bound: { keys: [], name: 'site', opItem: 'bound123', sharedKeys: [] },
    shared: { keys: [], name: 'shared', sharedKeys: [] },
    unboundApi: { keys: [], name: 'api', sharedKeys: [] },
    unboundSite: { keys: [], name: 'site', sharedKeys: [] },
};

const title = (owner) => `idearium-demo/${owner.name}`;

const expectThrowsWith = (fn, substring) => {
    try {
        fn();
    } catch (e) {
        return expect(e.message).toContain(substring);
    }

    throw new Error('expected the call to throw, but it did not');
};

it('returns a bound opItem without invoking op, on either path', () => {
    freshLog();

    expect(
        io.resolveOwnerItem({ owner: owners.bound, title: title(owners.bound) })
    ).toStrictEqual({ created: false, id: 'bound123', persisted: false });

    expect(
        io.resolveOrCreateOwnerItem({
            owner: owners.bound,
            title: title(owners.bound),
        })
    ).toStrictEqual({ created: false, id: 'bound123', persisted: false });

    expect(logText(), 'no op calls for a bound entry').toBe('');
});

it('resolves an unbound entry by title without creating, on either path', () => {
    freshLog();

    expect(
        io.resolveOwnerItem({
            owner: owners.unboundSite,
            title: title(owners.unboundSite),
        })
    ).toStrictEqual({ created: false, id: 'siteitemid', persisted: true });

    expect(
        io.resolveOrCreateOwnerItem({
            owner: owners.unboundSite,
            title: title(owners.unboundSite),
        })
    ).toStrictEqual({ created: false, id: 'siteitemid', persisted: true });

    expect(createdItems(), 'an existing item is bound, never duplicated').toBe(
        false
    );
});

it('never creates items on read paths (unbound and missing)', () => {
    freshLog();

    expectThrowsWith(
        () =>
            io.resolveOwnerItem({
                owner: owners.unboundApi,
                title: title(owners.unboundApi),
            }),
        'read commands never create'
    );

    expect(createdItems()).toBe(false);
});

it('never creates the shared block\u2019s item, on either path', () => {
    freshLog();

    expectThrowsWith(
        () =>
            io.resolveOwnerItem({
                owner: owners.shared,
                title: title(owners.shared),
            }),
        'set shared.opItem'
    );

    expectThrowsWith(
        () =>
            io.resolveOrCreateOwnerItem({
                owner: owners.shared,
                title: title(owners.shared),
            }),
        'set shared.opItem'
    );

    expect(createdItems()).toBe(false);
});

it('creates a missing service item on write paths, with the right title', () => {
    freshLog();

    expect(
        io.resolveOrCreateOwnerItem({
            owner: owners.unboundApi,
            title: title(owners.unboundApi),
        })
    ).toStrictEqual({ created: true, id: 'created-item-id', persisted: true });

    expect(logText()).toContain('item create');
    expect(logText()).toContain('--title=idearium-demo/api');
});

it('creates an item for a brand-new service (null owner)', () => {
    freshLog();

    expect(
        io.resolveOrCreateOwnerItem({
            owner: null,
            title: 'idearium-demo/newsvc',
        })
    ).toStrictEqual({ created: true, id: 'created-item-id', persisted: true });

    expect(createdItems()).toBe(true);
});

'use strict';

// Detection tests against the real `op` binary, with no 1Password
// account: op validates piped stdin before authentication, so the two
// failure modes are distinguishable without a session. These tests pin
// the very behaviour the stdin bridge exists for - if op ever accepts
// socket stdin, they fail and the bridge can be retired.
//
// Skipped automatically when `op` is not installed. GitHub CI installs a
// pinned op; see .github/workflows/test.yaml.

import { beforeAll, afterAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hasOp = (() => {
    try {
        execFileSync('op', ['--version'], { stdio: 'ignore' });

        return true;
    } catch (e) {
        return false;
    }
})();

let home;

beforeAll(() => {
    // A sandboxed HOME guarantees no configured account or session can
    // interfere: op stops at the (unauthenticated) desktop-app error.
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'op-detection-'));
});

afterAll(() => {
    fs.rmSync(home, { force: true, recursive: true });
});

// Run op with the given command shape and 'payload' on stdin, capturing
// stderr (op exits non-zero in both shapes - on its auth error).
const attempt = ({ args, command }) => {
    try {
        execFileSync(command, args, {
            encoding: 'utf8',
            env: { HOME: home, PATH: process.env.PATH },
            input: 'not-a-real-template',
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        return '';
    } catch (e) {
        return String(e.stderr);
    }
};

it.skipIf(!hasOp)(
    'real op cannot detect Node socket stdin (the bug the bridge fixes)',
    () => {
        const stderr = attempt({ args: ['inject'], command: 'op' });

        // Piped straight from Node, op's stdin is an AF_UNIX socket:
        // op sees no piped data at all.
        expect(stderr).toContain('expected data on stdin');
    }
);

it.skipIf(!hasOp)('real op detects stdin bridged through a shell pipe', () => {
    const stderr = attempt({
        args: ['-c', 'cat | op "$@"', 'sh', 'inject'],
        command: 'sh',
    });

    // Through cat | op the stdin check passes; without an account op
    // fails later on sign-in instead - never on stdin detection.
    expect(stderr).not.toContain('expected data on stdin');
    expect(stderr.length).toBeGreaterThan(0);
});

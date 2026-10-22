'use strict';

// Tests for the op stdin bridge: Node's pipe stdio hands children AF_UNIX
// sockets, and op only detects piped input on real pipe(2) FIFOs - so
// stdin-bearing op calls (runOp with input, and `c op cmd` when its stdin
// is piped) must route through a shell pipe (cat | op). These tests use a
// fake op that records whether its stdin was a FIFO and what it received.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath } = require('node:url');

const io = require('../bin/lib/c-secrets-io.js');

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FAKE_OP = `#!/bin/sh
# Fake 1Password CLI for stdin-bridge tests. Records whether stdin was a
# real FIFO (the property op's own detection depends on) and its contents.
LOG="$OP_FAKE_LOG"
echo "$@" >> "$LOG"

case "$*" in
    *"whoami"*)
        echo '{}'
        ;;
    *"stdincheck"*)
        if [ -p /dev/stdin ]; then
            echo "STDIN-FIFO" >> "$LOG"
        else
            echo "STDIN-NOTFIFO" >> "$LOG"
        fi
        cat >> "$LOG"
        echo "" >> "$LOG"
        echo "stdin-ok"
        ;;
    *)
        echo "fake op: unsupported invocation: $*" >&2
        exit 1
        ;;
esac
`;

let dir;
let log;

const ENV_KEYS = ['OP_FAKE_LOG', 'OP_SESSION_idearium', 'PATH'];

let savedEnv;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-op-stdin-'));
    log = path.join(dir, 'op.log');

    fs.writeFileSync(path.join(dir, 'op'), FAKE_OP, { mode: 0o755 });

    savedEnv = {};

    ENV_KEYS.forEach((key) => {
        savedEnv[key] = {
            present: key in process.env,
            value: process.env[key],
        };
    });

    process.env.PATH = `${dir}:${process.env.PATH}`;
    process.env.OP_SESSION_idearium = 'faketoken';
    process.env.OP_FAKE_LOG = log;
});

afterAll(() => {
    ENV_KEYS.forEach((key) => {
        if (savedEnv[key].present) {
            process.env[key] = savedEnv[key].value;
        } else {
            delete process.env[key];
        }
    });

    fs.rmSync(dir, { force: true, recursive: true });
});

const freshLog = () => fs.writeFileSync(log, '');
const logText = () => fs.readFileSync(log, 'utf8');

// Spawn a command, write input to its stdin, and resolve with its exit
// code and captured output.
const spawnCaptured = ({ args, command, input }) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

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

        child.stdin.end(input);
    });

it('runOp delivers piped input to op over a real FIFO', () => {
    freshLog();

    const output = io.runOp({ args: ['stdincheck'], input: 'payload-data' });

    expect(output).toContain('stdin-ok');

    const text = logText();

    expect(text).toContain('stdincheck');
    // The regression property: op's stdin must be a pipe(2) FIFO, not a
    // Node socketpair - op cannot detect input on the latter.
    expect(text).toContain('STDIN-FIFO');
    expect(text).not.toContain('STDIN-NOTFIFO');
    expect(text).toContain('payload-data');
});

it('c op cmd bridges piped stdin into op over a real FIFO', async () => {
    freshLog();

    const result = await spawnCaptured({
        args: [path.join(REPO_ROOT, 'bin', 'c-op-cmd.js'), 'stdincheck'],
        command: 'node',
        input: 'bridge-payload',
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('stdin-ok');

    const text = logText();

    expect(text).toContain('STDIN-FIFO');
    expect(text).toContain('bridge-payload');
});

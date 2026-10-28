'use strict';

const { execFileSync } = require('child_process');
const { chmodSync, mkdirSync, writeFileSync } = require('fs');
const { dirname } = require('path');
const program = require('commander');

const { reportError } = require('./lib/c');
const { OP_SESSION_FILE } = require('./lib/c-secrets-io');

const print = (line) => process.stdout.write(`${line}\n`);

program
    .description(
        'Sign in to 1Password and store the session token where every c command (and c op cmd) reads it (~/.local/state/idearium/op-session, 0600). The token itself is never printed.'
    )
    .parse(process.argv);

try {
    const token = execFileSync('op', ['signin', '--raw'], {
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'inherit'],
    }).trim();

    if (!token) {
        throw new Error(
            'op signin produced no session token (1Password desktop-app integration can do this) - sign in with your account password instead.'
        );
    }

    mkdirSync(dirname(OP_SESSION_FILE), { recursive: true });

    writeFileSync(OP_SESSION_FILE, `${token}\n`, {
        encoding: 'utf8',
        mode: 0o600,
    });

    // writeFileSync only applies the mode on creation - enforce it on
    // overwrite too (the file may exist with wider permissions).
    chmodSync(OP_SESSION_FILE, 0o600);

    print(`op session warmed: ${OP_SESSION_FILE}`);
} catch (e) {
    reportError(e, false, true);
}

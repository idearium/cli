'use strict';

const { spawn } = require('child_process');
const program = require('commander');

const { reportError } = require('./lib/c');
const { assertOpSession, opSession } = require('./lib/c-secrets-io');

program
    .arguments('[command...]')
    .description(
        'Runs a 1Password cli command with the c-managed session wired in (--session), rather than guessing an OP_SESSION_* env var name.'
    )
    .parse(process.argv);

try {
    // Fail fast with a friendly error before handing over to op.
    assertOpSession();

    // Array form (no shell) so values never round-trip through string
    // interpolation.
    spawn('op', ['--session', opSession()].concat(program.rawArgs.slice(2)), {
        stdio: 'inherit',
    }).on('exit', (code) => {
        process.exitCode = code;
    });
} catch (e) {
    reportError(e, false, true);
}

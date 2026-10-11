'use strict';

const program = require('commander');

const { reportError, spawnWithExitCode } = require('./lib/c');
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

    const opArgs = ['--session', opSession()].concat(program.rawArgs.slice(2));

    // Programmatic callers pipe stdin from Node, whose pipe stdio is an
    // AF_UNIX socket - op only detects input on real pipe(2) FIFOs. When
    // stdin is not a terminal, bridge it through a shell pipe: cat reads
    // the socket fine and writes into a genuine pipe op accepts. The
    // command lives in the shell string and arguments pass verbatim
    // through "$@", so no caller input is interpolated.
    if (process.stdin.isTTY) {
        return spawnWithExitCode({ args: opArgs, command: 'op' });
    }

    return spawnWithExitCode({
        args: ['-c', 'cat | op "$@"', 'sh'].concat(opArgs),
        command: 'sh',
    });
} catch (e) {
    reportError(e, false, true);
}

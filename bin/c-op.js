'use strict';

const program = require('commander');
const { missingCommand, spawnWithExitCode } = require('./lib/c');

// The cmd passthrough needs the verbatim argv (bin/c.js forwards this
// subtree raw): commander's git-style dispatch would re-parse the args
// first, dropping -- and unknown options.
if (process.argv[2] === 'cmd') {
    const { join } = require('path');

    spawnWithExitCode({
        args: [join(__dirname, 'c-op-cmd.js')].concat(process.argv.slice(3)),
        command: 'node',
    });

    return;
}

program
    .command(
        'get <service> <env> <key>',
        'Get a secret value summary from 1Password (hash by default).'
    )
    .command(
        'set <service> <env> <key>',
        'Upsert a secret value into 1Password from stdin (or --generate).'
    )
    .command(
        'session',
        'Sign in to 1Password and store the session token for every c command.'
    )
    .command(
        'cmd [command...]',
        'Run a 1Password cli command with the c-managed session.'
    )
    .description(
        'Manage 1Password secret values for the secrets contract in c.js.'
    )
    .parse(process.argv);

missingCommand(program);

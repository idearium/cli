'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command(
        'get <service> <env> <key>',
        'Get a secret value summary from 1Password (hash by default).'
    )
    .command(
        'set <service> <env> <key>',
        'Upsert a secret value into 1Password from stdin (or --generate).'
    )
    .description(
        'Manage 1Password secret values for the secrets contract in c.js.'
    )
    .parse(process.argv);

missingCommand(program);

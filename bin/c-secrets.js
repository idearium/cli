'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command(
        'add <service> <env> <key>',
        'Add a key end to end: 1Password, GSM and the c.js contract. Never touches the cluster.'
    )
    .command(
        'consumers <secretId>',
        'List everything referencing a GSM secret id. The deletion gate.'
    )
    .command(
        'get <service> <env> <key>',
        'Get a GSM secret value summary (hash by default).'
    )
    .command(
        'init',
        'Draft a secrets contract into c.js from existing declarations. Requires a warm 1Password session. No-op when a contract exists.'
    )
    .command('ls <env>', "List an environment's contract-derived GSM secrets.")
    .command(
        'push <service> <env> <key>',
        'Push the 1Password value to GSM (create or addVersion) and verify the readback by hash.'
    )
    .command(
        'verify <env>',
        'Verify an environment: contract structure, op/GSM/k8s hashes, functions drift.'
    )
    .description(
        'Manage secrets for the contract in c.js across 1Password, GSM and Kubernetes.'
    )
    .parse(process.argv);

missingCommand(program);

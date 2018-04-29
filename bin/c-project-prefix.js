#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadState, newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-e', 'Include the current environment.')
    .option('-n', 'Do not print the trailing newline character.')
    .description('Dynamically generate the projects prefix based on `name` and `organisation` values. The prefix can be used within Kubernetes configuration.')
    .parse(process.argv);

return loadState('env')
    .then((state) => {

        const name = exec('c project name -n', { silent: true }).stdout;
        const organisation = exec('c project organisation -n', { silent: true }).stdout;
        const environment = program.E ? `-${state}` : '';

        return process.stdout.write(`${organisation}-${name}${environment}${newline(program.N)}`);

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Your project\'s environment hasn\'t been configured yet. Use `c project env set`.'), false, true);
        }

        return reportError(err, false, true);

    });

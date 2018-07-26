#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

exec('minikube ip', { silent: true }, (err, stdout) => {

    if (err) {
        return reportError(err, false, true);
    }

    process.stdout.write(`${stdout.replace(/\n/, '', 'g')}${newline(program.N)}`);

});

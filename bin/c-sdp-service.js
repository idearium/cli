#!/usr/bin/env node

'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');
const { reportError } = require('./lib/c');

program
    .allowUnknownOption(true)
    .arguments('<cmd...>')
    .description(
        "Provide the command to run on the minikube instance for Section's devpop."
    )
    .parse(process.argv);

const cmd = program.args.join(' ');

if (!cmd) {
    return reportError(new Error('You must pass the cmd argument.'), program);
}

exec(`minikube -p section service ${cmd}`);

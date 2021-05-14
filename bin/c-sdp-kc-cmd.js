#!/usr/bin/env node

'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');
const { reportError } = require('./lib/c');

program
    .allowUnknownOption(true)
    .arguments('<cmd...>')
    .description(
        "Provide the kubectl command against Section's devpop kubernetes cluster."
    )
    .parse(process.argv);

const cmd = program.args.join(' ');

if (!cmd) {
    return reportError(new Error('You must pass the cmd argument.'), program);
}

exec(`kubectl --context section ${cmd}`);

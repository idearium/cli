'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program
    .allowUnknownOption()
    .arguments('<cmd...>')
    .requiredOption(
        '-p --profile <profile>',
        'Specify a minikube profile, otherwise the default minikube profile will be used.'
    )
    .parse(process.argv);

const cmd = program.args;

if (!cmd) {
    return reportError(new Error('You must pass the cmd argument.'), program);
}

const { profile } = program.opts();
const command = `minikube ssh${
    profile ? ` --profile ${profile}` : ''
} -- ${cmd.join(' ')}`;

exec(command);

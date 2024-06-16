'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const {
    devspacePath,
    loadState,
    newline,
    reportError,
    stateFilePath,
} = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-n', 'Do not print the trailing newline character.')
    .option(
        '-p [profile]',
        'Specify a minikube profile, otherwise the default minikube profile will be used.'
    )
    .parse(process.argv);

const run = async () => {
    const devName = await loadState('devName', stateFilePath(devspacePath()));

    exec(`c ts ip ${devName}`, { silent: true }, (err, stdout, stderr) => {
        if (err) {
            return reportError(new Error(stderr), false, true);
        }

        process.stdout.write(
            `${stdout.replace(/\n/, '', 'g')}${newline(program.N)}`
        );
    });
};

run();

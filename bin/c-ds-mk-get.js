#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const {
    loadState,
    devspacePath,
    newline,
    reportError,
    stateFilePath,
} = require('./lib/c');

program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

return loadState('mkName', stateFilePath(devspacePath()))
    .then((data) => {
        process.stdout.write(`${data}${newline(program.N)}`);
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    "Your Minikube name hasn't been configured yet. Use `c ds mk set <minikube-name>`."
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });

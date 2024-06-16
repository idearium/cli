#!/usr/bin/env -S node

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

return loadState('devName', stateFilePath(devspacePath()))
    .then((data) => {
        process.stdout.write(`${data}${newline(program.N)}`);
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    "Your dev computer name hasn't been configured yet. Use `c ds dev set <dev-name>`."
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });

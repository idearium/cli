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

return loadState('pcName', stateFilePath(devspacePath()))
    .then((data) => {
        process.stdout.write(`${data}${newline(program.N)}`);
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    "Your pc name hasn't been configured yet. Use `c ds pc set <pc-name>`."
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });

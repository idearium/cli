#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { loadState, newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

return loadState('env')
    .then((data) => {
        process.stdout.write(`${data}${newline(program.N)}`);
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    "Your project's environment hasn't been configured yet. Use `c project env set`."
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });

#!/usr/bin/env node

'use strict';

const program = require('commander');
const { documentation, loadConfig, newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

loadConfig('project.organisation')
    .then((organisation) =>
        process.stdout.write(`${organisation}${newline(program.N)}`)
    )
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    `Your project's organisation hasn't been configured yet. See ${documentation(
                        'configuration'
                    )}.`
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });

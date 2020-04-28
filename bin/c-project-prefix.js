#!/usr/bin/env node

'use strict';

const program = require('commander');
const { loadConfig, loadState, reportError } = require('./lib/c');
const { formatProjectPrefix } = require('./lib/c-project');

// The basic program, which uses sub-commands.
program
    .option('-e', 'Include the current environment.')
    .option('-n', 'Do not print the trailing newline character.')
    .description(
        'Dynamically generate the projects prefix based on `name` and `organisation` values. The prefix can be used within Kubernetes configuration.'
    )
    .parse(process.argv);

return loadConfig('project')
    .then((config) => Promise.all([config, loadState('env')]))
    .then(([config, state]) => {
        const { name, organisation } = config;

        return process.stdout.write(
            formatProjectPrefix(organisation, name, state, program.E, program.N)
        );
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

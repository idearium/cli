#!/usr/bin/env node

'use strict';

const program = require('commander');
const { loadConfig, newline, reportError } = require('./lib/c');

program
    .option('-n', 'Do not print the trailing newline character.')
    .parse(process.argv);

return loadConfig('environments')
    .then((data) => {
        process.stdout.write(`${Object.keys(data)}${newline(program.N)}`);
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    'Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });

#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .parse(process.argv);

return loadConfig('project')
    .then((data) => {

        // Make sure we have the environments data.
        if (!data.environments) {
            return reportError(new Error('Could not find any environments.'), false, true);
        }

        const { local } = data.environments;

        // Make sure we have the environments.local data.
        if (!local) {
            return reportError(new Error('Could not find the local environment.'), false, true);
        }

        // Make sure we have the environments.local.url data.
        if (!(local.url && local.url.domain)) {
            return reportError(new Error('Could not find the domain in the local environment.'), false, true);
        }

        exec('c mk ip -n', { silent: true }, (err, ip) => {

            if (err) {
                return reportError(err, false, true);
            }

            exec(`c hosts add ${ip} ${local.url.domain}`);

        });

    });

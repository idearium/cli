#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { composeUp, npmAuthToken, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[service]')
    .parse(process.argv);

npmAuthToken()
    .then((token) => {

        // ENV variables for shelljs
        const env = { NPM_AUTH_TOKEN: token };

        /* eslint-disable padded-blocks */
        if (!program.args.length) {
            throw new Error('You must identify the service you\'d like to rebuild');
        }
        /* eslint-enable padded-blocks */

        const [service] = program.args;

        // Using shelljs here.
        // Quicker than `child_process.execFile` because it doesn't require a full path to the binary.
        exec(`docker-compose build ${service}`, { env });
        exec(composeUp(service), { env });


    })
    .catch(err => reportError(err, program));

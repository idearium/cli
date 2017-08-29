#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { npmAuthToken, throwErr } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[service]')
    .parse(process.argv);

npmAuthToken()
    .then((token) => {

        const env = { NPM_AUTH_TOKEN: token };

        // Are we bringing up all, or just one contaner?
        if (!program.args.length) {

            exec('docker-compose stop', { env });
            exec('docker-compose rm --force', { env });
            exec('docker-compose build', { env });
            exec('docker-compose up -d --scale consul=3 --scale app=2', { env });

            return;

        }

        // We're bringing up just one container.
        const [service] = program.args;
        let upCommand = 'docker-compose up -d';

        // We need to scale some containers.
        /* eslint-disable padded-blocks */
        if (['app', 'consul'].includes(service)) {
            upCommand += ` --scale ${service}=2`;
        }
        /* eslint-enable padded-blocks */

        upCommand += ` ${service}`;

        exec(`docker-compose build ${service}`, { env });
        exec(upCommand, { env });

    });

#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env] = program.args;

if (env.toLowerCase() === 'local') {
    return reportError(new Error('You cannot download the local database'), program);
}

loadConfig(`mongodb.${env}`)
    .then((db) => {

        let ssl = '';

        if (env.toLowerCase() !== 'local') {
            ssl = '--ssl --sslAllowInvalidCertificates';
        }

        return spawn(`docker run -it -v ${process.cwd()}/db/data:/db/data --rm mongo:latest mongodump ${ssl} -h ${db.host}:${db.port} -u ${db.user} -p ${db.password} -d ${db.name} -o db/data`, {
            shell: true,
            stdio: 'inherit',
        });


    })
    .catch(reportError);

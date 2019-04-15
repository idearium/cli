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

loadConfig(`mongo.${env}`)
    .then((db) => {

        let ssl = '';

        if ((typeof db.ssl === 'undefined') ? true : db.ssl) {
            ssl = '--ssl --sslAllowInvalidCertificates';
        }

        return spawn(`docker run -it -v ${process.cwd()}/data:/data --rm mongo:3.2 mongodump ${ssl} -h ${db.host}:${db.port} -u ${db.user} -p ${db.password} -d ${db.name} -o data`, {
            shell: true,
            stdio: 'inherit',
        });


    })
    .catch(reportError);

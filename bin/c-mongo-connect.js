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

loadConfig(`mongo.${env}`)
    .then((db) => {

        let dbAuth = '';
        let ssl = '';

        if ((typeof db.ssl === 'undefined') ? true : db.ssl) {
            dbAuth = `-u ${db.user} -p ${db.password}`;
            ssl = '--ssl --sslAllowInvalidCertificates';
        }

        return spawn(`docker run -it --rm mongo:3.2 mongo ${ssl} ${db.host}:${db.port}/${db.name} ${dbAuth}`, {
            shell: true,
            stdio: 'inherit',
        });

    })
    .catch(reportError);

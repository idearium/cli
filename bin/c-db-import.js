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

Promise.all([
    loadConfig(`mongodb.${env}`),
    loadConfig('mongodb.local'),
])
    .then(([db, localDb]) => {

        return spawn(`docker run -it -v ${process.cwd()}/db/data/${db.name}:/db/data/${db.name} --add-host ${localDb.host}:$(c hosts get -n ${localDb.host}) --rm mongo:latest mongorestore --drop -h ${localDb.host}:${localDb.port} -d ${localDb.name} db/data/${db.name}`, {
            shell: true,
            stdio: 'inherit',
        });


    })
    .catch(reportError);

#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .arguments('<collection>')
    .description('Download all or a specific collection from a Mongo database. If you don\'t provide a collection, all will be downloaded.')
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env, collection] = program.args;

if (env.toLowerCase() === 'local') {
    return reportError(new Error('You cannot download the local database'), program);
}

loadConfig(`mongo.${env}`)
    .then(({ host, name, params = [], password, user }) => {

        let collectionArg = '';
        let dbAuth = '';

        if (typeof collection !== 'undefined') {
            collectionArg = `-c ${collection}`;
        }

        if (user && password) {
            dbAuth = `-u ${user} -p ${password}`;
        }

        return spawn(`docker run -it -v ${process.cwd()}/data:/data --rm mongo:3.4 mongodump ${dbAuth} ${params.join(' ')} -h ${host} -d ${name} ${collectionArg} -o data`, {
            shell: true,
            stdio: 'inherit',
        });


    })
    .catch(reportError);

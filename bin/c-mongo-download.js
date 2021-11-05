#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');
const { connectionParts } = require('./lib/c-mongo');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .arguments('<collection>')
    .description(
        "Download all or a specific collection from a Mongo database. If you don't provide a collection, all will be downloaded."
    )
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env, collection] = program.args;

if (env.toLowerCase() === 'local') {
    return reportError(
        new Error('You cannot download the local database'),
        program
    );
}

const connectionStringWithAddress = ({ address, params, password, user }) => {
    const url = new URL(address);

    url.password = password;
    url.username = user;

    return `${params} --uri ${url.href}`;
};

const connectionStringWithHost = ({ auth, host, name, params }) =>
    `--authenticationDatabase ${name}${auth}${params} --host ${host}`;

loadConfig(`mongo.${env}`)
    .then((details) => {
        const collectionArg =
            typeof collection === 'undefined' ? '' : `-c ${collection}`;
        const connection = connectionParts(details);
        const cmd = `docker run -it -v ${process.cwd()}/data:/data --rm mongo:4.2 mongodump ${
            connection.host
                ? connectionStringWithHost(connection)
                : connectionStringWithAddress(connection)
        } ${collectionArg} -o data`;

        console.log('cmd', cmd);

        // process.exit(0);

        return spawn(cmd, {
            shell: true,
            stdio: 'inherit',
        });
    })
    .catch(reportError);

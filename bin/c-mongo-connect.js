'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');
const { connectionParts } = require('./lib/c-mongo');

// The basic program, which uses sub-commands.
program.arguments('[env]').parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env] = program.args;

const connectionStringWithAddress = ({ address, auth, name, params }) =>
    `${auth}${params} ${new URL(name, address).href}`;

const connectionStringWithHost = ({ auth, host, name, params }) =>
    `${auth}${params} --host ${host} ${name}`;

loadConfig(`mongo.${env}`)
    .then((details) => {
        const connection = connectionParts(details);
        const cmd = `docker run -it --rm -v $(pwd)/data/mongo:/home/mongodb/${
            connection.volumes.length > 0
                ? ` ${connection.volumes.join(' ')}`
                : ''
        } mongo:4.2 mongo ${
            connection.host
                ? connectionStringWithHost(connection)
                : connectionStringWithAddress(connection)
        }`;

        return spawn(cmd, {
            shell: true,
            stdio: 'inherit',
        });
    })
    .catch(reportError);

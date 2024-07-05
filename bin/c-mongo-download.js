'use strict';

const { $ } = require('zx');

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const { connectionParts } = require('./lib/c-mongo');

$.shell = '/usr/bin/zsh';

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

const connectionStringWithAddress = ({
    address,
    name,
    params,
    password,
    user,
}) => {
    const url = new URL(address);

    url.password = password;
    url.username = user;

    const cmd = [];

    if (params) {
        cmd.push(params);
    }

    return [...cmd, '--uri', `${url.href}/${name}`];
};

const connectionStringWithHost = ({ auth, host, name, params }) =>
    [auth, params, '--host', host, '-d', name].filter(Boolean);

const handleProcessOutput = async ({
    debug = false,
    errorMessage = 'An error occurred',
    processOutput,
    okayCodes = [0],
}) => {
    let err;
    let processOutputResult;

    try {
        processOutputResult = await processOutput;
    } catch (e) {
        err = e;
    }

    if (err) {
        return reportError(new Error(err.stdout), program);
    }

    if (debug === true) {
        console.log(processOutputResult);
    }

    const { stdout, stderr, exitCode } = processOutputResult;

    if (!okayCodes.includes(exitCode)) {
        return reportError(new Error(errorMessage), program);
    }

    return { stdout, stderr };
};

const streamProcessOutput = async ({ processOutput }) => {
    await processOutput.pipe(process.stdout);
};

(async () => {
    const details = await loadConfig(`mongo.${env}`);
    const connection = connectionParts(details);

    const dockerVolumeName = `mongodump_data_${details.name}_${env}${
        collection ? `_${collection}` : ''
    }`;

    await handleProcessOutput({
        processOutput: $`docker volume ${['create', dockerVolumeName]}`,
        errorMessage: 'Failed to create Docker volume',
    });

    await handleProcessOutput({
        processOutput: $`docker run -it --rm -v ${dockerVolumeName}:/data busybox sh -c "mkdir -p /data/${details.name} && chown -R root:root /data && chmod -R 777 /data"`,
        errorMessage: 'Failed to setup Docker volume directories',
    });

    await handleProcessOutput({
        processOutput: $`docker run -it --rm -v ${dockerVolumeName}:/data busybox sh -c "ls -l /data"`,
        errorMessage: 'Failed to run mongodump',
    });

    await streamProcessOutput({
        processOutput: $`docker run ${[
            '-it',
            '--rm',
            '-v',
            `${dockerVolumeName}:/data`,
            'mongo:7',
            'mongodump',
            ...(connection.host
                ? connectionStringWithHost(connection)
                : connectionStringWithAddress(connection)),
            '-o',
            `/data/${details.name}`,
        ]}`,
    });

    await handleProcessOutput({
        processOutput: $`docker run -it --rm -v ${dockerVolumeName}:/data -v ${process.cwd()}/data:/host_data busybox sh -c "cp -r /data/* /host_data"`,
        errorMessage: 'Failed to copy data to host',
    });

    await handleProcessOutput({
        processOutput: $`docker volume ${['rm', dockerVolumeName]}`,
        errorMessage: 'Failed to remove Docker volume',
    });

    const user = await $`id -u`;
    const group = await $`id -u`;

    await handleProcessOutput({
        processOutput: $`sudo chown ${[
            '-R',
            `${user.stdout.replace('\n', '')}:${group.stdout.replace(
                '\n',
                ''
            )}`,
            `${process.cwd()}/data`,
        ]}`,
        errorMessage: 'Failed to remove Docker volume',
    });
})();

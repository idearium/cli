#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');
const { basename, resolve } = require('path');
const { deprecate } = require('util');
const { loadConfig, newline, reportError } = require('./lib/c');
const {
    flagBuildArgs,
    formatBuildArgs,
    validateBuildArgs,
} = require('./lib/c-kc');

// The basic program, which uses sub-commands.
program
    .arguments('<location>')
    .option(
        '-t, --tag <tag>',
        'Supply a specific tag, otherwise `latest` will be used'
    )
    .option(
        '-n, --name <name>',
        'Supply a name for the image, otherwise the location name will be used'
    )
    .option('--build-arg <arg...>', 'Build arguments to pass to Docker.')
    .description(
        'Provide a Docker location and the Dockerfile will be used to build a Docker image. See https://github.com/idearium/cli#docker-configuration for configuration options.'
    )
    .parse(process.argv);

const getPath = deprecate(
    ({ path }) => path,
    'The path property has been deprecated in favour of the context property.'
);

const [location] = program.args;
const opts = program.opts();
const buildArgs = flagBuildArgs(validateBuildArgs(opts.buildArg || []));

if (!location) {
    return reportError(
        new Error('You need to provide a Docker location'),
        program
    );
}

return loadConfig('docker.locations').then((locations) => {
    // Make sure we have the locations data.
    if (!locations) {
        return reportError(
            new Error(
                'Could not find any NPM locations. See https://github.com/idearium/cli#configuration'
            ),
            false,
            true
        );
    }

    if (!locations[location]) {
        return reportError(
            new Error(`Could not find the ${location} location.`),
            false,
            true
        );
    }

    const dockerLocation = locations[location];
    const context = dockerLocation.context || getPath(dockerLocation);
    const locationPath = resolve(process.cwd(), context);
    const { file = 'Dockerfile', useTar = false } = dockerLocation;

    const tag = opts.tag ? opts.tag : 'latest';
    const name = opts.name ? opts.name : location;

    let cmd = `docker build -t ${name}:${tag}${formatBuildArgs(
        dockerLocation.buildArgs
    )}${formatBuildArgs(buildArgs)} -f ${file}`;

    if (useTar) {
        cmd = `tar -chz -C ${locationPath} . | ${cmd} -`;
    }

    if (!useTar) {
        cmd = `${cmd} ${locationPath}`;
    }

    exec(cmd, { silent: program.R }, (err, stdout, stderr) => {
        if ((err || stderr) && stderr) {
            return reportError(stderr, false, true);
        }

        if ((err || stderr) && err) {
            return reportError(err, false, true);
        }

        if (program.R) {
            process.stdout.write(`${tag}${newline(opts.name)}`);
        }
    });
});

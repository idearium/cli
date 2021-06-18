#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { basename, resolve } = require('path');
const { deprecate } = require('util');
const { loadConfig, newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('<location>')
    .option(
        '-t [tag]',
        'Supply a specific tag, otherwise `latest` will be used'
    )
    .option(
        '-n [name]',
        'Supply a name for the image, otherwise the location name will be used'
    )
    .description(
        'Provide a Docker location and the Dockerfile will be used to build a Docker image. See https://github.com/idearium/cli#docker-configuration for configuration options.'
    )
    .parse(process.argv);

const getPath = deprecate(
    ({ path }) => path,
    'The path property has been deprecated in favour of the context property.'
);

/**
 * Pad a string with a left space, if the string has a length.
 * @param {String} str A string to pad with a left space.
 * @return {String} A string left-padded with a space.
 */
const leftSpace = (str) => {
    if (str && typeof str === 'string') {
        return ` ${str}`;
    }

    return str;
};

/**
 * Given a string of command seperated env variables, turn them into --build-arg arguments for `docker build`.
 * @param {String} args A string of comma seperated env variables.
 * @return {String} --build-arg arguments for `docker build`.
 */
const formatBuildArgs = (args = {}) => {
    const keys = Object.keys(args);

    if (!keys.length) {
        return '';
    }

    const buildArguments = keys
        .map(
            (key) =>
                `--build-arg ${key}=${
                    typeof args[key] === 'function' ? args[key]() : args[key]
                }`
        )
        .join(' ');

    return `${leftSpace(buildArguments)}`;
};

const [location] = program.args;

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

    const tag = program.T ? program.T : 'latest';
    const name = program.N ? program.N : location;

    let cmd = `DOCKER_SCAN_SUGGEST=false docker build -t ${name}:${tag}${formatBuildArgs(
        dockerLocation.buildArgs
    )} -f ${file}`;

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
            process.stdout.write(`${tag}${newline(program.N)}`);
        }
    });
});

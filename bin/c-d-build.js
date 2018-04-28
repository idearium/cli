#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { resolve } = require('path');
const { loadConfig, newline, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('<location>')
    .option('-t [tag]', 'Supply a specific tag, otherwise a timestamp will be used')
    .option('-i [name]', 'Supply a name for the image, otherwise the location name will be used')
    .option('-n', 'Do not print the trailing newline character')
    .option('-r', 'Suppress all output, other than the tag used')
    .option('--build-arg [list]', 'Build arguments to pass to Docker')
    .option('--npm-auth-token', 'Retrieve the NPM auth token and pass it to docker build')
    .description('Provide a Docker location and the Dockerfile will be used to build a Docker image.')
    .parse(process.argv);

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
const formatBuildArgs = (args = []) => {

    if (!args.length) {
        return '';
    }

    const buildArguments = args
        .filter(arg => arg && arg.length)
        .map(arg => `--build-arg ${arg}`)
        .join(' ');

    return `${leftSpace(buildArguments)}`;

};

const [location] = program.args;

if (!location) {
    return reportError(new Error('You need to provide a Docker location'), program);
}

return loadConfig('docker.locations')
    .then((locations) => {

        // Make sure we have the locations data.
        if (!locations) {
            return reportError(new Error('Could not find any NPM locations. See https://github.com/idearium/cli#configuration'), false, true);
        }

        if (!locations[location]) {
            return reportError(new Error(`Could not find the ${location} location.`), false, true);
        }

        const locationPath = resolve(process.cwd(), locations[location]);
        const tag = program.T ? program.T : Math.floor(Date.now() / 1000);
        const name = program.I ? program.I : location;
        const npmAuthToken = program.npmAuthToken ? `${exec('c npm auth -n', { silent: true })}` : '';
        const buildArgs = (program.buildArg || '').split(',');

        if (npmAuthToken.length) {
            buildArgs.unshift(`NPM_AUTH_TOKEN=${npmAuthToken}`);
        }

        const cmd = `docker build -t ${name}:${tag}${formatBuildArgs(buildArgs)} ${locationPath}`;

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

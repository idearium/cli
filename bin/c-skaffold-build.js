#!/usr/bin/env -S node --trace-warnings

'use strict';

const { args } = require('commander-latest');
const program = require('commander-latest');
const { exec } = require('shelljs');
const { env } = require('./lib/c');
const {
    flagBuildArgs,
    formatBuildArgs,
    validateBuildArgs,
} = require('./lib/c-kc');

program
    .option(
        '--build-arg <args...>',
        'A comma seperated list of environment variable names in which to retrieve values from to pass as build args'
    )
    .description(
        "This command should be run via Skaffold. It interprets environment variables used by the Skaffold custom build script contract and builds images accordingly using 'c kc build'."
    )
    .parse(process.argv);

const buildArgs = flagBuildArgs(
    validateBuildArgs(program.opts().buildArg || [])
);

if (!env('IMAGE')) {
    return reportError(
        new Error("The IMAGE environment variable didn't exist."),
        program
    );
}

const [, image] = env('IMAGE').split('/');
const [name, tag] = image.split(':');

exec(`yarn c kc build ${name}${formatBuildArgs(buildArgs)} -t ${tag}`);

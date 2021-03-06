#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { env, reportError } = require('./lib/c');

program
    .description(
        "This command should be run via Skaffold. It interprets environment variables used by the Skaffold custom build script contract and builds images accordingly using 'c kc build'."
    )
    .parse(process.argv);

if (!env('IMAGE')) {
    return reportError(
        new Error("The IMAGE environment variable didn't exist."),
        program
    );
}

const [, image] = env('IMAGE').split('/');
const [name, tag] = image.split(':');

exec(`yarn c kc build ${name} -t ${tag}`);

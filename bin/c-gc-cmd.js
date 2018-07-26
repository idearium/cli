#!/usr/bin/env node
'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, reportError } = require('./lib/c');

program
    .arguments('[command...]')
    .description('Runs a gcloud command, configured to use the project\'s configuration, rather than gcloud\'s configuration.')
    .parse(process.argv);

return loadConfig('gcloud')
    .then((gcloud) => {

        const { projectId } = gcloud;

        // Remove the first two entries.
        const parts = program
            .rawArgs
            .slice(2);

        // The command starts with gcloud.
        parts.unshift('gcloud');

        // Mandatory project.
        parts.push('--project', projectId);

        // The rest of the command.
        const cmd = parts.join(' ');

        exec(cmd);

    })
    .catch(err => reportError(err, false, true));

#!/usr/bin/env node

'use strict';

const program = require('commander');
const { URL: Url } = require('url');
const { exec } = require('shelljs');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .parse(process.argv);

return loadConfig('environments')
    .then(({ local }) => {

        // Make sure we have the environments.local data.
        if (!local) {
            return reportError(new Error('Could not find the local environment.'), false, true);
        }

        // Make sure we have the environments.local.url data.
        if (!local.url) {
            return reportError(new Error('Could not find the url in the local environment.'), false, true);
        }

        const url = (Array.isArray(local.url) ? local.url : [local.url]).map(uri => new Url(uri).host);

        exec('c mk ip -n', { silent: true }, (err, ip) => {

            if (err) {
                return reportError(err, false, true);
            }

            exec(`c hosts add ${ip} ${url.join(' ')}`);

        });

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.json file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });

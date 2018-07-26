#!/usr/bin/env node

'use strict';

const program = require('commander');
const { loadConfig, proxyCommand, proxyCommands, reportError } = require('./lib/c');
const { resolve } = require('path');

// The basic program, which uses sub-commands.
program
    .arguments('<location> [cmd...]')
    .description('Provide an NPM location, and a NPM command to run against that location. For example `c npm proxy app install -SE @idearium/cli`.')
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('You need to provide an NPM location'), program);
}

if (program.args.length === 1) {
    return reportError(new Error('You need to provide an NPM command'), program);
}

// Construct the NPM command
const npmCommand = `npm ${program.rawArgs.slice(3).join(' ')}`;

return loadConfig('npm')
    .then((data) => {

        // Make sure we have the locations data.
        if (!data.locations) {
            return reportError(new Error('Could not find any NPM locations. See https://github.com/idearium/cli#configuration'), false, true);
        }

        const { locations } = data;
        const [location] = program.args;

        if (location === 'all') {
            return proxyCommands(Object.keys(locations).map(loc => [resolve(process.cwd(), locations[loc]), npmCommand]));
        }

        // Find the location.
        if (!locations[location]) {
            return reportError(new Error(`Could not find the ${location} location.`), false, true);
        }

        return proxyCommand(resolve(process.cwd(), locations[location]), npmCommand);

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });

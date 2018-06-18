#!/usr/bin/env node

'use strict';

const program = require('commander');
const { loadConfig, reportError, storeState } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('<env>')
    .description('Set the current environment for your project. It must be one that you have defined with c.js.')
    .parse(process.argv);

const [env] = program.args;

if (!env) {
    return reportError(new Error('You must pass the environment argument.'), program);
}

return loadConfig('environments')
    .then((data) => {

        if (!data[env]) {
            return reportError(new Error(`The '${env}' environment hasn't been defined. See https://github.com/idearium/cli#configuration`));
        }

        return storeState('env', env);

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });

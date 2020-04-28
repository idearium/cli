#!/usr/bin/env node

'use strict';

const path = require('path');
const program = require('commander');
const dotenv = require('dotenv');
const { test } = require('shelljs');
const { executeTemplate, writeFile } = require('./lib/c');

// Setup the program.
program
    .arguments('<value>')
    .description(
        'The <value> can be either reset, or an environment to modify Docker Compose.'
    )
    .parse(process.argv);

// Retrieve the value passed in.
const [value] = program.args;

// Let's get to the root of the project.
const projectRoot = path.resolve(process.cwd());

// Setup the locals.
// Load the defaults first.
const defaults = dotenv.config({
    path: path.join(projectRoot, 'devops', 'templates', '.env.defaults'),
}).parsed;

// Update the current value with the defaults.
const locals = Object.assign(dotenv.config().parsed || {}, defaults);

// Reset the COMPOSE_FILE value.
locals.COMPOSE_FILE = defaults.COMPOSE_FILE;

// Let's determine if the file exists first.
if (value !== 'reset') {
    const file = `docker-compose.${value}.yml`;

    /* eslint-disable padded-blocks */
    if (!test('-f', path.join(projectRoot, file))) {
        throw Error(`File ${file} did not exist.`);
    }
    /* eslint-enable padded-blocks */

    // Update it with the second file.
    locals.COMPOSE_FILE += `:${file}`;
}

// Execute the template, then write out the new file.
return executeTemplate('.env.tmpl', locals).then((str) =>
    writeFile(path.join(projectRoot, '.env'), str)
);

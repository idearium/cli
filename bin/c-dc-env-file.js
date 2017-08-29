#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const program = require('commander');
const handlebars = require('handlebars');
const dotenv = require('dotenv');

// Set the default values that `<value>` can be.
const values = ['reset'];

// Setup the program.
program
    .arguments('<value>')
    .description(`The <value> can be one of the following: ${values.toString()}.`)
    .parse(process.argv);

// Retrieve the value passed in.
const [value] = program.args;

// Make sure the value provided was one of the acceptable values.
/* eslint-disable padded-blocks */
if (!values.includes(value)) {
    program.help();
}
/* eslint-enable padded-blocks */

// Let's get to the root of the project.
const root = path.resolve(__dirname, '..');

/**
 * Given a template file, and a locals object, compile the template and generate the result.
 * @param  {String} file        A path to a template file.
 * @param  {Object} [locals={}] The locals to the pass to the template.
 * @return {Promise}            A promise.
 */
const executeTemplate = (file, locals = {}) => new Promise((resolve, reject) => {

    fs.readFile(path.join(root, 'templates', file), 'utf-8', (err, data) => {

        /* eslint-disable padded-blocks */
        if (err) {
            return reject(err);
        }
        /* eslint-enable padded-blocks */

        const template = handlebars.compile(data);

        return resolve(template(locals));

    });

});

/**
 * Give some content, write it to a file.
 * @param  {String} content A string, representing the content to write to file.
 * @param  {String} file    A path to a file to write.
 * @return {Promise}        A promise.
 */
const writeFile = (content, file) => new Promise((resolve, reject) => {

    fs.writeFile(file, content, (err) => {

        /* eslint-disable padded-blocks */
        if (err) {
            return reject(err);
        }
        /* eslint-enable padded-blocks */

        return resolve();

    });

});

// Load the current configuration, so we don't loose any previous values.
const locals = dotenv.config();

/* eslint-disable padded-blocks */
if (value === 'reset') {
    locals.COMPOSE_FILE = 'docker-compose.yml';
}
/* eslint-enable padded-blocks */

// Execute the template, then write out the new file.
return executeTemplate('.env.tmpl', locals)
    .then(str => writeFile(str, path.join(root, '.env')));

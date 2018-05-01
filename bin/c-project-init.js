#!/usr/bin/env node

'use strict';

const program = require('commander');
const inquirer = require('inquirer');
const glob = require('glob');
const Mustache = require('mustache');
const { exec } = require('shelljs');
const { promisify } = require('util');
const { readFile, writeFile } = require('fs');
const { sep, dirname, resolve: pathResolve } = require('path');
const { reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .description('Initialise a new project. It will result in a c.js file that can be further customised.')
    .parse(process.argv);

inquirer.prompt([
    {
        message: 'What is the project\'s organisation?',
        name: 'organisation',
    },
    {
        message: 'What is the project\'s name?',
        name: 'project',
    },
    {
        'default': 'local,beta,production',
        'message': 'List the environments the project will use, separated by comma:',
        'name': 'environments',
    },
    {
        choices: [
            {
                key: 'y',
                name: 'Yes',
                value: true,
            },
            {
                key: 'n',
                name: 'No',
                value: false,
            },
        ],
        message: 'Does this project have NPM locations?:',
        name: 'hasNpmLocations',
        type: 'expand',
    },
    {
        choices: [
            {
                key: 'y',
                name: 'Yes',
                value: true,
            },
            {
                key: 'n',
                name: 'No',
                value: false,
            },
        ],
        message: 'Does this project have Docker locations?:',
        name: 'hasDockerLocations',
        type: 'expand',
    },
    {
        choices: [
            {
                key: 'y',
                name: 'Yes',
                value: true,
            },
            {
                key: 'n',
                name: 'No',
                value: false,
            },
        ],
        message: 'Does this project use Kubernetes?:',
        name: 'usesKubernetes',
        type: 'expand',
    },
    {
        choices: [
            {
                key: 'y',
                name: 'Yes',
                value: true,
            },
            {
                key: 'n',
                name: 'No',
                value: false,
            },
        ],
        message: 'Does this project have eslint?:',
        name: 'hasEslint',
        type: 'expand',
    },
])
    .then((answers) => {

        const environments = answers.environments
            .split(',')
            .map(env => env.trim())
            .sort();

        const {
            hasDockerLocations,
            hasEslint,
            hasNpmLocations,
            organisation,
            project: name,
            usesKubernetes,
        } = answers;

        const data = {
            environments,
            hasDockerLocations,
            hasEslint,
            hasNpmLocations,
            project: {
                name,
                organisation,
            },
            usesKubernetes,
        };

        return data;

    })
    .then(data => new Promise((resolve, reject) => {

        if (!data.hasNpmLocations) {
            return resolve(data);
        }

        promisify(glob)('*/root/*/package.json')
            .then((npm) => {

                data.npm = npm.map((location) => {

                    const directory = `./${dirname(location)}/`;
                    const [name] = dirname(location).split(sep);

                    return {
                        label: name,
                        value: directory,
                    };

                });

                return resolve(data);

            })
            .catch(reject);

    }))
    .then(data => new Promise((resolve, reject) => {

        if (!data.hasDockerLocations) {
            return resolve(data);
        }

        promisify(glob)('*/Dockerfile')
            .then((dockerfiles) => {

                data.docker = dockerfiles.map((dockerfile) => {

                    const [name] = dirname(dockerfile).split(sep);

                    return {
                        label: name,
                        value: `./${name}`,
                    };

                });

                return resolve(data);

            })
            .catch(reject);


    }))
    .then(data => new Promise((resolve, reject) => {

        readFile(pathResolve(__dirname, '..', 'c.js'), 'utf8', (err, template) => {

            if (err) {
                return reject(err);
            }

            const content = Mustache.render(template, data);

            writeFile(`${process.cwd()}/c.js`, content, (writeErr) => {

                if (writeErr) {
                    reject(writeErr);
                }

                return resolve(data);

            });

        });

    }))
    .then((data) => {

        if (data.hasEslint) {
            exec('eslint --fix ./c.js');
        }

    })
    .catch((err) => {

        return reportError(err, false, true);

    });

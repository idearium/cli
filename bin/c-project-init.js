#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const inquirer = require('inquirer');
const merge = require('lodash.merge');
const glob = require('glob');
const Mustache = require('mustache');
const { exec } = require('shelljs');
const { promisify } = require('util');
const { readFile, writeFile } = require('fs');
const { dirname, resolve: pathResolve, sep } = require('path');
const { reportError, storeState } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .option('-d', 'Dry run. Output result to stdout, rather than to c.js.')
    .description(
        'Initialise a new project. It will result in a c.js file that can be further customised.'
    )
    .parse(process.argv);

inquirer
    .prompt([
        {
            message: "What is the project's organisation?",
            name: 'organisation',
            type: 'input',
        },
        {
            message: "What is the project's name?",
            name: 'project',
            type: 'input',
        },
    ])
    .then(
        (answers) =>
            new Promise((resolve) => {
                inquirer
                    .prompt({
                        default: 'local,beta,production',
                        message:
                            'List the environments the project will use, separated by comma:',
                        name: 'environments',
                        type: 'input',
                    })
                    .then(({ environments }) => {
                        merge(answers, { environments });

                        // Generate some questions for each environment
                        const environmentQuestions = environments
                            .split(',')
                            .sort()
                            .map((environment) => ({
                                message: `Enter the url for the ${environment} environment (include the protocol):`,
                                name: `${environment}Url`,
                                type: 'input',
                            }));

                        // Ask the environment questions
                        inquirer
                            .prompt(environmentQuestions)
                            .then((environmentAnswers) => {
                                // Merge them in with the rest of the answers.
                                return resolve(
                                    merge({}, answers, environmentAnswers)
                                );
                            });
                    });
            })
    )
    .then((answers) => {
        inquirer
            .prompt([
                {
                    default: true,
                    message: 'Does this project have NPM locations?:',
                    name: 'hasNpmLocations',
                    type: 'confirm',
                },
                {
                    default: true,
                    message: 'Does this project have Docker locations?:',
                    name: 'hasDockerLocations',
                    type: 'confirm',
                },
                {
                    default: true,
                    message: 'Does this project use MongoDB?:',
                    name: 'usesMongodb',
                    type: 'confirm',
                },
                {
                    default: true,
                    message: 'Does this project use Kubernetes?:',
                    name: 'usesKubernetes',
                    type: 'confirm',
                },
                {
                    default: true,
                    message: 'Does this project have eslint?:',
                    name: 'hasEslint',
                    type: 'confirm',
                },
            ])
            .then((moreAnswers) => {
                merge(answers, moreAnswers);

                const environments = answers.environments
                    .split(',')
                    .sort()
                    .map((env) => ({
                        label: env.trim(),
                        url: answers[`${env.trim()}Url`],
                    }));

                const {
                    hasDockerLocations,
                    hasEslint,
                    hasNpmLocations,
                    organisation,
                    project: name,
                    usesKubernetes,
                    usesMongodb,
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
                    usesMongodb,
                };

                return data;
            })
            .then(
                (data) =>
                    new Promise((resolve, reject) => {
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
                    })
            )
            .then(
                (data) =>
                    new Promise((resolve, reject) => {
                        if (!data.hasDockerLocations) {
                            return resolve(data);
                        }

                        promisify(glob)('*/Dockerfile')
                            .then((dockerfiles) => {
                                data.docker = dockerfiles.map((dockerfile) => {
                                    const [name] = dirname(dockerfile).split(
                                        sep
                                    );

                                    return {
                                        label: name,
                                        value: `./${name}`,
                                    };
                                });

                                return resolve(data);
                            })
                            .catch(reject);
                    })
            )
            .then(
                (data) =>
                    new Promise((resolve, reject) => {
                        readFile(
                            pathResolve(__dirname, '..', 'c.js'),
                            'utf8',
                            (err, template) => {
                                if (err) {
                                    return reject(err);
                                }

                                const content = Mustache.render(template, data);

                                if (program.D) {
                                    /* eslint-disable no-console */
                                    console.log('');
                                    console.log(content);
                                    /* eslint-enable no-console */

                                    return resolve(data);
                                }

                                writeFile(
                                    `${process.cwd()}/c.js`,
                                    content,
                                    (writeErr) => {
                                        if (writeErr) {
                                            reject(writeErr);
                                        }

                                        return resolve(data);
                                    }
                                );
                            }
                        );
                    })
            )
            .then((data) => {
                if (!program.D && data.hasEslint) {
                    exec('./node_modules/.bin/eslint --fix ./c.js');
                }
            })
            .then(() => storeState('env', 'local'));
    })
    .catch((err) => {
        return reportError(err, false, true);
    });

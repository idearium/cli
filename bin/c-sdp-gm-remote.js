'use strict';

const execa = require('execa');
const program = require('commander-latest');
const { loadConfig, reportError } = require('./lib/c');
const { submoduleExists, inSubmodule } = require('./lib/c-sdp');

// The basic program, which uses sub-commands.
program
    .requiredOption(
        '-s, --submodule <name>',
        'The name of the section submodule as defined in c.js'
    )
    .description('Sets up a git remote in the sectionio submodule.')
    .parse(process.argv);

execa
    .shell(
        `yarn c sdp service -n section-shared git-daemon-developer-pop --url`
    )
    .then(({ code, stderr, stdout }) => {
        if (!code && !stderr.length && stdout.length) {
            return stdout;
        }

        throw new Error(stderr);
    })
    .then((url) =>
        loadConfig('section').then((submodules) => {
            const { submodule } = program.opts();

            if (!submoduleExists(submodules, submodule)) {
                return reportError(
                    new Error(
                        'The submodule name you provided does not exist in c.js'
                    ),
                    program
                );
            }

            const { path, reference } = submodules[submodule];

            return execa
                .shell(inSubmodule(path, 'git remote get-url developer-pop'))
                .then(({ code, stderr, stdout }) => {
                    if (!code && !stderr && stdout) {
                        return execa.shell(
                            inSubmodule(
                                path,
                                `git remote set-url developer-pop ${url}/${reference}.git`
                            )
                        );
                    }

                    return new Error(stderr);
                })
                .catch(({ code, stderr }) => {
                    if (code) {
                        return execa.shell(
                            inSubmodule(
                                path,
                                `git remote add developer-pop ${url}/${reference}.git`
                            )
                        );
                    }

                    return console.error(stderr);
                });
        })
    );

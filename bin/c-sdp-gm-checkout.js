'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');
const { loadConfig, reportError } = require('./lib/c');
const { submoduleExists } = require('./lib/c-sdp');

// The basic program, which uses sub-commands.
program
    .arguments('<branch>')
    .option('-c --create', "Create if it doesn't exist.")
    .requiredOption(
        '-s, --submodule <name>',
        'The name of the section submodule as defined in c.js'
    )
    .description(
        "Checks out a branch in the sectionio submodule and optionally creates it if it doesn't exist."
    )
    .parse(process.argv);

const [branch] = program.args;

if (!branch) {
    return reportError(
        new Error('You need to provide the name of the branch'),
        program
    );
}

loadConfig('section').then((submodules) => {
    const { create, submodule } = program.opts();

    if (!submoduleExists(submodules, submodule)) {
        return reportError(
            new Error('The submodule name you provided does not exist in c.js'),
            program
        );
    }

    return import('execa')
        .then(({ execa }) =>
            execa(
                `yarn c sdp gm cmd -s ${submodule} rev-parse --verify ${branch}`,
                { shell: true }
            )
        )
        .then(({ code, stderr, stdout }) => {
            if (!code && !stderr.length && stdout.length) {
                return exec(
                    `yarn c sdp gm cmd -s ${submodule} checkout ${branch}`
                );
            }

            if (!code && stderr.length && create) {
                return exec(
                    `yarn c sdp gm cmd -s ${submodule} checkout -b ${branch}`
                );
            }

            throw new Error(
                'Branch did not exist, and the create option was not set.'
            );
        })
        .catch((err) => {
            return reportError(err, program, true);
        });
});

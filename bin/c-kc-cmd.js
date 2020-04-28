#!/usr/bin/env node
'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');
const { spawn } = require('child_process');
const { loadConfig, loadState, reportError } = require('./lib/c');
const { formatProjectPrefix } = require('./lib/c-project');

program
    .arguments('[command...]')
    .description(
        "Runs a kubectl command, configured to use the project's context, rather than kubectl's context."
    )
    .parse(process.argv);

return Promise.all([loadState('env'), loadConfig()])
    .then(([env, config]) => {
        const { kubernetes, project } = config;
        const { organisation, name } = project;
        const { environments } = kubernetes;

        const namespace =
            getPropertyPath(
                config,
                `kubernetes.environments.${env}.namespace`
            ) || formatProjectPrefix(organisation, name, env, true, true);

        // Remove the first two entries.
        const parts = program.rawArgs.slice(2);

        // The command starts with kubectrl.
        parts.unshift('kubectl');

        // Mandatory namespace and context.
        parts.push(
            '--namespace',
            namespace,
            '--context',
            environments[env].context
        );

        // The rest of the command.
        const cmd = parts.join(' ');

        spawn(cmd, {
            shell: true,
            stdio: 'inherit',
        });
    })
    .catch((err) => reportError(err, false, true));

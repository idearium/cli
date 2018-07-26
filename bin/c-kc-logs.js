#!/usr/bin/env node
'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');
const { exec } = require('shelljs');
const { loadConfig, loadState } = require('./lib/c');
const { formatProjectPrefix } = require('./lib/c-project');

program
    .arguments('<selector>')
    .description('Output logs from all Kubernetes pods. The selector defaults to `--selector svc`.')
    .parse(process.argv);

const [svc] = program.args;

return Promise.all([
    loadState('env'),
    loadConfig(),
])
    .then(([env, config]) => {

        const { kubernetes, project } = config;
        const { organisation, name } = project;
        const { environments } = kubernetes;
        let selector = 'svc';

        if (svc) {
            selector = `svc=${svc}`;
        }

        const namespace = getPropertyPath(config, `kubernetes.environments.${env}.namespace`) || formatProjectPrefix(organisation, name, env, true, true);

        exec(`stern --color always --selector ${selector} --namespace ${namespace} --context ${environments[env].context}`);

    });

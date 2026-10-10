'use strict';

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const { getSecretsContract } = require('./lib/c-secrets');
const { assertGcloudAuth } = require('./lib/c-secrets-io');
const { findConsumers } = require('./lib/c-secrets-verify');

const print = (line) => process.stdout.write(`${line}\n`);

program
    .arguments('<secretId>')
    .description(
        "List everything referencing a GSM secret id: contract consumers, the environment's SecretProviderClasses and deployed Cloud Functions. Gate every deletion on this."
    )
    .parse(process.argv);

const [secretId] = program.args;

if (!secretId) {
    return reportError(
        new Error('You need to provide <secretId>'),
        program,
        true
    );
}

return loadConfig()
    .then((config) => {
        const contract = getSecretsContract({ config });

        if (!contract) {
            throw new Error(
                'No secrets contract in c.js. See https://github.com/idearium/cli#configuration'
            );
        }

        assertGcloudAuth();

        return findConsumers({ config, contract, secretId });
    })
    .then(({ contract: consumers, env, functions, k8s }) => {
        const total = consumers.length + functions.length + k8s.length;

        print(`env: ${env}\n`);

        print('contract:');
        if (consumers.length === 0) {
            print('  (none)');
        }
        consumers.forEach(({ borrowed, key, owner, service }) => {
            print(
                `  ${service} ${key} (owner ${owner}${
                    borrowed ? ', borrowed' : ', owned'
                })`
            );
        });

        print('\nkubernetes:');
        if (k8s.length === 0) {
            print('  (none)');
        }
        k8s.forEach(({ name, namespace }) => {
            print(`  secretproviderclass ${name} (${namespace})`);
        });

        print('\nfunctions:');
        if (functions.length === 0) {
            print('  (none)');
        }
        functions.forEach(({ name }) => {
            print(`  ${name}`);
        });

        print(
            total === 0
                ? `\nUNREFERENCED - safe to delete (gate satisfied).`
                : `\nREFERENCED by ${total} consumer(s) - do not delete.`
        );

        return null;
    })
    .catch((e) => reportError(e, false, true));

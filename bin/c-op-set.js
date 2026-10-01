'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const program = require('commander');
const { loadConfig, reportError } = require('./lib/c');
const {
    assertKnownEnv,
    getSecretsContract,
    resolveIdentity,
} = require('./lib/c-secrets');
const {
    assertOpSession,
    generateValue,
    opFieldExists,
    opUpsertField,
    registerServiceInCjs,
    resolveOwnerItem,
    setOpItemInCjs,
    sha12,
} = require('./lib/c-secrets-io');

program
    .arguments('<service> <env> <key>')
    .option('-g, --generate', 'Generate a value instead of reading stdin.')
    .option(
        '-t [type]',
        'Value type for --generate: hex, base64, alphanumeric.'
    )
    .option('-l [length]', 'Value length for --generate.')
    .description(
        'Upsert a secret value into 1Password. Pipe the value via stdin, or use --generate. New keys are added to the service item; unbound services resolve (or create) their item automatically and register into c.js.'
    )
    .parse(process.argv);

const [name, env, key] = program.args;

if (!name || !env || !key) {
    return reportError(
        new Error('You need to provide <service> <env> <key>'),
        program,
        true
    );
}

const readStdin = () => {
    if (process.stdin.isTTY) {
        throw new Error(
            'Pipe the value via stdin (printf "value" | ...) or use --generate.'
        );
    }

    return require('fs')
        .readFileSync(0, 'utf8')
        .replace(/\r?\n$/, '');
};

return loadConfig()
    .then((config) => {
        const contract = getSecretsContract({ config });

        if (!contract) {
            throw new Error(
                'No secrets contract in c.js. See https://github.com/idearium/cli#configuration'
            );
        }

        assertOpSession();
        assertKnownEnv({ config, env });

        const value = program.generate
            ? generateValue({
                  length: program.L ? parseInt(program.L, 10) : 32,
                  type: program.T,
              })
            : readStdin();

        const title = (serviceName) =>
            `${contract.organisation}-${contract.name}/${serviceName}`;

        const reportBinding = ({ binding, serviceName }) => {
            if (binding.created) {
                print(
                    `created 1Password item ${title(serviceName)} (${
                        binding.id
                    })`
                );
            } else if (binding.persisted) {
                print(
                    `bound existing 1Password item ${title(serviceName)} (${
                        binding.id
                    }) into c.js`
                );
            }
        };

        let item;
        let ref;
        let section;

        // Resolve the destination: an existing entry (the key's owner), a
        // new key on an existing entry, or a brand new service. Unbound
        // services resolve (or create) their item and persist the binding.
        try {
            const identity = resolveIdentity({ contract, env, name });

            const owner =
                identity.kind === 'service'
                    ? identity.service.keys.includes(key)
                        ? identity.service
                        : (
                              identity.service.sharedKeys.find(
                                  (shared) => shared.key === key
                              ) || {}
                          ).owner
                    : null;

            if (identity.kind === 'consumer') {
                const borrowed = identity.consumer.sharedKeys.find(
                    (shared) => shared.key === key
                );

                const ownsKey =
                    identity.consumer.keys.includes(key) || !borrowed;

                const binding = ownsKey
                    ? {
                          created: false,
                          id: contract.dev.opItem,
                          persisted: false,
                      }
                    : resolveOwnerItem({
                          owner: borrowed.owner,
                          title: title(borrowed.owner.name),
                      });

                if (binding.persisted) {
                    setOpItemInCjs({
                        name: borrowed.owner.name,
                        opItem: binding.id,
                    });
                }

                reportBinding({
                    binding,
                    serviceName: borrowed.owner.name,
                });

                item = binding.id;
                section = ownsKey ? identity.consumer.name : 'local';
            } else {
                const target = owner || identity.service;
                const serviceName = target.name;
                const binding = resolveOwnerItem({
                    owner: target,
                    title: title(serviceName),
                });

                if (binding.persisted) {
                    setOpItemInCjs({ name: serviceName, opItem: binding.id });
                }

                reportBinding({ binding, serviceName });

                item = binding.id;
                section = env;
            }

            ref = `op://${contract.vault}/${item}/${section}/${key}`;
        } catch (e) {
            if (!e.message.includes('No service or dev consumer')) {
                throw e;
            }

            // A brand new service: resolve-by-title first (no duplicates),
            // creating only when the item truly doesn't exist.
            if (name === 'shared') {
                throw new Error(
                    'Use the secrets.shared block for shared keys - add it to c.js (its opItem points at the item storing the values).'
                );
            }

            if (!/^[a-z][a-z0-9-]*$/.test(name)) {
                throw new Error(
                    `New service names must be kebab-case ('${name}')`
                );
            }

            const binding = resolveOwnerItem({
                owner: null,
                title: title(name),
            });

            reportBinding({ binding, serviceName: name });

            item = binding.id;
            section = env;
            ref = `op://${contract.vault}/${item}/${section}/${key}`;

            registerServiceInCjs({ key, name, opItem: item });
        }

        opUpsertField({ field: key, item, section, value });

        if (program.generate) {
            return print(ref);
        }

        return print(
            `${ref} ${sha12({ value: Buffer.from(value, 'utf8') })} len=${
                value.length
            }${
                opFieldExists({ field: key, item, section })
                    ? ''
                    : ' (WARNING: field not found after write)'
            }`
        );
    })
    .catch((e) => reportError(e, false, true));

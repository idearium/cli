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
    generateValueForProgram,
    opFieldExists,
    opUpsertField,
    registerServiceInCjs,
    resolveOrCreateOwnerItem,
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
        'Upsert a secret value into 1Password for a key the contract knows (owned or borrowed). Pipe the value via stdin, or use --generate. Unbound services resolve (or create) their item automatically and register into c.js.'
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
            ? generateValueForProgram({ program })
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

        // Resolve the destination: the key's owner (an existing entry,
        // owned or borrowed), or a brand new service. Unbound services
        // resolve (or create) their item and persist the binding.
        try {
            const identity = resolveIdentity({ contract, env, name });

            const entry =
                identity.kind === 'service'
                    ? identity.service
                    : identity.consumer;

            const borrowed = entry.sharedKeys.find(
                (shared) => shared.key === key
            );

            const owned = entry.keys.includes(key);

            // The contract is the source of truth: a key no entry owns
            // or borrows would write an orphan field (verify's
            // op:EXTRA), so stop at the door with the remedy.
            if (!owned && !borrowed) {
                const remedy =
                    identity.kind === 'service'
                        ? `declare it with \`c secrets add ${name} ${env} ${key}\``
                        : "add it to the consumer's keys in c.js first";

                throw new Error(
                    `'${key}' is neither owned nor borrowed by '${name}' - fix the typo, or ${remedy}.`
                );
            }

            if (identity.kind === 'consumer') {
                const binding = owned
                    ? {
                          created: false,
                          id: contract.dev.opItem,
                          persisted: false,
                      }
                    : resolveOrCreateOwnerItem({
                          owner: borrowed.owner,
                          title: title(borrowed.owner.name),
                      });

                // Only borrowed keys resolve (or persist) an owner's
                // item; owned keys already live in the dev item.
                if (borrowed && binding.persisted) {
                    setOpItemInCjs({
                        name: borrowed.owner.name,
                        opItem: binding.id,
                    });

                    reportBinding({
                        binding,
                        serviceName: borrowed.owner.name,
                    });
                }

                item = binding.id;
                section = owned ? identity.consumer.name : 'local';
            }

            if (identity.kind === 'service') {
                const target = owned ? identity.service : borrowed.owner;
                const serviceName = target.name;
                const binding = resolveOrCreateOwnerItem({
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

            const binding = resolveOrCreateOwnerItem({
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

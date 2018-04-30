# @idearium/cli

The Idearium cli, which makes working with our projects, super easy :)

## Documentation

The cli is self documenting and you'll find limited information about the commands within the cli here.

## Install

Via NPM:

```
$ npm install -DE [-g] @idearium/cli
```

We actually recommend installing `@idearium/cli` locally in your project. This allows each project to use a different version of the cli. If you do however, we also recommend adding `./node_modules/.bin` to your path, so that you can run the cli via `c` without a global install.

## Usage

Once installed, simply run `c`, and you'll get the help output for all commands. Running a sub-command and then `--help` will give you the help output for that command (i.e. `c dc --help`).

## Commands

The following is a summary of the top level commands.

- `c d` is for everything Docker.
- `c dc` is for everything Docker Compose.
- `c hosts` helps with hosts management.
- `c mk` is for everything Minikube.
- `c npm` is for everything NPM.
- `c project` is for project nanagement.
- `c yarn` is for everything is for everything Yarn.

## Configuration

The Idearium cli can be customised through configurations. Configurations are provided through a `c.js` file located in projects root folder.

The `c.js` should be a standard Node.js file. It will be loaded through `require`. The `c.js` should export an object, with the following keys representing configuration:

```javascript
module.exports = {
    docker: {
        // ...
    },
    environments: {
        // ...
    },
    kubernetes: {
        // ...
    },
    npm: {
        // ...
    },
    project: {
        // ...
    },
};
```

### Docker configuration

The Idearium cli supports a Docker configuration. The Docker configuration can be used to define locations of multiple Dockerfiles within your project.

An example Docker configuration:

```JavaScript
'use strict';

const { exec } = require('shelljs');

module.exports = {
    docker: {
        locations: {
            'app': {
                buildArgs: {
                    NPM_AUTH_TOKEN: () => exec('c npm auth -n', { silent: true }).stdout,
                },
                path: './app',
            },
            'static': {
                path: './static',
            },
        },
    },
};
```

The Docker configuration supports the following keys.

#### locations

The locations key should be an object, describing all Dockerfile locations in your project. Each key should be the name of a Dockerfile location. You can use the name to reference the location when using the cli. Each location supports the following structure.

##### path

A path to the Dockerfile location.

##### buildArgs

An object represent key=value `--build-arg` flags to pass to `docker build`. Each property should present a build argument name, and the value for the build argument. The value can be either a static value (i.e. string, number) or a function.

### Environments configuration

The Idearium cli supports multiple environments. The environments can be whatever you need them to be as long as you define them in `c.js`. Here is an example environments configuration:

```JavaScript
'use strict';

module.exports = {
    environments: {
        local: {},
        production: {},
    },
};
```

At present, they simply define the environments your project supports.

### Kubernetes configuration

You can supply a Kubernetes configuration. The configuration allows you to define contexts and namespaces for each environment your project supports. Here is an example kubernetes configuration:

```JavaScript
'use strict';

module.exports = {
    kubernetes: {
        environments: {
            local: {
                context: 'minikube',
            },
            production: {
                context: 'gke_focus-booster_us-east1-b_focus-booster',
                region: 'us-east1',
            },
        }
    },
};
```

The `context` will be used to set the `kubectrl` context. Some environments also need to provide a `region`.

### NPM configuration

The Idearium cli supports an NPM configuration. The configuration can be used to provide the cli without information about where NPM commands can be run. To provide this information, add an `npm` property in `c.js` like so:

```JavaScript
'use strict';

module.exports = {
    npm: {
        locations: {
            name: './app/root/app/',
            project: './',
        },
    },
};
```

You should customise it, but you need to provide a `locations` key, containing an object with a name and folder for each NPM location in your project. You'll use the name to reference the location.

For example, the `c npm proxy` command can be used to run a NPM command, at a specific location or all locations:

- Execute `c npm proxy all install -SE logentries` to install the `logentries` module at all NPM locations in your project.
- Execute `c npm proxy project install -DE jest` to install the `jest` module at the `project` location in your project.

### Project configuration

The Idearium cli supports a project configuration. This configuration is used to provide some general information about the project. This information is also used to automatically generate some strings such as the project prefix, and Kubernetes namespaces. Here is an example project configuration:

```JavaScript
'use strict';

module.exports = {
    project: {
        name: 'www',
        organisation: 'fb'
    },
};
```

## State

The Idearium cli, understands the concept of state. The only state it manages at present is the environment of your project. The current environment of your project will be used in certain commands, but not all commands.

State is stored in a JSON file at `./devops/state.json`, and is created and written to by the `c project env set` and `c project setup` commands.

# @idearium/cli

This file is a history of the changes made to @idearium/cli.

## Unreleased

### Fixed

-   Fixed `c mk start` for newer kubernetes environments.

### Changed

-   `c mk docker-env` now uses the zsh shell.

## v3.3.0 - 2020-04-28

### Added

-   Added a new version bump commands.

## v3.2.0 - 2020-04-21

### Added

-   Added a new build workflow.

## v3.1.0 (8 August 2019)

-   Improved command.
-   Bug fixes.

### Improved command

-   The path property (from `c.js) used by`c d build <location>` has been deprecated.
-   `c d build <location>` now prefers `context` and `file` properties, rather than `path`.

### Bug fixes

-   Updated `c skaffold dev` to a bash command (works better with CTRL + C).

## v3.0.3 (8 August 2019)

-   Bug fixes.

### Bug fixes

-   Removed some unnecessary console output.

## v3.0.3 (7 August 2019)

-   New commands.

### Improvements

-   Added the `c kc manifests` command.
-   Added the `c skaffold dev` command.

## v3.0.2 (5 August 2019)

-   Improved commands.
-   New commands.

### Improvements

-   `c kc build` now accepts a `-t` option to provide a tag.
-   Added the `c skaffold build` command.

## v3.0.1 (28 May 2019)

-   Bug fixes.
-   Improved command.

### Bug fixes

-   The `c mongo download`, `c mongo import` and `c mongo sync` now actually work when the database name is different between servers.

### Improvements

-   Added support for a `-p` on all `c mk` commands to support Minikube profiles.

## v3.0.0 (7 May 2019)

-   Improved commands.
-   Breaking changes.

### Breaking changes

-   `c mongo download`, `c mongo import` and `c mongo sync` now support a more flexible definition in `c.js` files.

## v2.1.3 (7 May 2019)

-   Improved commands.

### Improvements

-   `c mongo download`, `c mongo import` and `c mongo sync` now support a `collection` argument to act only on a specific collection.

## v2.1.2 (7 May 2019)

-   Locked down the mongo version.

## v2.1.1 (30 April 2019)

-   Improved command.

### Improvements

-   Add `<location>` to `c kc stop` allowing you to stop a specific Kubernetes location. Defaults to `all` so it's a backwards compatible improvement.

## v2.1.0 (2 April 2019)

-   New workflow.
-   Improved commands.

### Improvements

-   Added a new workflow, `start`. Used to start the project.
-   `c workflow list` now shows all workflows and indicates those that aren't available.
-   `c workflow list` now shows any errors a workflow is producing.

## v2.0.0

-   New and renamed workflows.

### Improvements

-   Added a new workflow, `restart`. Used when switching between multiple PR branches on the same project.

### Breaking changes

-   Renamed `cli-init` to `cli`.
-   Renamed `project-init` to `init`.

## v1.1.1

-   Halved the minikube memory requirements to 4096MB.

## v1.1.0

-   New commands.

### Improvements

-   Added `c kc ngrok` to support exposing Kubernetes services to the world using Ngrok.

## v1.0.0

-   New commands.
-   New concept.

### Improvements

-   Added `c mk delete`, `c mk hosts`, `c mk ip`, `c mk start`, `c mk stop` and `c mk restart` to control Minikube.
-   Added `c hosts add`, `c hosts get` and `c hosts remove` to help with easy hosts management.
-   Added `c project env ls`, `c project env get` and `c project env set`, `c project init`, `c project name`, `c project organisation`, `c project prefix` to help with project environment management.
-   Added a `c d build` command.
-   Added `c kc apply`, `c kc build`, `c kc clean`, `c kc cmd`, `c kc context`, `c kc context get`, `c kc context set`, `c kc deploy`, `c kc logs`, `c kc pod`, `c kc secret`, `c kc start`, `c kc stop` and `c kc test` commands to help with kubectrl.
-   Added `c gc cmd` and `c gc create` commands to help with gcloud.
-   Added `c fs symlink` commands to help with the file system.
-   Added the concept of a workflow, allowing project specific needs for predefined workflows. Current workflows are `project-init` and `cli-init`.
-   Added `c workflow list` and `c workflow [cmd]` commands to help with project operation.

## v1.0.0-alpha.12

-   New command.
-   New concept.

### Improvements

-   Added a `c npm proxy <location> [cmd...]` command to proxy NPM commands to certain configured NPM locations within your project. Also supports `all` inplace of `<location>` to proxy against multiple locations in sequence.
-   Added a `c yarn proxy <location> [cmd...]` command which works exactly like `c npm proxy` but uses Yarn instead.
-   Added the concept of a configuration, allowing project specific configuration for certain aspects of the Idearium cli.

## v1.0.0-alpha.11

-   Minor improvements.
-   New commands.

### Improvements

-   Updated all commands to output an error and show the command help, if you try and run a command that doesn't exist.
-   `c dc rebuild <service>` will now always recreate containers.
-   Added the `--remove-orphans` to all `c dc down` command, as standard.
-   Added `c npm auth` to retrieve an NPM auth token from `~/.npmrc`.

## v1.0.0-alpha.10

-   New commands.
-   Updated commands.

### Improvements

-   Added `c dc rebuild [service]` to run `docker-compose build [service] && docker-compose up -d [service]`.
-   Added an optional `<service>` argument and if used, `docker-compose logs` will be limited to that service.

## v1.0.0-alpha.9

-   Bug fix.

### Fixes

-   Fixes `c dc env file` errors when a `.env` file doesn't exist.

## v1.0.0-alpha.8

-   Bug fix.

### Fixes

-   Updated the logic for `c dc env file` so that it produces more consistent results.

## v1.0.0-alpha.7

-   Improvements.

### Improvements

-   `c dc env file` now requires you provide, in addition to `./devops/templates/.env.tmpl` a `./devops/templates/.env.defaults` file, for a list of default values to provide to the template. Example files below.

**`.env.tmpl`**

```
COMPOSE_PROJECT_NAME={{COMPOSE_PROJECT_NAME}}
COMPOSE_FILE={{COMPOSE_FILE}}
```

**`.env.defaults`**

```
COMPOSE_PROJECT_NAME=cp
COMPOSE_FILE=docker-compose.yml
```

## v1.0.0-alpha.6

-   New commands.

### Improvements

-   Added `c d ps` to run `docker ps`.
-   Added `c d images` to run `docker images`.
-   Added `c d clean images` to remove unused Docker images.
-   Added `c d clean containers` to remove unused Docker containers.

## v1.0.0-alpha.5

-   Minor improvements.

### Improvements

-   Updated `c dc env file` to work more like the original from `c.sh`. If you pass `reset` it will reset the `COMPOSE_FILE` entry to be `docker-compose.yml`. If you pass `show` and the `docker-compose.show.yml` file exists, it will set the `COMPOSE_FILE` entry to be `docker-compose.yml:docker-compose.show.yml`.

## v1.0.0-alpha.4

-   Bug fix release.

### Bugs

-   Fixed an issue with `package.json`.

## v1.0.0-alpha.3

-   First published version of the cli.

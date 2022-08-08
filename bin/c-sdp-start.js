'use strict';

const { exec } = require('shelljs');

exec(
    `minikube -p section start --disk-size 24g --extra-config=apiserver.service-node-port-range=80-32767 --kubernetes-version v1.16.2 --memory=4096 --vm-driver=vmware`
);

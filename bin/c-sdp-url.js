'use strict';

const { exec } = require('shelljs');

exec(`c sdp service -n section-shared developer-pop --url`);

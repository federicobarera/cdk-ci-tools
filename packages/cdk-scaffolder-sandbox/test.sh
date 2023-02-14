#!/bin/bash

. clean.sh
. scaffold.sh

npm i || exit 1
npx cdk synth || exit 1
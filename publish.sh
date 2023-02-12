set -e

npm run build
npx lerna publish --force-publish --conventional-commits --no-verify-access --loglevel silly
/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: [
    'default',
    [ 'jest-junit', {
      outputDirectory: './reports',
      outputName: 'junit.xml'
    }]
  ]
};
// @ts-check

import { publish } from '@tanstack/publish-config'

await publish({
  branchConfigs: {
    main: {
      prerelease: false
    }
  },
  packages: [{ name: 'gitmedaddy', packageDir: 'dist' }],
  rootDir: '.',
  tag: 'git'
  // branch: process.env.BRANCH,
  // ghToken: process.env.GH_TOKEN,
})

process.exit(0)

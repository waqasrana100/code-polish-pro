#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const util = require('util');
const semver = require('semver');

const MINIMUM_NODE_VERSION = '14.0.0';

// Advanced logger with timestamps and log levels
const logger = {
  _log(level, message) {
    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  },
  info: (message) => logger._log('info', message),
  warn: (message) => logger._log('warn', message),
  error: (message) => logger._log('error', message),
  debug: (message) => process.env.DEBUG && logger._log('debug', message),
};

const projectTypes = ['nextjs', 'react', 'nodejs', 'angular', 'vue', 'svelte'];

const commonDependencies = [
  'eslint@^8.39.0',
  'prettier@^2.8.8',
  'eslint-config-prettier@^8.8.0',
  'eslint-plugin-prettier@^4.2.1',
];

const typeSpecificDependencies = {
  nextjs: ['@next/eslint-plugin-next@^13.3.4'],
  react: ['eslint-plugin-react@^7.32.2', 'eslint-plugin-react-hooks@^4.6.0', 'eslint-plugin-jsx-a11y@^6.7.1'],
  nodejs: ['eslint-plugin-node@^11.1.0'],
  angular: [
    '@angular-eslint/eslint-plugin@^16.0.3',
    '@angular-eslint/eslint-plugin-template@^16.0.3',
  ],
  vue: ['eslint-plugin-vue@^9.11.0'],
  svelte: ['eslint-plugin-svelte@^2.27.1'],
};

const typescriptDependencies = [
  '@typescript-eslint/parser@^5.59.5',
  '@typescript-eslint/eslint-plugin@^5.59.5',
];

const huskyDependencies = ['husky@^8.0.3', 'lint-staged@^13.2.2'];

const eslintConfigs = {
  nextjs: {
    extends: [
      'next/core-web-vitals',
      'plugin:@next/next/recommended',
      'plugin:prettier/recommended',
    ],
  },
  react: {
    extends: [
      'eslint:recommended',
      'plugin:react/recommended',
      'plugin:react/jsx-runtime',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
      'plugin:prettier/recommended',
    ],
    plugins: ['react', 'react-hooks', 'jsx-a11y'],
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  nodejs: {
    extends: [
      'eslint:recommended',
      'plugin:node/recommended',
      'plugin:prettier/recommended',
    ],
    plugins: ['node'],
  },
  angular: {
    extends: [
      'eslint:recommended',
      'plugin:@angular-eslint/recommended',
      'plugin:@angular-eslint/template/recommended',
      'plugin:prettier/recommended',
    ],
    plugins: ['@angular-eslint'],
  },
  vue: {
    extends: [
      'eslint:recommended',
      'plugin:vue/vue3-recommended',
      'plugin:prettier/recommended',
    ],
    plugins: ['vue'],
  },
  svelte: {
    extends: [
      'eslint:recommended',
      'plugin:svelte/recommended',
      'plugin:prettier/recommended',
    ],
    plugins: ['svelte'],
    overrides: [
      {
        files: ['*.svelte'],
        parser: 'svelte-eslint-parser',
      },
    ],
  },
};

async function prompt(question, validator = () => true) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = await new Promise((resolve) => rl.question(question, resolve));
      if (validator(answer)) {
        return answer;
      }
      logger.warn('Invalid input. Please try again.');
    }
  } finally {
    rl.close();
  }
}

async function checkNodeVersion() {
  const nodeVersion = process.version;
  if (!semver.gte(nodeVersion, MINIMUM_NODE_VERSION)) {
    throw new Error(`Node.js version ${MINIMUM_NODE_VERSION} or higher is required. Current version: ${nodeVersion}`);
  }
}

async function checkGitRepository() {
  try {
    await fs.access('.git');
  } catch (error) {
    throw new Error('This directory is not a Git repository. Please initialize a Git repository before running this script.');
  }
}

async function installDependencies(dependencies) {
  logger.info('Installing dependencies...');
  
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['install', '--save-dev', ...dependencies];

  try {
    // Try using spawn first
    await new Promise((resolve, reject) => {
      const installProcess = spawn(npmCommand, args, { stdio: 'inherit' });
      installProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });
    });
  } catch (error) {
    logger.warn('Spawn method failed, falling back to execSync...');
    try {
      // Fallback to execSync if spawn fails
      execSync(`${npmCommand} ${args.join(' ')}`, { stdio: 'inherit' });
    } catch (execError) {
      logger.error('Failed to install dependencies.');
      throw execError;
    }
  }

  logger.info('Dependencies installed successfully.');
}

async function writeJsonFile(filePath, content) {
  await fs.writeFile(filePath, JSON.stringify(content, null, 2) + '\n');
  logger.info(`File created: ${filePath}`);
}

async function readPackageJson() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error('Unable to read package.json. Make sure you are in the root directory of your project.');
  }
}

async function updatePackageJson(updates) {
  const packageJson = await readPackageJson();
  const updatedPackageJson = { ...packageJson, ...updates };
  await writeJsonFile('package.json', updatedPackageJson);
}

async function setupHusky() {
  logger.info('Setting up Husky and lint-staged...');
  
  await installDependencies(huskyDependencies);
  
  execSync('npx husky install', { stdio: 'inherit' });
  
  const preCommitContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;
  await fs.writeFile('.husky/pre-commit', preCommitContent);
  await fs.chmod('.husky/pre-commit', '755');
  
  logger.info('Husky and lint-staged have been configured.');
}

async function setupProject() {
  try {
    await checkNodeVersion();
    await checkGitRepository();

    logger.info('Welcome to ESLint Pretty Quick! Let\'s set up your project.');

    const projectType = await prompt(
      `What type of project are you working on? (${projectTypes.join(', ')}): `,
      (answer) => projectTypes.includes(answer.toLowerCase())
    );

    const useTypeScript = (await prompt('Are you using TypeScript? (y/n): ')).toLowerCase() === 'y';
    const useHusky = (await prompt('Do you want to set up Husky and lint-staged for pre-commit hooks? (y/n): ')).toLowerCase() === 'y';
    const useStrict = (await prompt('Do you want to enable strict mode for ESLint? (y/n): ')).toLowerCase() === 'y';
    const usePrettier = (await prompt('Do you want to use Prettier for code formatting? (y/n): ')).toLowerCase() === 'y';

    logger.info(`Setting up your ${projectType} project with the following options:`);
    logger.info(`- ${useTypeScript ? 'TypeScript' : 'JavaScript'}`);
    logger.info(`- ${useHusky ? 'With' : 'Without'} Husky and lint-staged`);
    logger.info(`- ${useStrict ? 'Strict' : 'Standard'} ESLint configuration`);
    logger.info(`- ${usePrettier ? 'With' : 'Without'} Prettier integration`);

    let dependencies = [
      ...commonDependencies,
      ...typeSpecificDependencies[projectType],
    ];
    if (useTypeScript) dependencies = [...dependencies, ...typescriptDependencies];
    if (!usePrettier) dependencies = dependencies.filter((dep) => !dep.includes('prettier'));

    await installDependencies(dependencies);

    const eslintConfig = {
      ...eslintConfigs[projectType],
      root: true,
      env: {
        browser: true,
        es2021: true,
        node: true,
      },
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
    };

    if (useTypeScript) {
      eslintConfig.parser = '@typescript-eslint/parser';
      eslintConfig.plugins = [...(eslintConfig.plugins || []), '@typescript-eslint'];
      eslintConfig.extends.unshift('plugin:@typescript-eslint/recommended');
    }

    if (useStrict) {
      eslintConfig.rules = {
        ...eslintConfig.rules,
        'no-console': 'error',
        'no-debugger': 'error',
        'no-unused-vars': 'error',
      };
    }

    await writeJsonFile('.eslintrc.json', eslintConfig);

    if (usePrettier) {
      const prettierConfig = {
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 100,
        tabWidth: 2,
        semi: true,
      };
      await writeJsonFile('.prettierrc', prettierConfig);
    }

    const packageJsonUpdates = {
      scripts: {
        lint: 'eslint .',
        'lint:fix': 'eslint . --fix',
      },
    };

    if (usePrettier) {
      packageJsonUpdates.scripts.format = 'prettier --write .';
    }

    if (useHusky) {
      packageJsonUpdates['lint-staged'] = {
        '*.{js,jsx,ts,tsx}': ['eslint --fix'],
        '*.{json,md}': ['prettier --write'],
      };
      await setupHusky();
    }

    await updatePackageJson(packageJsonUpdates);

    logger.info('ESLint and Prettier have been set up successfully!');
    logger.info('To address any potential vulnerabilities, please run:');
    logger.info('npm audit fix');
    logger.info('Happy coding!');
  } catch (error) {
    logger.error(`An error occurred: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

setupProject().catch(error => {
  logger.error('An unexpected error occurred:', error);
  if (error.stack) {
    logger.debug(`Stack trace: ${error.stack}`);
  }
  process.exit(1);
});
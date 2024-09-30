#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const semver = require('semver');

// Configuration
const config = {
  MINIMUM_NODE_VERSION: '14.0.0',
  PROJECT_TYPES: ['nextjs', 'react', 'nodejs', 'angular', 'vue', 'svelte'],
};

// Dependency management
const dependencyManager = {
  commonDependencies: [
    'eslint@^8.56.0',
    'prettier@^3.2.5',
    'eslint-config-prettier@^9.1.0',
    'eslint-plugin-prettier@^5.1.3',
  ],
  typeSpecificDependencies: {
    nextjs: ['eslint-config-next@latest'],
    react: [
      'eslint-plugin-react@^7.34.1',
      'eslint-plugin-react-hooks@^4.6.0',
      'eslint-plugin-jsx-a11y@^6.8.0',
      'eslint-config-react-app@^7.0.1',
      'eslint-plugin-import@^2.29.1',
    ],
    nodejs: ['eslint-plugin-node@^11.1.0'],
    angular: ['@angular-eslint/eslint-plugin@^17.3.0', '@angular-eslint/eslint-plugin-template@^17.3.0'],
    vue: ['eslint-plugin-vue@^9.23.0'],
    svelte: [
    'eslint-plugin-svelte@latest',
    'svelte-eslint-parser@latest',
    'prettier-plugin-svelte@latest',
    'eslint-config-prettier@latest',
    'svelte-check@latest'
  ],
  },
  typescriptDependencies: [
    '@typescript-eslint/parser@^7.1.0',
    '@typescript-eslint/eslint-plugin@^7.1.0',
  ],
  huskyDependencies: ['husky@^9.0.11', 'lint-staged@^15.2.2'],
  getProjectDependencies(projectType, useTypeScript, usePrettier) {
    let deps = [...this.commonDependencies, ...this.typeSpecificDependencies[projectType]];
    if (useTypeScript && projectType !== 'nextjs') deps = [...deps, ...this.typescriptDependencies];
    if (!usePrettier) deps = deps.filter(dep => !dep.includes('prettier'));
    return deps;
  },
};

// ESLint configuration templates
const eslintConfigTemplates = {
  nextjs: {
    extends: ['next/core-web-vitals', 'prettier'],
  },
  react: {
    extends: [
      'react-app',
      'react-app/jest',
      'plugin:react/recommended',
      'plugin:react/jsx-runtime',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
      'prettier',
    ],
    plugins: ['react', 'react-hooks', 'jsx-a11y'],
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  nodejs: {
    extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
    plugins: ['node'],
    env: { node: true },
  },
  angular: {
    extends: [
      'eslint:recommended',
      'plugin:@angular-eslint/recommended',
      'plugin:@angular-eslint/template/recommended',
      'prettier',
    ],
    plugins: ['@angular-eslint'],
  },
  vue: {
    extends: ['eslint:recommended', 'plugin:vue/vue3-recommended', 'prettier'],
    plugins: ['vue'],
  },
  svelte: {
    extends: ['eslint:recommended', 'plugin:svelte/recommended', 'prettier'],
    plugins: ['svelte'],
    overrides: [{ files: ['*.svelte'], parser: 'svelte-eslint-parser' }],
  },
};

// Logger utility
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

// User interaction utilities
const userInteraction = {
  async prompt(question, validator = () => true) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      while (true) {
        const answer = await new Promise((resolve) => rl.question(question, resolve));
        if (validator(answer)) return answer;
        logger.warn('Invalid input. Please try again.');
      }
    } finally {
      rl.close();
    }
  },
  async getProjectOptions() {
    const projectType = await this.prompt(
      `What type of project are you working on? (${config.PROJECT_TYPES.join(', ')}): `,
      (answer) => config.PROJECT_TYPES.includes(answer.toLowerCase())
    );
    const useTypeScript = (await this.prompt('Are you using TypeScript? (y/n): ')).toLowerCase() === 'y';
    const useHusky = (await this.prompt('Do you want to set up Husky and lint-staged for pre-commit hooks? (y/n): ')).toLowerCase() === 'y';
    const useStrict = (await this.prompt('Do you want to enable strict mode for ESLint? (y/n): ')).toLowerCase() === 'y';
    const usePrettier = (await this.prompt('Do you want to use Prettier for code formatting? (y/n): ')).toLowerCase() === 'y';

    return { projectType, useTypeScript, useHusky, useStrict, usePrettier };
  },
};

// File system utilities
const fileSystem = {
  async writeJsonFile(filePath, content) {
    await fs.writeFile(filePath, JSON.stringify(content, null, 2) + '\n');
    logger.info(`File created: ${filePath}`);
  },
  async writeFile(filePath, content) {
    await fs.writeFile(filePath, content);
    logger.info(`File created: ${filePath}`);
  },
  async readPackageJson() {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error('Unable to read package.json. Make sure you are in the root directory of your project.');
    }
  },
  async updatePackageJson(updates) {
    const packageJson = await this.readPackageJson();
    const updatedPackageJson = { ...packageJson, ...updates };
    await this.writeJsonFile('package.json', updatedPackageJson);
  },
  async checkExistingESLintConfig() {
    const eslintConfigFiles = [
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      '.eslintrc.json',
    ];

    for (const configFile of eslintConfigFiles) {
      try {
        await fs.access(configFile);
        return configFile;
      } catch (error) {
        // File doesn't exist, continue checking
      }
    }

    return null;
  },
  async createEslintIgnore(projectType) {
    const commonIgnores = [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '*.min.js',
      '*.d.ts',
    ];

    const typeSpecificIgnores = {
      nextjs: ['next.config.js', '.next'],
      react: ['react-app-env.d.ts'],
      nodejs: [],
      svelte: [
        'rollup.config.js',
        'svelte.config.js',
        '.svelte-kit',
        'package',
        'build',
        '.env',
        '.env.*',
        '!.env.example',
        'vite.config.js'
      ],
    };

    const ignores = [...commonIgnores, ...(typeSpecificIgnores[projectType] || [])];
    const content = ignores.join('\n');
    await this.writeFile('.eslintignore', content);
  },
  async createPrettierIgnore() {
    const ignores = [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '*.min.js',
      '*.d.ts',
      '.next',
      'package-lock.json',
      'yarn.lock',
    ];
    const content = ignores.join('\n');
    await this.writeFile('.prettierignore', content);
  },
};

// Package manager utilities
const packageManager = {
  async installDependencies(dependencies) {
    logger.info('Installing dependencies...');
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['install', '--save-dev', '--legacy-peer-deps', ...dependencies];
    try {
      await new Promise((resolve, reject) => {
        const installProcess = spawn(npmCommand, args, { stdio: 'inherit' });
        installProcess.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`npm install failed with code ${code}`));
        });
      });
    } catch (error) {
      logger.warn('Spawn method failed, falling back to execSync...');
      try {
        execSync(`${npmCommand} ${args.join(' ')}`, { stdio: 'inherit' });
      } catch (execError) {
        logger.error('Failed to install dependencies.');
        logger.error('Attempting to install dependencies one by one...');
        for (const dep of dependencies) {
          try {
            execSync(`${npmCommand} install --save-dev ${dep}`, { stdio: 'inherit' });
            logger.info(`Successfully installed ${dep}`);
          } catch (singleDepError) {
            logger.error(`Failed to install ${dep}. Skipping...`);
          }
        }
      }
    }
    logger.info('Dependency installation process completed.');
  },
  async removeConflictingDependencies(projectType) {
    const conflictingDependencies = {
      nextjs: ['@next/eslint-plugin-next'],
      react: [],
      nodejs: [],
      angular: [],
      vue: [],
      svelte: [],
    };

    for (const dep of conflictingDependencies[projectType]) {
      try {
        execSync(`npm uninstall ${dep}`, { stdio: 'inherit' });
        logger.info(`Removed conflicting dependency: ${dep}`);
      } catch (error) {
        logger.warn(`Failed to uninstall ${dep}. It might not have been installed.`);
      }
    }
  },
};

// Environment check utilities
const environmentChecker = {
  async checkNodeVersion() {
    const nodeVersion = process.version;
    if (!semver.gte(nodeVersion, config.MINIMUM_NODE_VERSION)) {
      throw new Error(`Node.js version ${config.MINIMUM_NODE_VERSION} or higher is required. Current version: ${nodeVersion}`);
    }
  },
  async checkGitRepository() {
    try {
      await fs.access('.git');
    } catch (error) {
      throw new Error('This directory is not a Git repository. Please initialize a Git repository before running this script.');
    }
  },
};

// Prettier configuration generator
const prettierConfigGenerator = {
  generateConfig(projectType) {
    const baseConfig = {
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 100,
      tabWidth: 2,
      semi: true,
    };

    if (projectType === 'svelte') {
      return {
        ...baseConfig,
        plugins: ['prettier-plugin-svelte'],
        svelteStrictMode: false,
        svelteAllowShorthand: true,
        svelteIndentScriptAndStyle: true,
      };
    }

    return baseConfig;
  },
};

// Husky setup utility
const huskySetup = {
  async setup() {
    logger.info('Setting up Husky and lint-staged...');
    await packageManager.installDependencies(dependencyManager.huskyDependencies);
    execSync('npx husky install', { stdio: 'inherit' });
    const preCommitContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;
    await fs.writeFile('.husky/pre-commit', preCommitContent);
    await fs.chmod('.husky/pre-commit', '755');
    logger.info('Husky and lint-staged have been configured.');
  },
};


async function createSvelteTsConfig() {
  const tsConfig = {
    extends: '@tsconfig/svelte/tsconfig.json',
    compilerOptions: {
      moduleResolution: 'node',
      target: 'esnext',
      module: 'esnext',
      importsNotUsedAsValues: 'error',
      isolatedModules: true,
      sourceMap: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      allowJs: true,
      checkJs: true,
      baseUrl: '.',
      paths: {
        '$lib': ['src/lib'],
        '$lib/*': ['src/lib/*']
      }
    },
    include: ['src/**/*.d.ts', 'src/**/*.ts', 'src/**/*.js', 'src/**/*.svelte'],
    exclude: ['node_modules/*', '__sapper__/*', 'public/*']
  };

  await fileSystem.writeJsonFile('tsconfig.json', tsConfig);
};

async function isSvelteUsingTypeScript() {
  try {
    const files = await fs.readdir(process.cwd());
    return files.some(file => file === 'tsconfig.json' || file.endsWith('.ts') || file.endsWith('.svelte'));
  } catch (error) {
    logger.warn('Error checking for TypeScript in Svelte project:', error);
    return false;
  }
}

// ESLint configuration generator
const eslintConfigGenerator = {
  generateConfig(projectType, useTypeScript, useStrict, usePrettier, packageJson, existingConfig = {}) {
    let eslintConfig = {
      root: true,
      env: {
        browser: true,
        es2022: true,
        node: true,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: packageJson.type === 'module'
          ? 'module'
          : (projectType === 'react' || projectType === 'nextjs' || projectType === 'svelte')
            ? 'module'
            : 'script',
      },
      rules: {
        'no-console': useStrict ? 'error' : 'warn',
        'no-debugger': 'error',
        'no-unused-vars': 'error',
      },
    };

    // Merge with existing configuration
    eslintConfig = this.mergeConfigs(eslintConfig, existingConfig);

    // Add project-specific configurations
    switch (projectType) {
      case 'react':
        eslintConfig = this.configureReact(eslintConfig, useTypeScript);
        break;
      case 'nextjs':
        eslintConfig = this.configureNextjs(eslintConfig);
        break;
      case 'nodejs':
        eslintConfig = this.configureNodejs(eslintConfig);
        break;
      case 'svelte':
        eslintConfig = this.configureSvelte(eslintConfig);
        break;
      case 'vue':
        eslintConfig = this.configureVue(eslintConfig);
        break;
      case 'angular':
        eslintConfig = this.configureAngular(eslintConfig);
        break;
    }

    if (useTypeScript && projectType !== 'nextjs') {
      eslintConfig = this.configureTypeScript(eslintConfig);
    }

    if (usePrettier) {
      eslintConfig = this.configurePrettier(eslintConfig);
    }

    return eslintConfig;
  },

  mergeConfigs(baseConfig, existingConfig) {
    const merged = { ...baseConfig };
    for (const [key, value] of Object.entries(existingConfig)) {
      if (Array.isArray(value)) {
        merged[key] = [...new Set([...(merged[key] || []), ...value])];
      } else if (typeof value === 'object' && value !== null) {
        merged[key] = this.mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    return merged;
  },



  configureReact(config, useTypeScript) {
    config.extends = [
      ...(config.extends || []),
      'plugin:react/recommended',
      'plugin:react/jsx-runtime',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
      'plugin:import/errors',
      'plugin:import/warnings',
    ];
    config.plugins = [...(config.plugins || []), 'react', 'react-hooks', 'jsx-a11y', 'import'];
    config.settings = {
      ...config.settings,
      react: { version: 'detect' },
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    };
    config.rules = {
      ...config.rules,
      'react/prop-types': useTypeScript ? 'off' : 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'import/no-unresolved': 'error',
      'import/named': 'error',
      'import/default': 'error',
      'import/namespace': 'error',
    };
    if (useTypeScript) {
      config.parserOptions.ecmaFeatures = { jsx: true };
    }
    return config;
  },

  configureNextjs(config) {
    config.extends = [...(config.extends || []), 'next/core-web-vitals'];
    return config;
  },

  configureNodejs(config) {
    config.extends = [...(config.extends || []), 'plugin:node/recommended'];
    config.plugins = [...(config.plugins || []), 'node'];
    config.rules = {
      ...config.rules,
      'node/exports-style': ['error', 'module.exports'],
      'node/file-extension-in-import': ['error', 'always'],
      'node/prefer-global/buffer': ['error', 'always'],
      'node/prefer-global/console': ['error', 'always'],
      'node/prefer-global/process': ['error', 'always'],
      'node/prefer-global/url-search-params': ['error', 'always'],
      'node/prefer-global/url': ['error', 'always'],
      'node/prefer-promises/dns': 'error',
      'node/prefer-promises/fs': 'error',
    };
    return config;
  },




configureSvelte(config, useTypeScript) {
  config.extends = [
    'eslint:recommended',
    'plugin:svelte/recommended',
  ];
  config.parser = 'svelte-eslint-parser';
  config.plugins = ['svelte'];
  config.overrides = [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: useTypeScript ? '@typescript-eslint/parser' : 'espree',
      },
    }
  ];
  if (useTypeScript) {
    config.extends.push('plugin:@typescript-eslint/recommended');
    config.plugins.push('@typescript-eslint');
    config.parserOptions = {
      ...config.parserOptions,
      project: './tsconfig.json',
      extraFileExtensions: ['.svelte']
    };
  }
  
  // Add specific rules for Svelte files
  config.rules = {
    ...config.rules,
    'svelte/no-unused-vars': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': useTypeScript ? ['error', { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_" }] : 'off',
  };

  return config;
},

  configureVue(config) {
    config.extends = [...(config.extends || []), 'plugin:vue/vue3-recommended'];
    config.plugins = [...(config.plugins || []), 'vue'];
    config.parser = 'vue-eslint-parser';
    return config;
  },

  configureAngular(config) {
    config.extends = [
      ...(config.extends || []),
      'plugin:@angular-eslint/recommended',
      'plugin:@angular-eslint/template/process-inline-templates',
    ];
    config.plugins = [...(config.plugins || []), '@angular-eslint'];
    return config;
  },

  configureTypeScript(config) {
    config.parser = '@typescript-eslint/parser';
    config.plugins = [...(config.plugins || []), '@typescript-eslint'];
    config.extends = [
      ...(config.extends || []),
      'plugin:@typescript-eslint/recommended',
    ];
    config.rules = {
      ...config.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    };
    return config;
  },

  configurePrettier(config) {
    config.extends = [...(config.extends || []), 'plugin:prettier/recommended'];
    config.rules = {
      ...config.rules,
      'prettier/prettier': 'error',
    };
    return config;
  },
};

// Main setup function
async function setupProject() {
  try {
    await environmentChecker.checkNodeVersion();
    await environmentChecker.checkGitRepository();

    logger.info('Welcome to code-polish-pro! Let\'s set up your project.');

    const options = await userInteraction.getProjectOptions();
    let { projectType, useTypeScript, useHusky, useStrict, usePrettier } = options;


    logger.info(`Setting up your ${projectType} project with the following options:`);
    logger.info(`- ${useTypeScript ? 'TypeScript' : 'JavaScript'}`);
    logger.info(`- ${useHusky ? 'With' : 'Without'} Husky and lint-staged`);
    logger.info(`- ${useStrict ? 'Strict' : 'Standard'} ESLint configuration`);
    logger.info(`- ${usePrettier ? 'With' : 'Without'} Prettier integration`);



    if (projectType === 'svelte') {
      useTypeScript = await isSvelteUsingTypeScript();
      logger.info(`Detected ${useTypeScript ? 'TypeScript' : 'JavaScript'} for Svelte project.`);
    }

    if (projectType === 'svelte' && useTypeScript) {
      await createSvelteTsConfig();
    }

    const existingESLintConfig = await fileSystem.checkExistingESLintConfig();
    let existingConfig = {};
    if (existingESLintConfig) {
      logger.warn(`Existing ESLint configuration found: ${existingESLintConfig}`);
      const overwrite = (await userInteraction.prompt('Do you want to overwrite the existing configuration? (y/n): ')).toLowerCase() === 'y';
      if (!overwrite) {
        logger.info('Merging with existing ESLint configuration.');
        existingConfig = require(path.resolve(process.cwd(), existingESLintConfig));
      }
    }

    await packageManager.removeConflictingDependencies(projectType);

    const dependencies = dependencyManager.getProjectDependencies(projectType, useTypeScript, usePrettier);
    await packageManager.installDependencies(dependencies);

    const packageJson = await fileSystem.readPackageJson();
    const eslintConfig = eslintConfigGenerator.generateConfig(projectType, useTypeScript, useStrict, usePrettier, packageJson, existingConfig);
    await fileSystem.writeJsonFile('.eslintrc.json', eslintConfig);

    // Generate .eslintignore file
    await fileSystem.createEslintIgnore(projectType);

    if (usePrettier) {
      const prettierConfig = prettierConfigGenerator.generateConfig(projectType);
      await fileSystem.writeJsonFile('.prettierrc', prettierConfig);

      // Generate .prettierignore file
      await fileSystem.createPrettierIgnore();
    }

    let packageJsonUpdates = {
      scripts: {
        ...(packageJson.scripts || {}),
        lint: packageJson.scripts?.lint || 'eslint .',
        'lint:fix': packageJson.scripts?.['lint:fix'] || 'eslint . --fix',
      },
    };

    if (projectType === 'svelte') {
      packageJsonUpdates.scripts = {
        ...packageJsonUpdates.scripts,
        lint: 'eslint --ignore-path .gitignore .',
        'lint:fix': 'eslint --ignore-path .gitignore --fix .',
        check: 'svelte-check --tsconfig ./tsconfig.json',
        format: 'prettier --write --plugin prettier-plugin-svelte .',
      };
    }

    if (usePrettier) {
      packageJsonUpdates.scripts.format = packageJson.scripts?.format || 'prettier --write .';
    }

    if (useHusky) {
      packageJsonUpdates['lint-staged'] = {
        '*.{js,jsx,ts,tsx,svelte}': ['eslint --fix'],
        '*.{json,md,css,html,svelte}': ['prettier --write'],
      };
      await huskySetup.setup();
    }

    await fileSystem.updatePackageJson(packageJsonUpdates);

    logger.info('ESLint and Prettier have been set up successfully!');
    logger.info('To address any potential vulnerabilities, please run:');
    logger.info('npm audit fix');

    if (packageJson.type !== 'module' && projectType === 'nodejs') {
      logger.info('');
      logger.info('Note: Your package.json does not have "type": "module" set. 😒');
      logger.info('If you want to use ES modules, consider adding "type": "module" ✨');
      logger.info('This will allow you to use import/export syntax without .mjs file extensions. 🚀');
    }

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

# 🚀 CodePolishPro

> Your friendly neighborhood code quality enhancer and linting wizard! ✨

## What is CodePolishPro?

CodePolishPro is an intelligent, interactive CLI tool that takes the pain out of setting up ESLint, Prettier, and other code quality tools for your projects. Whether you're a seasoned dev or just starting out, we've got you covered!

## 🌟 Features

- 🎨 Supports multiple project types (Next.js, React, Node.js, Angular, Vue, Svelte)
- 🔧 TypeScript support out of the box
- 🐶 Optional Husky setup for pre-commit hooks
- 🎭 Configurable ESLint strictness
- 💅 Optional Prettier integration
- 🧙‍♂️ Interactive CLI for a tailored setup experience
- 🔄 Consistent code style across your entire project
- ⚡ Boost productivity with automated setup

## 🚀 Quick Start

Getting started is as easy as 1-2-3!

```bash
npm install code-polish-pro
```

```bash
npx code-polish-pro
```

That's it! Follow the prompts, and we'll set up your project faster than you can say "lint"!

## 🎬 What Happens Next?

Our wizard will guide you through a series of questions:

1. What type of project are you working on?
2. Are you using TypeScript?
3. Do you want to set up Husky and lint-staged?
4. Do you prefer strict or standard ESLint configuration?
5. Would you like to use Prettier for code formatting?

Based on your answers, we'll:

- Install the necessary dependencies
- Create appropriate configuration files
- Set up scripts in your package.json
- Configure Husky and lint-staged (if selected)

## 🛠️ Manual Installation

If you prefer to install globally:

```bash
npm install -g code-polish-pro
```

Then you can run it in any project:

```bash
code-polish-pro
```

## 📘 Usage Tips

- Run `code-polish-pro` at the root of your project
- Make sure you have a `package.json` file in your project
- For best results, run on a fresh project before adding any linting or formatting tools
- Use `DEBUG=true code-polish-pro` for detailed logging if you encounter any issues

## 🤝 Contributing

We love contributions! If you have ideas for improvements or find any bugs, please open an issue or submit a pull request. Check out our [Contributing Guidelines](CONTRIBUTING.md) for more details.

## 📃 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙌 Acknowledgements

A big thank you to the ESLint, Prettier, and Husky teams for their amazing tools!

## 📚 Further Reading

- [ESLint Documentation](https://eslint.org/docs/user-guide/)
- [Prettier Documentation](https://prettier.io/docs/en/index.html)
- [Husky Documentation](https://typicode.github.io/husky/#/)

---

Happy coding! Remember, polished code is happy code! 😊
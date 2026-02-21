Install Python packages into the project's virtual environment. Always activate the venv first so packages are installed in the right location, not the system Python.

Steps:
1. `cd server && source .venv/bin/activate`
2. Then run the pip install command, e.g.: `pip install <package>`
3. Add the package to `server/pyproject.toml` under `dependencies` if it is a runtime dependency, or under `[project.optional-dependencies] dev` if it is a dev/test dependency.

Never use `pip install` without first activating the venv.

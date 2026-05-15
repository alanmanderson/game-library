FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash claude && \
    mkdir -p /home/claude/.claude/debug && \
    chown -R claude:claude /home/claude/.claude

WORKDIR /app
RUN chown claude:claude /app

USER claude

ENTRYPOINT ["claude", "--dangerously-skip-permissions"]

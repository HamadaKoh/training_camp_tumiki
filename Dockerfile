FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl \
    git \
    nodejs \
    npm \
    ca-certificates \
    gnupg \
    ripgrep \
    sudo \
    tmux \
    && rm -rf /var/lib/apt/lists/*
# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Create user with sudo privileges
RUN useradd -m -s /bin/bash claude && \
    echo 'claude ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Switch to claude user
USER claude
WORKDIR /home/claude/workspace

# Configure npm global directory and install Claude Code
RUN npm config set prefix '/home/claude/.npm-global' && \
    npm install -g @anthropic-ai/claude-code

# Add npm global bin to PATH
ENV PATH="/home/claude/.npm-global/bin:$PATH"
CMD ["claude"]
# Install Tsumiki
RUN npx tsumiki install
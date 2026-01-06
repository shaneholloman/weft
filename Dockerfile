FROM docker.io/cloudflare/sandbox:0.6.7

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Longer timeout for Claude Code operations
ENV COMMAND_TIMEOUT_MS=300000

# Port 3000 is used by the sandbox SDK internally
EXPOSE 3000

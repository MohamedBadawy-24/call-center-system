FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY server.js ./
COPY config ./config
COPY controllers ./controllers
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY scripts ./scripts

# Create directories for uploaded files
RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]

FROM node:20-alpine
WORKDIR /app
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]

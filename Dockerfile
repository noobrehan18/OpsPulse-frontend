# Step 1: Build
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Step 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Cloud Run requires PORT=8080
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

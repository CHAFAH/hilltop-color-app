# Use the official Node.js image
FROM node:16

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy application files
COPY . .

# Ensure logs directory exists inside the container
RUN mkdir -p /usr/src/app/logs

# Allow setting the background color at build time
ARG COLOR=red
ENV COLOR=${COLOR}

# Expose the application port
EXPOSE 8080

# Start the application
CMD ["node", "app.js"]

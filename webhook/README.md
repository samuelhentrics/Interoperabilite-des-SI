# Webhook Example Project

## Overview

Webhooks are a way for applications to communicate with each other. They allow one application to send real-time data to another application by making HTTP requests. This project demonstrates a simple setup using webhooks with Node.js and TypeScript.

### What’s Included

- **`server.ts`**: This file sets up a basic Express server that can subscribe to webhooks and trigger events.
- **`client.ts`**: This file sets up another server that receives webhook notifications and processes them.
- **`test.ts`**: This file uses `node-fetch` to test the webhook subscription and event trigger by making HTTP requests to the servers.

### Project Structure

- **`src/server.ts`**: Contains the webhook source server implementation.
- **`src/client.ts`**: Contains the webhook receiver server implementation.
- **`src/test.ts`**: Contains test scripts to simulate webhook subscriptions and events.
- **`sh/dev`**: A shell script to start a Docker container for testing.

## Getting Started

### Installation

1. Clone the repository:

    ```bash
    git clone git@github.com:etidahouse/webhooks-nodejs.git
    cd webhooks-nodejs
    ```

2. Install dependencies:

    ```bash
    npm install
    ```


### Running the Project

1. **Start the servers:**

   Use the `start` script to start both the server and the client concurrently:

    ```bash
    npm run start
    ```

   This will run both `server.ts` and `client.ts` in parallel.

2. **Run the tests:**

   Execute the `test.ts` script to perform tests using `fetch`:

    ```bash
    npm run test
    ```

### Docker Setup

To run the project in a Docker container, use the provided `sh/dev` script. This script sets up a Docker container with Alpine Linux and Node.js, allowing you to test the project without installing Node.js locally.

1. Ensure Docker is installed and running on your machine.

2. Run the Docker container:

    ```bash
    sh sh/dev
    ```

   This script will build and start a Docker container that mounts your project directory, installs dependencies, and runs the tests.

# Node.js Load Balancer

A high-performance, cluster-based load balancer and reverse proxy server implementation in Node.js. This server utilizes Node's built-in clustering capabilities to distribute incoming HTTP requests across multiple worker processes, ensuring optimal resource utilization and improved performance.

## Features

- Multi-process architecture using Node.js cluster module
- Round-robin load balancing across worker processes
- Configuration-based routing rules
- Upstream server proxying
- Error handling and validation using schema validation
- TypeScript support for type safety

### Primary Process
- Initializes the main HTTP server
- Spawns and manages worker processes
- Distributes incoming requests across workers
- Handles worker communication

### Worker Processes
- Handle individual HTTP requests
- Route requests based on configuration rules
- Proxy requests to upstream servers
- Validate incoming/outgoing messages

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Running the Server

```bash
npm start
```

## Features to add in futu

- Add support for HTTPS
- Add support to load balance between multiple upstreams
- Load Balancing could use more optimised algorithms like weighted RR or URL hashing

# Metro Dots

A set of realtime visualations for the DC Metro system based on data from various [WMATA APIs](https://developer.wmata.com/apis). It's still a work in progress, but you can check it out here: [https://metro-vis.netlify.app/](https://metro-vis.netlify.app/).

## Getting Started

These instructions will get you a copy of the project up and running on your local machine.

### Prerequisites

Ensure you have the following installed on your machine:

```bash
Node.js (v18+ recommended)
npm (v9+ recommended)
```

### Installing

Clone the repository and install dependencies:

```bash
git clone https://github.com/karina-peters/metro-map.git
cd metro-map
npm install
```

### Running the Application

To run the server locally, you will need a WMATA API Key. You can get one here: https://developer.wmata.com/.\
Add the following variables to a .env file in the server directory:

```bash
API_KEY=<YOUR_WMATA_API_KEY>
WMATA_HOST=http://api.wmata.com
NODE_ENV=development
```

To start the development servers for both the client and server:

```bash
npm run start
```

This will:

- Build the frontend application using Webpack
- Launch the Express backend server on http://localhost:3001
- Launch the Webpack development server for the frontend on http://localhost:8080

Open your browser to `http://localhost:8080` to view the app. The client is set up to proxy API requests to the backend server.

## Built With

- [Express](https://expressjs.com/) – Server-side framework
- [Webpack](https://webpack.js.org/) – Bundler for frontend assets
- [p5.js](https://p5js.org/) – Visual and interactive canvas library
- [RxJS](https://rxjs.dev/) – Reactive programming for data streams
- [WMATA APIs](https://developer.wmata.com/) – Real-time Metro data

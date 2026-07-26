# alternative-github-actions-marketplace

Alternative for the GitHub Marketplace, hosting my own version with more information and some default filtering that the official marketplace is missing

## Components

This repository consists of four main components:

### Frontend Application

**[Frontend](src/frontend/README.md)** - React-based web interface for browsing and searching GitHub Actions

- Browse over 20,000+ GitHub Actions
- Search by action name or owner
- Filter by action type (Node/JavaScript, Docker, Composite)
- View detailed action information including dependents count
- View action README files

### Backend API

**[Backend API](src/backend/README.md)** - Azure Functions API for serving action metadata

- RESTful API endpoints
- Azure Table Storage integration
- Authentication and authorization

### VS Code Extension

**[VS Code Extension](vscode-extension/README.md)** - Browse the marketplace from
your editor, and give AI agents the real latest version and commit SHA of any action

- Contributes language model tools so GitHub Copilot resolves action versions
  instead of recalling stale ones from training data
- Caches a compact snapshot of the whole dataset locally, refreshed at most once
  a day, so search and version lookups work offline
- Stats and search panel mirroring the website, plus copy/insert of SHA-pinned
  `uses:` values

### Client Package

**[@devops-actions/actions-marketplace-client](src/backend/README.md)** - Client library for uploading GitHub Actions metadata to the marketplace API

- [Installation and Usage](src/backend/README.md#installation)
- [Release Documentation](src/backend/README.md#releasing-a-new-version) - How to publish new versions of the client package

## Architecture

The application is deployed to Azure using:
- **Azure Static Web Apps** (Free tier) - Hosts the frontend
- **Azure Functions** (Consumption plan) - Hosts the backend API
- **Azure Table Storage** - Stores action metadata

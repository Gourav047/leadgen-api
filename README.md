# Search API

This is the backend service for the SearchApp, built using NestJS. It provides RESTful APIs for managing users and pages.

## Project Structure

- **src/**: Contains the source code for the application.
  - **common/**: Contains common utilities, DTOs, and filters.
  - **modules/**: Contains feature modules for different entities.
    - **user/**: User-related functionality.
    - **pages/**: Pages-related functionality.

## Installation

To install the dependencies, run:

```
npm install
```

## Running the Application

To start the application in development mode, use:

```
npm run start:dev
```

## API Endpoints

- **Users**
  - `POST /users`: Create a new user.
  - `GET /users`: Retrieve all users.
  - `GET /users/:id`: Retrieve a user by ID.
  - `PUT /users/:id`: Update a user by ID.
  - `DELETE /users/:id`: Delete a user by ID.

- **Pages**
  - `POST /pages`: Create a new page.
  - `GET /pages`: Retrieve all pages.
  - `GET /pages/:id`: Retrieve a page by ID.
  - `PUT /pages/:id`: Update a page by ID.
  - `DELETE /pages/:id`: Delete a page by ID.

## Environment Variables

Create a `.env` file in the root of the project to set up environment variables such as database connection strings and API keys.

## License

This project is licensed under the MIT License.
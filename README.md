# CICR Inventory Management System 

This is a simple yet robust inventory management system built for CICR. It allows authorized users to manage inventory items with features like CRUD operations, search, filtering, and more. The system is built using a modern tech stack and is designed to be modular, maintainable, and scalable.

## Features

### Core Features

#### Authentication
- Hardcoded user credentials (no signup or user creation).
- JWT-based authentication for secure session management.
- Logout functionality to clear the JWT token.

#### Inventory Management
- Add, edit, view, and delete inventory items.
- Inventory item fields:
  - `id` (UUID)
  - `name` (string)
  - `category` (string)
  - `quantity` (integer)
  - `location` (string)
  - `status` (Available / Issued)
  - `lastUpdated` (timestamp)
- Search and filter items by name, category, or status.

#### Access Control
- Only logged-in users can access the system.
- Role-based access control (RBAC) for future scalability (e.g., Admin and Viewer roles).

#### Frontend UI
- Login page for authentication.
- Dashboard with a table displaying inventory items (sorting and pagination supported).
- Form for adding/editing inventory items with validation.
- Toast notifications for success/error feedback.
- Responsive design for mobile and desktop compatibility.
- Dark mode toggle for better accessibility.

#### Backend API
- RESTful API for inventory CRUD operations.
- Input validation for API requests.
- Rate limiting to prevent abuse.
- Logging for API requests and errors.

### Additional Features
- Export functionality: Export inventory data as a CSV file.
- Low stock alerts: Highlight items with low quantity (e.g., less than 5).
- Activity log: Track changes to inventory items (e.g., who updated an item and when).

<<<<<<< HEAD
## Tech Stack
=======
## Enhanced Features

The application includes several advanced features:

1. **Data Export**: Export inventory data to CSV or JSON formats
2. **Low Stock Notifications**: Automatic alerts when items fall below minimum stock level
3. **Barcode Scanning**: Scan product barcodes to quickly locate inventory items

## Required Dependencies

### Client Dependencies
```bash
# Core Dependencies
npm install react react-dom react-router-dom

# UI Components
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select
npm install tailwind-merge clsx lucide-react
npm install react-toastify

# Optional Dependencies for Barcode Scanning (Production)
npm install quagga zxing-js-library

# Development Dependencies
npm install -D tailwindcss postcss autoprefixer
```

### Server Dependencies
```bash
npm install express cors prisma jsonwebtoken bcrypt dotenv winston express-rate-limit
npm install -D nodemon
```

## Deployment

The application is deployed on [Render](https://render.com) with the following configuration:

- Client: Static site with SPA routing
- Server: Node.js web service with PostgreSQL database

---
>>>>>>> 637c7c1 (bud fix)

### Frontend
- React.js (Vite)
- Tailwind CSS for styling
- Axios for API calls
- React Router for navigation
- React Toastify for notifications

### Backend
- Node.js with Express.js
- Prisma as the ORM
- NeonDB (PostgreSQL) as the database
- JWT for authentication
- Winston for logging
- Express Validator for input validation

## Setup

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database (NeonDB recommended)
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/inventory-management-system.git
   cd inventory-management-system
   ```

2. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Backend:**
   ```bash
   cd backend
   npm install
   npm start
   ```

### Setup

- Create a `.env` file in the backend directory and add your database connection string:
  ```bash
  DATABASE_URL="postgresql://user:password@host:port/database"
  ```

- Run Prisma migrations:
  ```bash
  npx prisma migrate dev --name init
  ```

## Usage

### Login:
- Use the hardcoded credentials to log in.

### Manage Inventory:
- Use the dashboard to view, add, edit, or delete inventory items.
- Search and filter items using the provided options.

### Export Data:
- Export inventory data as a CSV file using the export button.

### Logout:
- Use the logout button to securely end your session.

## API Endpoints

### Authentication
- **POST /api/auth/login**: Authenticate and receive a JWT token.
- **POST /api/auth/logout**: Clear the JWT token (client-side).

### Inventory Management
- **GET /api/inventory**: Fetch all inventory items (supports search and filtering).
- **GET /api/inventory/:id**: Fetch a single inventory item by ID.
- **POST /api/inventory**: Add a new inventory item.
- **PUT /api/inventory/:id**: Update an existing inventory item.
- **DELETE /api/inventory/:id**: Delete an inventory item.

### Additional Endpoints
- **GET /api/inventory/export**: Export inventory data as a CSV file.
- **GET /api/activity-log**: Fetch activity log for inventory changes.

## Environment Variables

### Backend
- `DATABASE_URL`: PostgreSQL database connection string.
- `JWT_SECRET`: Secret key for JWT token generation.
- `PORT`: Port for the backend server (default: 5000).

### Frontend
- `VITE_API_BASE_URL`: Base URL for the backend API (default: `http://localhost:5000`).

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Commit your changes.
4. Submit a pull request.


## Acknowledgments

- Thanks to the open-source community for providing the tools and libraries used in this project.

## Contact

- You can reach CICR for collab, sponser or anything via contact@cicr.in

# **Inventory Management System**  

This is a **simple yet robust inventory management system** built for CICR. It allows authorized users to manage inventory items with features like CRUD operations, search, filtering, and more. The system is built using a modern tech stack and is designed to be modular, maintainable, and scalable.

---

## **Features**  

### **Core Features**  
1. **Authentication**  
   - Hardcoded user credentials (no signup or user creation).  
   - JWT-based authentication for secure session management.  
   - Logout functionality to clear the JWT token.  

2. **Inventory Management**  
   - Add, edit, view, and delete inventory items.  
   - Inventory item fields:  
     - `id` (UUID)  
     - `name` (string)  
     - `category` (string)  
     - `quantity` (integer)  
     - `location` (string)  
     - `status` (`Available` / `Issued`)  
     - `lastUpdated` (timestamp)  
   - Search and filter items by name, category, or status.  

3. **Access Control**  
   - Only logged-in users can access the system.  
   - Role-based access control (RBAC) for future scalability (e.g., `Admin` and `Viewer` roles).  

4. **Frontend UI**  
   - Login page for authentication.  
   - Dashboard with a table displaying inventory items (sorting and pagination supported).  
   - Form for adding/editing inventory items with validation.  
   - Toast notifications for success/error feedback.  
   - Responsive design for mobile and desktop compatibility.  
   - Dark mode toggle for better accessibility.  

5. **Backend API**  
   - RESTful API for inventory CRUD operations.  
   - Input validation for API requests.  
   - Rate limiting to prevent abuse.  
   - Logging for API requests and errors.  

### **Additional Features**  
- **Export functionality:** Export inventory data as a CSV file.  
- **Low stock alerts:** Highlight items with low quantity (e.g., less than 5).  
- **Activity log:** Track changes to inventory items (e.g., who updated an item and when).  

---

## **Tech Stack**  

### **Frontend**  
- **React.js** (Vite)  
- **Tailwind CSS** for styling  
- **Axios** for API calls  
- **React Router** for navigation  
- **React Toastify** for notifications  

### **Backend**  

- **Node.js** with **Express.js**  
- **Prisma** as the ORM  
- **NeonDB** (PostgreSQL) as the database  
- **JWT** for authentication  
- **Winston** for logging  
- **Express Validator** for input validation  

---

## **Setup Instructions**  

### **Prerequisites**  
- Node.js (v18 or higher)  
- PostgreSQL (or NeonDB for cloud-based PostgreSQL)  
- Git  

### **Steps to Run the Project**  

1. **Clone the Repository**  
   ```bash
   git clone https://github.com/your-username/inventory-management-system.git
   cd inventory-management-system

  

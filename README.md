# Jellystat

A comprehensive statistics and monitoring application for Jellyfin media servers. This application provides detailed analytics, user activity monitoring, and library statistics through a modern web interface.

## Features

- **Session Monitoring and Logging**
  - Real-time playback activity tracking
  - Detailed session information including client devices and streaming quality
  - Historical playback data retention

- **Library Analytics**
  - Comprehensive statistics for all media libraries
  - Content growth tracking
  - Storage usage analytics
  - Recently added items monitoring

- **User Analytics**
  - Detailed user activity tracking
  - Watch history and patterns
  - Popular content by user
  - Device usage statistics

- **Advanced Statistics**
  - Watch time patterns (daily/weekly/monthly)
  - Popular viewing times
  - Most watched content
  - Streaming quality analysis

- **System Integration**
  - Seamless Jellyfin API integration
  - Jellyfin Statistics Plugin support
  - Multi-server support (in development)
  - Automated library synchronization

- **Data Management**
  - Automated backup system
  - Data restoration capabilities
  - Database optimization
  - Configurable retention policies

## Getting Started

### Method 1: Docker (Recommended)

1. Install Docker and Docker Compose on your system
2. Create a new directory for your Jellystat installation:
   ```bash
   mkdir jellystat
   cd jellystat
   ```

3. Create a docker-compose.yml file with the following content:
   ```
   version: '3'
   
   services:
     jellystat-db:
       image: postgres:15.2
       container_name: jellystat-db
       restart: unless-stopped
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: your_secure_password
       volumes:
         - postgres-data:/var/lib/postgresql/data
   
     jellystat:
       image: cyfershepard/jellystat:latest
       container_name: jellystat
       restart: unless-stopped
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: your_secure_password
         POSTGRES_IP: jellystat-db
         POSTGRES_PORT: 5432
         JWT_SECRET: your_secure_jwt_key
         TZ: Your/Timezone
       volumes:
         - jellystat-backup-data:/app/backend/backup-data
       ports:
         - "3000:3000"
       depends_on:
         - jellystat-db
   
   networks:
     default:
   
   volumes:
     postgres-data:
     jellystat-backup-data:
   ```

   Note: Make sure to replace:
   - `your_secure_password` with a strong password
   - `your_secure_jwt_key` with a random string for JWT encryption
   - `Your/Timezone` with your timezone (e.g., `America/New_York`, `Europe/London`)

4. Start the application:
   ```bash
   docker-compose up -d
   ```

5. Access Jellystat at http://localhost:3000

6. Complete the initial setup:
   - Enter your Jellyfin server URL (e.g., http://your-jellyfin-ip:8096)
   - Enter your Jellyfin API key (found in Jellyfin Dashboard → Admin → API Keys)
   - Create your Jellystat admin account

### Method 2: Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/CyferShepard/Jellystat.git
   cd Jellystat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create and configure environment variables:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit the .env file with your settings:
   ```
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=your_password
   POSTGRES_IP=localhost
   POSTGRES_PORT=5432
   JWT_SECRET=your_jwt_secret
   ```

4. Start PostgreSQL (if not using Docker):
   - Install PostgreSQL on your system
   - Create a database named 'jfstat'
   - Ensure PostgreSQL is running on port 5432

5. Start the development servers:
   ```bash
   npm run start-dev
   ```

6. Access Jellystat at http://localhost:3001 (development port)

### Troubleshooting

1. Database Connection Issues:
   - Verify PostgreSQL is running
   - Check database credentials in environment variables
   - Ensure database port is accessible

2. Jellyfin Connection Issues:
   - Verify Jellyfin server URL is correct
   - Ensure API key has proper permissions
   - Check network connectivity between Jellystat and Jellyfin

3. Permission Issues:
   - Ensure proper write permissions for volume directories
   - Check PostgreSQL user permissions
   - Verify JWT_SECRET is properly set

For additional help, check the logs:
```bash
# Docker logs
docker logs jellystat
docker logs jellystat-db

# Development logs
npm run start-server
```

## Architecture

### Backend Stack
- **Node.js Express Server**
  - RESTful API endpoints
  - WebSocket real-time updates
  - JWT authentication
  - API key support for automation

- **PostgreSQL Database**
  - Optimized schema for media server data
  - Efficient query performance
  - Automated migrations
  - Data integrity constraints

- **Modular Design**
  - Separate service layers
  - Clean architecture principles
  - Dependency injection
  - Extensible plugin system

### Frontend Stack
- **React Application**
  - Modern component architecture
  - Material-UI components
  - Responsive design
  - Real-time updates via WebSocket

### Docker Infrastructure
- **Multi-Container Setup**
  - Application container
  - PostgreSQL database container
  - Network isolation
  - Volume management
  - Jellyfin/Jellyseerr integration

## Docker Deployment

### Integration with Jellyfin & Jellyseerr
For optimal integration with Jellyfin and Jellyseerr, use the following network configuration in your docker-compose.yml:

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    network_mode: host
    volumes:
      - /path/to/config:/config
      - /path/to/cache:/cache
      - /path/to/media:/media
    restart: unless-stopped

  jellyseerr:
    image: fallenbagel/jellyseerr:latest
    container_name: jellyseerr
    ports:
      - "5055:5055"
    volumes:
      - /path/to/jellyseerr/config:/app/config
    restart: unless-stopped
    depends_on:
      - jellyfin

  jellystat-db:
    # ... (as shown below)

  jellystat:
    # ... (as shown below)
    depends_on:
      - jellystat-db
      - jellyfin
```

This setup ensures seamless communication between all services while maintaining proper isolation and dependencies.

### Prerequisites
- Docker and Docker Compose installed
- Jellyfin server accessible from the Docker host
- Jellyseerr (optional for integration)

### Quick Start
1. Create a docker-compose.yml:
\`\`\`yaml
version: '3'

services:
  jellystat-db:
    image: postgres:15.2
    container_name: jellystat-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
    volumes:
      - postgres-data:/var/lib/postgresql/data

  jellystat:
    image: cyfershepard/jellystat:latest
    container_name: jellystat
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_IP: jellystat-db
      POSTGRES_PORT: 5432
      JWT_SECRET: your_secure_jwt_key
      TZ: Your/Timezone
    volumes:
      - jellystat-backup-data:/app/backend/backup-data
    ports:
      - "3000:3000"
    depends_on:
      - jellystat-db

networks:
  default:

volumes:
  postgres-data:
  jellystat-backup-data:
\`\`\`

2. Start the containers:
\`\`\`bash
docker-compose up -d
\`\`\`

3. Access Jellystat at http://localhost:3000

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| POSTGRES_USER | Yes | null | PostgreSQL username |
| POSTGRES_PASSWORD | Yes | null | PostgreSQL password |
| POSTGRES_IP | Yes | null | PostgreSQL host |
| POSTGRES_PORT | Yes | null | PostgreSQL port |
| JWT_SECRET | Yes | null | JWT encryption key |
| JS_BASE_URL | No | / | Base URL path |
| JS_USER | No | null | Override admin username |
| JS_PASSWORD | No | null | Override admin password |
| POSTGRES_DB | No | jfstat | Database name |
| REJECT_SELF_SIGNED_CERTIFICATES | No | true | SSL certificate validation |

## LLM Recreation Instructions

### Project Structure
\`\`\`
jellystat/
├── backend/
│   ├── classes/           # Core functionality classes
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── tasks/            # Background tasks
│   └── migrations/       # Database migrations
├── src/
│   ├── components/       # React components
│   ├── pages/           # Page components
│   └── lib/             # Utility functions
└── docker/              # Docker configuration
\`\`\`

### Implementation Steps

1. **Setup Base Infrastructure**
   - Create Docker network for service communication
   - Configure PostgreSQL container with proper volumes
   - Setup Node.js application container
   - Implement health checks and container dependencies

2. **Database Layer**
   - Implement database models (< 300 lines each):
     - UserModel: User management and authentication
     - LibraryModel: Media library information
     - ActivityModel: Playback and user activity
     - StatisticsModel: Aggregated statistics
     - ConfigModel: Application configuration

3. **Backend Services**
   - Create modular services (< 300 lines each):
     - JellyfinService: Jellyfin API integration
     - AuthService: Authentication and authorization
     - StatisticsService: Data aggregation and analysis
     - WebSocketService: Real-time updates
     - BackupService: Data backup and restoration

4. **API Layer**
   - Implement RESTful endpoints (< 300 lines per file):
     - AuthController: User authentication
     - LibraryController: Library management
     - StatisticsController: Statistics retrieval
     - ActivityController: Activity monitoring
     - ConfigController: System configuration

5. **Frontend Components**
   - Develop React components (< 300 lines each):
     - Dashboard: Main statistics overview
     - LibraryView: Library management interface
     - UserActivity: User statistics and history
     - Settings: System configuration interface
     - Charts: Statistical visualizations

### Integration Guidelines

1. **Jellyfin Integration**
   - Implement Jellyfin API client with rate limiting
   - Setup periodic library synchronization
   - Configure real-time activity monitoring
   - Handle media metadata caching

2. **Jellyseerr Integration**
   - Share authentication mechanism
   - Implement consistent styling
   - Setup cross-service navigation
   - Configure request tracking

3. **Security Considerations**
   - Implement JWT authentication
   - Setup API key management
   - Configure CORS policies
   - Implement rate limiting

4. **Performance Optimization**
   - Configure database indexing
   - Implement query caching
   - Setup connection pooling
   - Configure static asset caching

## Development Setup

1. Clone the repository:
\`\`\`bash
git clone https://github.com/yourusername/jellystat.git
cd jellystat
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Configure environment variables:
\`\`\`bash
cp backend/.env.example backend/.env
# Edit .env with your settings
\`\`\`

4. Start development servers:
\`\`\`bash
npm run start-dev
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

- Submit issues via [GitHub Issues](https://github.com/CyferShepard/Jellystat/issues)
- Join the [Discord community](https://discord.gg/9SMBj2RyEe)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

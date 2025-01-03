# Jellystat (Enhanced Deletion Features Fork)

This is a fork of [CyferShepard's Jellystat](https://github.com/CyferShepard/Jellystat) with enhanced media management capabilities, particularly focused on automated deletion features. This version adds comprehensive media cleanup tools while maintaining all the original statistics and monitoring capabilities.

## What's New in this Fork?

- **Advanced Media Deletion System**
  - Rule-based cleanup with preview capabilities
  - Show/Episode level management
  - Integration with Sonarr/Radarr/Jellyseerr
  - Discord notifications for deletions
  - Dry-run testing before actual deletion
  - API connection testing for all services

- **Enhanced External Service Integration**
  - Direct Sonarr/Radarr cleanup
  - Jellyseerr request management
  - Discord webhook notifications
  - Connection testing tools

## Core Features

### Analytics & Monitoring
- **Session Monitoring**
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

### Media Management

- **Automated Deletion System**
  - Rule-based media cleanup
  - Configurable deletion thresholds
  - Per-library rules
  - Show/Episode level management
  - Preview and dry-run capabilities
  - Discord notifications for deletions
  - Integration with Sonarr/Radarr/Jellyseerr

- **Deletion Rules Management**
  - Create rules per library
  - Set watch-time thresholds
  - Configure warning periods
  - Preview affected items
  - Test rules before applying
  - View deletion history

### System Integration

- **Jellyfin Integration**
  - Seamless API integration
  - Statistics Plugin support
  - Library synchronization
  - Media metadata tracking

- **External Services**
  - Sonarr integration for TV shows
  - Radarr integration for movies
  - Jellyseerr request management
  - Discord notifications
  - API connection testing

### Data Management
- **Backup System**
  - Automated backups
  - Data restoration
  - Database optimization
  - Configurable retention

## Getting Started

### Docker Deployment (Recommended)

This fork has its own Docker image. To use it:

1. Create a docker-compose.yml:
```yaml
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
    image: willehnz/jellystat:latest
    container_name: jellystat
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_IP: jellystat-db
      POSTGRES_PORT: 5432
      JWT_SECRET: your_secure_jwt_key
      TZ: Your/Timezone
      # Optional: Add these for deletion features
      SONARR_API_KEY: your_sonarr_key
      RADARR_API_KEY: your_radarr_key
      JELLYSEERR_API_KEY: your_jellyseerr_key
      DISCORD_WEBHOOK_URL: your_discord_webhook
    volumes:
      - jellystat-backup-data:/app/backend/backup-data
    ports:
      - "3000:3000"
    depends_on:
      - jellystat-db

volumes:
  postgres-data:
  jellystat-backup-data:
```

2. Start the containers:
```bash
docker-compose up -d
```

3. Access Jellystat at http://localhost:3000

### Initial Setup

1. Configure External Services:
   - Add Jellyfin server URL and API key
   - (Optional) Configure Sonarr/Radarr for deletion integration
   - (Optional) Set up Discord webhook for notifications
   - Test connections using the built-in test tools

2. Configure Libraries:
   - Select libraries to monitor
   - Set up deletion rules if desired
   - Configure warning thresholds

3. Start Monitoring:
   - View real-time statistics
   - Monitor user activity
   - Track library growth

## Deletion Rules Guide

### Creating Rules

1. Navigate to Deletion Rules
2. Click "Add Rule"
3. Configure:
   - Library selection
   - Media type (movie/show/episode)
   - Days since last watched
   - Warning period

### Testing Rules

1. Use Preview:
   - Click preview icon on any rule
   - View affected items
   - See warning schedule
   - Check protected content

2. Dry Run:
   - Test rule execution
   - View potential deletions
   - Verify notifications
   - No actual changes made

### Applying Rules

1. Review Preview Results
2. Confirm Settings
3. Enable Rule
4. Monitor Deletion History

## Environment Variables

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

### External Service Variables (Optional)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SONARR_API_KEY | No | null | Sonarr API key for TV show deletion |
| RADARR_API_KEY | No | null | Radarr API key for movie deletion |
| JELLYSEERR_API_KEY | No | null | Jellyseerr API key for request cleanup |
| DISCORD_WEBHOOK_URL | No | null | Discord webhook for deletion notifications |
| SONARR_URL | No | null | Sonarr server URL (e.g., http://sonarr:8989) |
| RADARR_URL | No | null | Radarr server URL (e.g., http://radarr:7878) |
| JELLYSEERR_URL | No | null | Jellyseerr server URL (e.g., http://jellyseerr:5055) |

## Development Setup

1. Clone this fork:
```bash
git clone https://github.com/Willehnz/Jellystat.git
cd Jellystat
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp backend/.env.example backend/.env
# Edit .env with your settings
```

4. Start development servers:
```bash
npm run start-dev
```

## Upgrading from Original Jellystat

### Docker Installation

1. Switch to this fork's image:
```bash
# Stop existing containers
docker-compose down

# Update docker-compose.yml to use willehnz/jellystat:latest

# Pull and start new image
docker pull willehnz/jellystat:latest
docker-compose up -d
```

### Manual Installation

1. Stop Jellystat:
```bash
npm run stop
```

2. Switch to this fork:
```bash
# Backup your data first!
git remote add fork https://github.com/Willehnz/Jellystat.git
git fetch fork
git checkout fork/main
```

3. Install new dependencies:
```bash
npm install
```

4. Update your .env file with new variables if needed:
```bash
# Optional: Add these for deletion features
SONARR_API_KEY=your_sonarr_key
RADARR_API_KEY=your_radarr_key
JELLYSEERR_API_KEY=your_jellyseerr_key
DISCORD_WEBHOOK_URL=your_discord_webhook
```

5. Start Jellystat:
```bash
npm run start
```

### After Upgrading

1. Access the new Deletion Rules section in the sidebar
2. Configure external services in Settings if using deletion features
3. Test API connections using the built-in test tools
4. Create and test deletion rules using the preview feature

### Troubleshooting Upgrade

If you encounter issues after upgrading:

1. Check the logs:
```bash
# Docker
docker logs jellystat

# Manual
npm run start-server
```

2. Verify database migrations:
   - Check if new tables exist (jf_deletion_rules, jf_deletion_history)
   - Restart the application if migrations didn't run

3. Clear browser cache and reload the application

4. If problems persist:
   - Back up your database
   - Remove containers and volumes
   - Perform a fresh installation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

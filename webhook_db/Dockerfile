FROM postgres:15-alpine

# Add init SQL
COPY init.sql /docker-entrypoint-initdb.d/00-init.sql

# Set default PG envs (can be overridden at runtime)
ENV POSTGRES_DB=webhook_db
ENV POSTGRES_USER=webhook
ENV POSTGRES_PASSWORD=webhook

EXPOSE 5432

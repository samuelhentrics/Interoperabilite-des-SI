FROM postgres:16

ENV POSTGRES_USER=devuser
ENV POSTGRES_PASSWORD=devpass
ENV POSTGRES_DB=db_devmaterial

COPY init.sql /docker-entrypoint-initdb.d/

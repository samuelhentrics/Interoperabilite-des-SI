FROM postgres:16

ENV POSTGRES_USER=devuser
ENV POSTGRES_PASSWORD=wagonpass
ENV POSTGRES_DB=db_wagonlits

COPY init.sql /docker-entrypoint-initdb.d/

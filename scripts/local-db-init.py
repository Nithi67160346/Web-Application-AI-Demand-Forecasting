"""Create only the dedicated local database; never modify other databases."""
import sys
import psycopg

with psycopg.connect(host='127.0.0.1', port=int(sys.argv[1]), user='postgres', dbname='postgres', autocommit=True) as connection:
    if not connection.execute("SELECT 1 FROM pg_database WHERE datname='demandly_local'").fetchone():
        connection.execute('CREATE DATABASE demandly_local')

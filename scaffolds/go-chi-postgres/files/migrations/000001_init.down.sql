-- Rollback initial schema

DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
DROP FUNCTION IF EXISTS update_updated_at();

DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS "uuid-ossp";

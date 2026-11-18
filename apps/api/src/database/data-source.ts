import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseSsl, databaseUrl } from '../config/database-url';

/** TypeORM CLI data source (migrations). App runtime uses TypeOrmModule.forRootAsync in app.module.ts. */
export default new DataSource({
  type: 'postgres',
  url: databaseUrl(process.env),
  ssl: databaseSsl(process.env.DB_SSL_CA_PATH || undefined),
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'typeorm_migrations',
});

#!/usr/bin/env node
/**
 * Writes the demo data (demo/data.mjs) as an SQL file for a DEMO database (see demo/README.md):
 *
 *   node demo/seed.mjs > /tmp/demo-seed.sql
 *
 * The demo worker resets the same data every night by itself (cron, `resetDemo` in src/worker.js). Node 20+.
 */
import { seedSql } from "./data.mjs";

const { sql, stats } = seedSql();
process.stdout.write(sql);
process.stderr.write(`demo seed: ${stats}\n`);

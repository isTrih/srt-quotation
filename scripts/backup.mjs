import { backup } from './backup-lib.mjs';
backup(process.env.DATA_DIR||'data',process.argv[2]);

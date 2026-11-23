import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev:sidecar'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true }),
];

const shutdown = () => {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

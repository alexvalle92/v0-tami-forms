import { execSync } from 'child_process';

try {
  console.log('Generating package-lock.json...');
  execSync('npm install --package-lock-only --legacy-peer-deps', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('package-lock.json generated successfully!');
} catch (error) {
  console.error('Error generating package-lock.json:', error.message);
  process.exit(1);
}

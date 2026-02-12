import { execSync } from 'child_process';

// Generate package-lock.json from package.json
try {
  console.log('Generating package-lock.json...');
  execSync('npm install --package-lock-only --legacy-peer-deps', { 
    stdio: 'inherit',
    cwd: process.cwd() 
  });
  console.log('package-lock.json generated successfully!');
} catch (error) {
  console.error('Failed to generate package-lock.json:', error.message);
  process.exit(1);
}

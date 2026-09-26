import { pathToFileURL } from 'node:url';

/** Native Hello behavior. The ASP integration is opt-in and separate. */
export function greet() {
  return 'Hello, world!';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${greet()}\n`);
}

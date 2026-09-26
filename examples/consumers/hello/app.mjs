/** Native Hello behavior. The ASP integration is opt-in and separate. */
export function greet() {
  return 'Hello, world!';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${greet()}\n`);
}

import { createClient, type Client } from "@libsql/client";

// Lazy singleton: constructing the client eagerly at module scope would throw
// (and take down the whole process) whenever the Turso env vars are
// missing/invalid. Deferring construction confines that failure to the
// individual request that actually touches the database.
let client: Client | undefined;

function getClient(): Client {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export const db: Client = new Proxy({} as Client, {
  // Bind methods to the real client instance (not the receiver/proxy) --
  // @libsql/client's methods read private #fields internally, which throws
  // if `this` ends up being this Proxy instead of the actual client.
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

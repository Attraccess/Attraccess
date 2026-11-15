import type Redis from 'ioredis';

type RedisCommand = Parameters<Redis['sendCommand']>[0];

const redactingCommands = new WeakSet<RedisCommand>();

/**
 * Strips `command` from every error a command of this client rejects with. When Valkey rejects the password, ioredis
 * rejects each queued command with the AUTH error, whose `command.args` holds the password; without this, any caller
 * or exception filter that logs the error prints it. Other command errors lose `command` as well, since its args can
 * hold session data. Clients made with `duplicate()` are redacted too.
 */
export function redactValkeyCommandErrors(client: Redis): Redis {
  const sendCommand = client.sendCommand.bind(client);
  client.sendCommand = (command, ...rest) => {
    // ioredis sends a command again after a reconnect; wrap its reject only once.
    if (!redactingCommands.has(command)) {
      redactingCommands.add(command);
      const reject = command.reject;
      command.reject = (error: Error & { command?: unknown }) => {
        delete error?.command;
        reject(error);
      };
    }
    return sendCommand(command, ...rest);
  };

  const duplicate = client.duplicate.bind(client);
  client.duplicate = (...args) => redactValkeyCommandErrors(duplicate(...args));

  return client;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function mqttFilterToRegex(filter: string): string {
  const terminalMultiLevel = filter.endsWith('/#');
  const prefix = terminalMultiLevel ? filter.slice(0, -2) : filter;
  const translated = prefix
    .split('/')
    .map((segment) => {
      if (segment === '+') {
        // Dot-bearing MQTT levels are rejected above because RabbitMQ cannot
        // distinguish them from additional slash-separated levels here.
        return '[^.]+';
      }
      if (segment === '#') {
        return '.*';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('\\.');
  return terminalMultiLevel ? `${translated}(?:\\..*)?` : translated;
}

// RabbitMQ topic permissions evaluate AMQP routing keys, where rabbitmq_mqtt
// maps MQTT's / topic levels to dots. Escape literal segments and translate
// MQTT's + and # wildcards without widening a level boundary.
export function mqttFiltersToRegex(filters: readonly string[]): string {
  if (filters.length === 0) {
    return '$(?!)';
  }
  return `^(?:${filters.map(mqttFilterToRegex).join('|')})$`;
}

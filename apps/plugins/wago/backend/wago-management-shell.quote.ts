export const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

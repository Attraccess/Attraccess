export const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

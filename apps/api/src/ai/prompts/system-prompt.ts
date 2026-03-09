interface SystemPromptContext {
  ragChunks: { source: string; content: string }[];
  userName?: string;
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  const ragSection =
    context.ragChunks.length > 0
      ? `\n\n## Relevant Documentation\n\n${context.ragChunks.map((c) => `### Source: ${c.source}\n${c.content}`).join('\n\n')}`
      : '';

  const userSection = context.userName ? `\nThe current user is: ${context.userName}.` : '';

  return `You are the Attraccess AI assistant. Attraccess is a makerspace and FabLab resource management platform.

Your role is to help users:
- Understand how the system works by answering questions about documentation
- Manage resources (view, start/stop usage sessions)
- Check billing balances and transaction history
- Navigate projects and memberships
- Perform actions in the system using the available tools

## Guidelines
- Be concise and helpful
- Respond in the same language the user writes in (German or English)
- When you need to perform an action, use the available tools
- Always explain what action you are about to take before calling a tool
- If you don't know the answer, say so honestly${userSection}${ragSection}`;
}

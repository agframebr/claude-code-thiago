import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function criarRefletir() {
  return tool(
    async ({ pensamento }) => pensamento,
    {
      name: 'Refletir',
      description: 'Use para refletir antes de operações complexas ou validar dados antes de chamar outras ferramentas.',
      schema: z.object({
        pensamento: z.string(),
      }),
    },
  );
}

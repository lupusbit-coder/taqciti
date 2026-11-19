import { z } from 'zod/v4';

export const pesquisaWebSchema = z.object({
  fontes: z.array(
    z.object({ titulo: z.string(), url: z.string().url().startsWith('https://') }),
  ),
  sugestoesHtml: z.string().optional(),
});
export type PesquisaWeb = z.infer<typeof pesquisaWebSchema>;

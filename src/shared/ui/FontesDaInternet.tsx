import { pesquisaWebSchema, type PesquisaWeb } from '@/features/taq/pesquisaWeb';

/** O HTML do provedor fica isolado, sem scripts, storage ou acesso à extensão. */
export function FontesDaInternet({ pesquisas }: { pesquisas: PesquisaWeb[] }) {
  return (
    <section className="tq-resp-web" aria-label="Pesquisa na internet">
      <h3>Fontes da internet</h3>
      {pesquisas.map((bruto, i) => {
        const lido = pesquisaWebSchema.safeParse(bruto);
        if (!lido.success) return null;
        const pesquisa = lido.data;
        return (
          <div key={i}>
            <ul>
              {pesquisa.fontes.map((fonte, j) => (
                <li key={j}>
                  <a href={fonte.url} target="_blank" rel="noopener noreferrer">
                    {fonte.titulo}
                  </a>
                </li>
              ))}
            </ul>
            {pesquisa.sugestoesHtml && (
              <iframe
                title={`Sugestões de pesquisa do Google ${i + 1}`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                srcDoc={
                  '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src https://www.gstatic.com data:; base-uri &#39;none&#39;; form-action &#39;none&#39;">' +
                  pesquisa.sugestoesHtml
                }
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

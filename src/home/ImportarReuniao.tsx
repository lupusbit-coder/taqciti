/** Importação explícita: texto é lido localmente; mídia só é enviada no clique de importar. */
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { usePlatform } from '@/shared/platform/context';
import { SERVER_BASE_URL } from '@/shared/config/serverConfig';
import { fetchDeIa } from '@/shared/services/identidade';
import { listHistory } from '@/background/history';
import { importacaoSchema, lerTranscricao, segmentoImportadoSchema } from '@/features/importacao/transcricao';

const MIDIA = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac', 'mpeg', 'mpga'];
export function ImportarReuniao({ onAbrir }: { onAbrir: (id: string) => void }) {
  const platform = usePlatform();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const controle = useRef<AbortController | null>(null);
  useEffect(() => () => controle.current?.abort(), []);
  const formato = arquivo?.name.split('.').pop()?.toLowerCase() ?? '';
  async function importar() {
    if (!arquivo || ocupado) return;
    const ctrl = new AbortController(); controle.current = ctrl;
    setOcupado(true); setErro(''); setMensagem('Lendo arquivo…');
    try {
      const midia = MIDIA.includes(formato);
      if (!midia && !['txt', 'srt', 'vtt'].includes(formato)) throw new Error('Use TXT, SRT, VTT ou um dos formatos de mídia indicados.');
      if (!arquivo.size || arquivo.size > (midia ? 4000000 : 1000000)) throw new Error(midia ? 'O limite para áudio e vídeo é 4 MB.' : 'O limite para arquivos de texto é 1 MB.');
      const bytes = await arquivo.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('');
      if (ctrl.signal.aborted) return;
      const existente = (await listHistory()).find((r) => r.importacao?.hash === hash);
      if (existente) { onAbrir(existente.id); return; }
      let segmentos: z.infer<typeof segmentoImportadoSchema>[];
      if (midia) {
        setMensagem('Transcrevendo áudio…');
        const resposta = await fetchDeIa(`${SERVER_BASE_URL}/api/importacao/transcrever?formato=${formato}`, {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(60000)]),
        });
        if (!resposta.ok) throw new Error(resposta.status === 503
          ? 'A transcrição de mídia ainda não está configurada no servidor. Você pode importar uma transcrição em texto.'
          : resposta.status === 401 || resposta.status === 403 ? 'Entre na sua conta para transcrever o arquivo.'
          : resposta.status === 413 ? 'O arquivo excede o limite do servidor.' : 'Não foi possível transcrever. Confira o arquivo e tente novamente.');
        segmentos = z.object({ segmentos: z.array(segmentoImportadoSchema).min(1).max(10000) }).parse(await resposta.json()).segmentos;
      } else {
        segmentos = lerTranscricao(new TextDecoder('utf-8', { fatal: true }).decode(bytes), formato as 'txt' | 'srt' | 'vtt');
      }
      if (ctrl.signal.aborted) return;
      const dados = importacaoSchema.parse({ titulo, iniciadaEm: new Date(data).getTime(), nome: arquivo.name,
        hash, formato: midia ? 'midia' : formato, segmentos });
      setMensagem('Salvando no histórico…');
      const resposta = await platform.send({ type: 'ui/history/import', dados }) as { ok?: boolean; id?: string };
      if (!resposta?.ok || !resposta.id) throw new Error('Não foi possível salvar a importação. Tente novamente.');
      onAbrir(resposta.id);
    } catch (e) {
      if (!ctrl.signal.aborted) setErro(e instanceof z.ZodError ? 'Confira o título, a data e o conteúdo da transcrição.' : e instanceof Error ? e.message : 'Não foi possível importar.');
    } finally { setOcupado(false); setMensagem(''); controle.current = null; }
  }
  return <details className="tq-opcoes-acervo">
    <summary>Importar reunião</summary>
    <form onSubmit={(e) => { e.preventDefault(); void importar(); }}>
      <p>Texto: TXT, SRT ou VTT em UTF-8, até 1 MB e 200 mil caracteres. Áudio e vídeo: MP3, MP4, M4A, WAV, WEBM, OGG, FLAC, MPEG ou MPGA, até 4 MB.</p>
      <label>Arquivo<input type="file" required disabled={ocupado} accept=".txt,.srt,.vtt,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac,.mpeg,.mpga" onChange={(e) => {
        const f = e.target.files?.[0] ?? null; setArquivo(f); setTitulo(f?.name.replace(/\.[^.]+$/, '').slice(0, 200) ?? ''); setErro('');
      }} /></label>
      <label>Nome da reunião<input value={titulo} required maxLength={200} disabled={ocupado} onChange={(e) => setTitulo(e.target.value)} /></label>
      <label>Data e hora da reunião<input type="datetime-local" required value={data} disabled={ocupado} onChange={(e) => setData(e.target.value)} /></label>
      <p>{MIDIA.includes(formato) ? 'O áudio será enviado ao serviço de transcrição do TaqCiti. Não identificamos os nomes dos falantes automaticamente.' : 'O texto é importado neste computador. As automações e a sincronização seguem suas preferências.'}</p>
      <button className="tq-acao" disabled={ocupado || !arquivo || !titulo.trim() || !data}>{ocupado ? 'Importando…' : 'Importar'}</button>
      {ocupado && <button type="button" className="tq-acao" disabled={mensagem === 'Salvando no histórico…'} onClick={() => controle.current?.abort()}>Cancelar</button>}
      {mensagem && <p role="status">{mensagem}</p>}
      {erro && <p role="alert">{erro}</p>}
    </form>
  </details>;
}

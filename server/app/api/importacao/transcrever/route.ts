/** Upload limitado antes da alocação integral; autenticação e cota precedem o provedor. */
import { NextResponse, type NextRequest } from 'next/server';
import { corsHeaders } from '@/lib/apiGuard';
import { autorizarIa } from '@/lib/guardaDeIa';
import { FORMATOS_DE_MIDIA, LIMITE_DE_MIDIA, transcreverMidia } from '@/lib/importacao/transcrever';

export const maxDuration = 60;
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));
  const auth = await autorizarIa(request, headers);
  if (!auth.ok) return auth.resposta;
  const formato = request.nextUrl.searchParams.get('formato') ?? '';
  if (!FORMATOS_DE_MIDIA.includes(formato)) return NextResponse.json({ erro: 'Formato de mídia não suportado.' }, { status: 400, headers });
  if (!process.env.GROQ_API_KEY?.trim() || process.env.DOCCITI_DATA_POLICY !== 'private')
    return NextResponse.json({ erro: 'A transcrição de áudio precisa de GROQ_API_KEY e política privada configuradas no servidor.' }, { status: 503, headers });
  if (Number(request.headers.get('content-length')) > LIMITE_DE_MIDIA)
    return NextResponse.json({ erro: 'O limite por arquivo é 4 MB.' }, { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ erro: 'Envie um arquivo.' }, { status: 400, headers });
  try {
    const partes: Uint8Array[] = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > LIMITE_DE_MIDIA) {
        await reader.cancel();
        return NextResponse.json({ erro: 'O limite por arquivo é 4 MB.' }, { status: 413, headers });
      }
      partes.push(value);
    }
    if (!total) return NextResponse.json({ erro: 'O arquivo está vazio.' }, { status: 400, headers });
    const bytes = new Uint8Array(total); let offset = 0;
    for (const parte of partes) { bytes.set(parte, offset); offset += parte.length; }
    const segmentos = await transcreverMidia(bytes, formato, request.signal);
    return NextResponse.json({ segmentos }, { headers });
  } catch {
    return NextResponse.json({ erro: 'Não foi possível transcrever. Confira se o arquivo contém áudio e tente novamente.' }, { status: 502, headers });
  } finally { reader.releaseLock(); }
}

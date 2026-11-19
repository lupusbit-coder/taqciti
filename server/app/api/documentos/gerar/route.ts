import { NextResponse, type NextRequest } from 'next/server';
import { corsHeaders, maxTranscriptChars } from '@/lib/apiGuard';
import { autorizarIa } from '@/lib/guardaDeIa';
import { activeDataPolicyWarning, recusaPorPoliticaDeDados } from '@/lib/ai';
import { gerarDocumentoPersonalizado } from '@/lib/documentos/gerar';
import {
  corpoDeGeracaoSchema,
  erroConhecido,
  lerCorpoComTeto,
  tetoDoCorpo,
  mensagemDeValidacao,
  serializarResultado,
  totalDeCaracteres,
} from '@/lib/documentos/requisicao';

/**
 * Documento personalizado a partir de um pedido em linguagem natural e das
 * fontes que a pessoa escolheu. Mesma tranca e mesmo CORS de `/api/generate`
 * (ver o comentário de lá). Sobre `maxDuration`, vale o que está dito lá: é o
 * teto da função na Vercel, o host de produção, e 300 é o máximo do plano Hobby.
 */
export const maxDuration = 300;

export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const headers = corsHeaders(request.headers.get('origin'));
  const autorizacao = await autorizarIa(request, headers);
  if (!autorizacao.ok) return autorizacao.resposta;

  // Teto do corpo ANTES do parse (S8): ver `tetoDoCorpo` em lib/documentos/requisicao.ts.
  const lido = await lerCorpoComTeto(request, tetoDoCorpo.gerar(maxTranscriptChars()));
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: lido.status, headers });
  const corpo = lido.corpo;

  const validado = corpoDeGeracaoSchema.safeParse(corpo);
  if (!validado.success) {
    return NextResponse.json({ error: mensagemDeValidacao(validado.error) }, { status: 400, headers });
  }
  const entrada = validado.data;

  const limite = maxTranscriptChars();
  const total = totalDeCaracteres(entrada.fontes);
  if (total > limite) {
    return NextResponse.json(
      {
        error:
          `As fontes somam ${total} caracteres e o limite é ${limite}. ` +
          'Selecione menos fontes ou um recorte menor.',
      },
      { status: 413, headers },
    );
  }

  const politica = recusaPorPoliticaDeDados(entrada.sintetica, activeDataPolicyWarning());
  if (politica) {
    const { status, ...corpo } = politica;
    return NextResponse.json(corpo, { status, headers });
  }

  try {
    const { sintetica: _sintetica, ...pedido } = entrada;
    const resultado = await gerarDocumentoPersonalizado(pedido);
    return NextResponse.json(serializarResultado(resultado), { status: 200, headers });
  } catch (erro) {
    const conhecido = erroConhecido(erro);
    if (conhecido) return NextResponse.json({ error: conhecido.error }, { status: conhecido.status, headers });
    console.error('[documentos/gerar]', erro);
    return NextResponse.json(
      { error: 'Não foi possível gerar o documento agora. Tente de novo em instantes.' },
      { status: 502, headers },
    );
  }
}

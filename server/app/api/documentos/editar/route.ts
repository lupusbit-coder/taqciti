import { NextResponse, type NextRequest } from 'next/server';
import { corsHeaders, maxTranscriptChars } from '@/lib/apiGuard';
import { autorizarIa } from '@/lib/guardaDeIa';
import { activeDataPolicyWarning, recusaPorPoliticaDeDados } from '@/lib/ai';
import { editarDocumentoPersonalizado } from '@/lib/documentos/gerar';
import {
  corpoDeEdicaoSchema,
  erroConhecido,
  lerCorpoComTeto,
  tetoDoCorpo,
  mensagemDeValidacao,
  serializarResultado,
  totalDeCaracteres,
} from '@/lib/documentos/requisicao';

/**
 * Alteração pontual de um documento personalizado, por patch de blocos sobre
 * a revisão que a pessoa estava vendo. Resposta 409 = a revisão mudou.
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
  const lido = await lerCorpoComTeto(request, tetoDoCorpo.editar(maxTranscriptChars()));
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: lido.status, headers });
  const corpo = lido.corpo;

  const validado = corpoDeEdicaoSchema.safeParse(corpo);
  if (!validado.success) {
    return NextResponse.json({ error: mensagemDeValidacao(validado.error) }, { status: 400, headers });
  }
  const entrada = validado.data;

  const limite = maxTranscriptChars();
  const total = totalDeCaracteres(entrada.fontes);
  if (total > limite) {
    return NextResponse.json(
      { error: `As fontes somam ${total} caracteres e o limite é ${limite}.` },
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
    const resultado = await editarDocumentoPersonalizado(pedido);
    return NextResponse.json(serializarResultado(resultado), { status: 200, headers });
  } catch (erro) {
    const conhecido = erroConhecido(erro);
    if (conhecido) return NextResponse.json({ error: conhecido.error }, { status: conhecido.status, headers });
    console.error('[documentos/editar]', erro);
    return NextResponse.json(
      { error: 'Não foi possível alterar o documento agora. Tente de novo em instantes.' },
      { status: 502, headers },
    );
  }
}

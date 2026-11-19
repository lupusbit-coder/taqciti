/**
 * @font-face dentro do Shadow DOM não registra a fonte no documento do Meet.
 * A cápsula recebe os bytes locais pelo bundle: não depende da rede, da CSP
 * de fontes da página ou de expor um arquivo novo no manifesto.
 * O alias é exclusivo do TaqCiti, sem mudar a fonte usada pelo Meet.
 */
import fonteLatin from '@/shared/fonts/dm-sans/dm-sans.woff2?inline';

let registrada = false;

export function registrarFonteDaCapsula(): void {
  if (registrada || typeof FontFace === 'undefined') return;
  registrada = true;
  const bytes = Uint8Array.from(atob(fonteLatin.split(',')[1]!), (c) => c.charCodeAt(0));
  const fonte = new FontFace('TaqCiti DM Sans', bytes, {
    weight: '100 1000',
    style: 'normal',
  });
  document.fonts.add(fonte);
  void fonte.load().catch(() => {
    // A fonte do sistema permanece legível se o navegador recusar a carga.
    document.fonts.delete(fonte);
    registrada = false;
  });
}

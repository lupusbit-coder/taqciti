import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { FontesDaInternet } from './FontesDaInternet';

it('mostra fontes e isola HTML externo sem scripts ou acesso à origem da extensão', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <FontesDaInternet
          pesquisas={[
            {
              fontes: [{ titulo: 'Fonte', url: 'https://example.org/' }],
              sugestoesHtml:
                '<script>alert(1)</script><a href="https://google.com">Google</a>',
            },
          ]}
        />,
      ),
    );
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.org/');
    expect(host.querySelector('script')).toBeNull();
    const frame = host.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).not.toMatch(
      /allow-scripts|allow-same-origin|allow-top-navigation/,
    );
    expect(frame.getAttribute('srcdoc')).toContain('default-src &#39;none&#39;');
    expect(frame.title).toContain('Google');
  } finally {
    act(() => root.unmount());
  }
});

# Gabarito — `review-cadastro-fornecedores.txt`

Fixture sintética (nomes e fatos inventados). Mede fidelidade num Review técnico
que vira Ata: o que foi dito como problema, como hipótese, como ação e como
decisão, sem que o modelo deduza causa, gravidade ou número.

## Decisões que a ata DEVE conter

1. Layout novo do cadastro (abas Dados, Endereço, Contato) aceito.
2. Busca automática de CEP mantida (funcionou nos quarenta CEPs testados).
3. Botão de exportar fica na versão um (decisão revertida: a primeira foi "versão dois", a última vale).

**Três.** Menos que isso é omissão; mais que isso é promover proposta ou hipótese a decisão.

## Armadilhas

### A. Decisão revertida — só a última vale
"Fechado, o exportar vai pra versão dois." → "não, espera… volta atrás: continua na versão um."
- ✅ exportar fica na versão um
- ❌ "exportar na versão dois"

### B. Proposta não aceita
Modo escuro: "Seria legal, mas fica pra depois, sem data."
- ✅ não é decisão, não é ação
- ❌ "Implementar modo escuro"

### C. Ordem aceita com dono e prazo
"Yasmin, você fica com a mensagem de erro do CNPJ? Até sexta." / "pode deixar".
- ✅ ação: mensagem de erro do CNPJ, responsável Yasmin, prazo sexta
- ❌ sem responsável ou com outro responsável

### D. Hipótese não vira causa
"Acho que é o cache da lista, mas não tive tempo de confirmar." → Otávio: "fica anotado como hipótese."
- ✅ o duplicado aparece como pendência de investigação (Helena), causa não confirmada
- ❌ "causa: cache da lista" como fato

### E. Gravidade não dita não se deduz
"Não sei, não defini." sobre o campo de telefone que some. Ninguém classificou.
- ✅ sem gravidade, ou "gravidade não definida"
- ❌ "crítico", "alta", "bloqueante"

### F. Número de passagem não vira meta
"Uns quatro segundos" para abrir a lista com mil fornecedores. "A gente não combinou meta nenhuma."
- ✅ observação ou pendência, sem meta
- ❌ "tempo de resposta acordado de 4 s", "meta de 2 s"

### G. Assunto que morre / pendência
Filtro por data, contraste das abas e acessibilidade: ninguém decidiu nem olhou.
- ✅ em aberto
- ❌ decisão ou ação com dono

### H. Participante ausente
Marcelo (financeiro) é citado por e-mail e não participou.
- ✅ não aparece como participante
- ❌ "Marcelo — participante"

### I. Cargo só quando dito
Otávio: "eu sou o PM aqui" → cargo dele pode aparecer (PM / gerente de produto).
Caio, Helena e Yasmin: cargo nunca dito → sem cargo.
- ❌ inventar cargo para Helena (dev), Caio ou Yasmin

## Em aberto ao fim
- filtro por data (por mês ou intervalo livre, sem decisão)
- contraste e acessibilidade das abas (ninguém olhou)
- duplicado de fornecedor (causa não confirmada; Helena investiga)
- campo de telefone que some ao trocar de aba (não reproduzido)
- lentidão da lista (observação; sem meta)

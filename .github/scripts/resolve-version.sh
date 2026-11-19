#!/usr/bin/env bash
#
# Decide a versão da release e imprime no formato que o GitHub Actions lê como
# saída de step. O release.yml a compara com a do package.json, que é a que
# vai no nome do zip.
#
# Existe porque `${GITHUB_REF_NAME#v}` inline só funciona quando a run vem de
# uma tag. Numa run disparada à mão a partir de um branch, `GITHUB_REF_NAME` é
# o nome do branch — e os artefatos saíam com o nome do branch no lugar da
# versão ("...-TaqCiti-Remake.pkg", no tempo dos instaladores).
#
# Ordem de decisão, do mais explícito para o mais implícito:
#   1. a versão passada como argumento, se houver;
#   2. a tag, quando a run veio de uma (`vX.Y.Z` -> `X.Y.Z`);
#   3. a versão do package.json.
#
# Uso: resolve-version.sh "<versao informada ou vazio>" >> "$GITHUB_OUTPUT"
set -euo pipefail

informada="${1:-}"

if [ -n "$informada" ]; then
  versao="${informada#v}"
  origem="campo da run"
elif [ "${GITHUB_REF_TYPE:-}" = "tag" ]; then
  versao="${GITHUB_REF_NAME#v}"
  origem="tag ${GITHUB_REF_NAME}"
else
  versao="$(node -p "require('./package.json').version")"
  origem="package.json"
fi

if [ -z "$versao" ]; then
  echo "Não consegui resolver a versão da release." >&2
  exit 1
fi

# A versão vira texto de comando nos passos seguintes (comparação no shell,
# nomes de arquivo). Qualquer coisa fora de semver — aspas, `&`, `$(` — seria
# injeção de comando no runner que guarda os segredos de publicação.
if ! [[ "$versao" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
  echo "Versão \"${versao}\" fora do formato X.Y.Z (ou X.Y.Z-sufixo). Nada foi compilado." >&2
  exit 1
fi

# stderr para aparecer no log sem sujar a saída do step.
echo "Versão da release: ${versao} (origem: ${origem})" >&2
echo "version=${versao}"
